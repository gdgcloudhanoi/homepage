export type AnalyticsEvent =
  | "register_click"
  | "register_invalid"
  | "register_duplicate"
  | "register_failed"
  | "sign_up"
  | "ticket_open"
  | "qr_download"
  | "photo_view"
  | "photo_download"
  | "photo_share"
  | "face_search"
  | "LCP"
  | "INP"
  | "CLS";

export type Consent = "granted" | "denied";

type Params = Record<string, string | number>;
type Gtag = (...args: unknown[]) => void;

const HOST = "gdgcloudhanoi.dev";
const MEASUREMENT_ID = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
const CONSENT_KEY = "analytics-consent";
const debug = process.env.NODE_ENV === "development";

let gtag: Gtag | undefined;
const listeners = new Set<() => void>();

const isPublicPage = () =>
  typeof window !== "undefined" && !location.pathname.startsWith("/platform");

export function readConsent(): Consent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function subscribeConsent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function writeConsent(value: Consent | null) {
  try {
    if (value) localStorage.setItem(CONSENT_KEY, value);
    else localStorage.removeItem(CONSENT_KEY);
  } catch {}
  listeners.forEach((listener) => listener());
}

// We never run ads, so the ad signals stay denied whatever the visitor picks.
const consentSettings = (granted: boolean) =>
  ({
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  }) as const;

// Keeps only utm_*: ?ticket= carries the attendee's email and /qr's ?c= is free text.
export function cleanLocation() {
  const { origin, pathname, searchParams } = new URL(location.href);
  const query = new URLSearchParams();
  searchParams.forEach((value, key) => {
    if (key.startsWith("utm_")) query.append(key, value);
  });
  return `${origin}${pathname}${query.size ? `?${query}` : ""}`;
}

// Plain gtag.js with Consent Mode v2: until the visitor agrees, GA only gets cookieless pings.
// No Firebase SDK here, since it would store an Installations ID before consent.
function load(): Gtag | undefined {
  if (gtag) return gtag;
  if (!MEASUREMENT_ID || !isPublicPage() || location.hostname !== HOST) return undefined;
  const dataLayer: unknown[] = ((window as { dataLayer?: unknown[] }).dataLayer ??= []);
  gtag = function () {
    // gtag.js only accepts the Arguments object, not an array.
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  gtag("consent", "default", consentSettings(readConsent() === "granted"));
  gtag("js", new Date());
  gtag("config", MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: cleanLocation(),
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);
  return gtag;
}

export function startAnalytics() {
  load();
}

export function track(name: AnalyticsEvent, params?: Params) {
  if (!isPublicPage()) return;
  if (debug) console.debug("[analytics]", name, params ?? {});
  load()?.("event", name, params ?? {});
}

export function trackPageView() {
  if (!isPublicPage()) return;
  const page_location = cleanLocation();
  if (debug) console.debug("[analytics]", "page_view", { page_location });
  const send = load();
  if (!send) return;
  send("set", { page_location });
  send("event", "page_view", {
    page_location,
    page_path: location.pathname,
    page_title: document.title,
  });
}

function deleteGaCookies() {
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0];
    if (name.startsWith("_ga")) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${HOST}`;
    }
  }
}

export function setAnalyticsConsent(granted: boolean) {
  writeConsent(granted ? "granted" : "denied");
  if (!granted) deleteGaCookies();
  load()?.("consent", "update", consentSettings(granted));
}

// Shows the banner again; consent keeps its current state until the visitor picks.
export function reopenConsent() {
  writeConsent(null);
}
