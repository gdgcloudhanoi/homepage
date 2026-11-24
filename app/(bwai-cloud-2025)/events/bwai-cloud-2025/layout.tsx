import type { Metadata } from "next";
import "./globals.css";
import { ScrollProvider } from "./components/ScrollContext";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { cookies } from "next/headers";
import { OpenInBrowser } from "@/components/open-in-browser";
import en from "@/messages/en.json";
import vi from "@/messages/vi.json";

const googleSans = localFont({
  src: [
    {
      path: "../../../../public/bwai-cloud-2025/fonts/GoogleSans-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../../public/bwai-cloud-2025/fonts/GoogleSans-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../../../public/bwai-cloud-2025/fonts/GoogleSans-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../../../public/bwai-cloud-2025/fonts/GoogleSans-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../../../public/bwai-cloud-2025/fonts/GoogleSans-MediumItalic.ttf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../../../../public/bwai-cloud-2025/fonts/GoogleSans-BoldItalic.ttf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-google-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gdgcloudhanoi.dev"),
  title: "Build with AI Cloud Hanoi 2025",
  description: "By GDG Cloud Hanoi",
  keywords: ["AI", "Cloud", "GDG", "Hanoi", "Google"],
  openGraph: {
    title: "Build with AI Cloud Hanoi 2025",
    description: "By GDG Cloud Hanoi",
    url: "/events/bwai-cloud-2025",
    siteName: "Build with AI Cloud Hanoi 2025",
    type: "website",
    locale: "vi_VN",
  },
};

const catalogs = { en, vi };

// This event page follows the NEXT_LOCALE cookie set by its LanguageSwitcher
// (English by default); the rest of the site stays Vietnamese.
async function getLocale() {
  const cookie = (await cookies()).get("NEXT_LOCALE")?.value;
  return cookie === "vi" ? "vi" : "en";
}

export default async function RootLayout({
  children,
}: LayoutProps<"/events/bwai-cloud-2025">) {
  const locale = await getLocale();
  const messages = {
    bwaiCloud2025: catalogs[locale].bwaiCloud2025,
    openInBrowser: catalogs[locale].openInBrowser,
  };

  return (
    <html lang={locale}>
      <body className={`${googleSans.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <OpenInBrowser>
            <ScrollProvider>{children}</ScrollProvider>
          </OpenInBrowser>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
