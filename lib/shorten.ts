import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

export type RedirectCode = 307 | 308;

export type ShortUrl = {
  name?: string;
  url: string;
  code?: RedirectCode;
  exp?: Timestamp;
};

const REDIRECT_CODES = new Set<number>([307, 308]);

export async function resolveShortUrl(
  key: string,
  base: string | URL,
): Promise<{ url: URL; code: RedirectCode } | null> {
  const snapshot = await getAdminDb().doc(`url/${key}`).get();
  const data = snapshot.data() as Partial<ShortUrl> | undefined;

  if (!data || typeof data.url !== "string" || isExpired(data.exp)) {
    return null;
  }

  const url = toHttpUrl(data.url, base);
  if (!url) {
    return null;
  }

  const code =
    typeof data.code === "number" && REDIRECT_CODES.has(data.code)
      ? data.code
      : 307;

  return { url, code };
}

export async function recordShortUrlClick(key: string) {
  await getAdminDb().doc(`url/${key}`).update({ clicks: FieldValue.increment(1) });
}

function isExpired(exp: unknown): boolean {
  return exp instanceof Timestamp && exp.toMillis() <= Date.now();
}

function toHttpUrl(value: string, base: string | URL): URL | null {
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
