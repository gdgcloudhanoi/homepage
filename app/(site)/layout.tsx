import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Analytics } from "@/components/analytics";
import { OpenInBrowser } from "@/components/open-in-browser";
import { Google_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const googleSans = Google_Sans({
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
  adjustFontFallback: false,
  fallback: [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

const description =
  "Cộng đồng phi lợi nhuận, độc lập của các lập trình viên Google Cloud tại Hà Nội từ 2019. Đơn vị tổ chức DevFest Cloud Hanoi, #QuanQuanGCP và Build with AI.";

export const metadata: Metadata = {
  metadataBase: new URL("https://gdgcloudhanoi.dev"),
  title: {
    default: "GDG Cloud Hanoi",
    template: "%s | GDG Cloud Hanoi",
  },
  description,
  applicationName: "GDG Cloud Hanoi",
  openGraph: {
    type: "website",
    siteName: "GDG Cloud Hanoi",
    locale: "vi_VN",
    title: "GDG Cloud Hanoi",
    description,
  },
  twitter: {
    card: "summary_large_image",
    site: "@GDGCloudHanoi",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={cn(
        "h-full",
        "antialiased",
        "font-sans",
        "motion-safe:scroll-smooth",
        googleSans.variable
      )}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <TooltipProvider>
            <OpenInBrowser>{children}</OpenInBrowser>
          </TooltipProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
