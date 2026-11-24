import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { OpenInBrowser } from "@/components/open-in-browser";
import en from "@/messages/en.json";
import "./globals.css";

const productSans = localFont({
  src: "./fonts/ProductSans-Regular.ttf",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gdgcloudhanoi.dev"),
  title: "DevFest Cloud Hanoi 2024 | GDG Cloud Hanoi",
  description: "Event by GDG Cloud Hanoi",
};

// This event page was English-only.
const locale = "en";
const messages = {
  devfestCloud2024: en.devfestCloud2024,
  openInBrowser: en.openInBrowser,
};

export default function RootLayout({
  children,
}: LayoutProps<"/events/devfest-cloud-2024">) {
  return (
    <html className="scroll-smooth" lang={locale}>
      <body className={`${productSans.className} antialiased`}>
        <AntdRegistry>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <OpenInBrowser>{children}</OpenInBrowser>
          </NextIntlClientProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
