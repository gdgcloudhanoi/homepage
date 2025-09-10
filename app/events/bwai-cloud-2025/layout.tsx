import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/app/events/bwai-cloud-2025/components/ui/sonner";
import { ScrollProvider } from "@/app/events/bwai-cloud-2025/components/ScrollContext";
import localFont from "next/font/local";
import AppCheckProvider from "@/app/events/bwai-cloud-2025/components/AppCheckProvider";
import { NextIntlClientProvider } from "next-intl";
import { BrowserRequired } from "@/app/events/bwai-cloud-2025/components/BrowserRequired";

const googleSans = localFont({
  src: [
    {
      path: "../../../public/bwai-cloud-2025/fonts/GoogleSans-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../public/bwai-cloud-2025/fonts/GoogleSans-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../../public/bwai-cloud-2025/fonts/GoogleSans-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../../public/bwai-cloud-2025/fonts/GoogleSans-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../../public/bwai-cloud-2025/fonts/GoogleSans-MediumItalic.ttf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../../../public/bwai-cloud-2025/fonts/GoogleSans-BoldItalic.ttf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-google-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || ""),
  title: "Build with AI Cloud Hanoi 2025",
  description: "By GDG Cloud Hanoi",
  keywords: ["AI", "Cloud", "GDG", "Hanoi", "Google"],
  openGraph: {
    title: "Build with AI Cloud Hanoi 2025",
    description: "By GDG Cloud Hanoi",
    url: `${process.env.NEXT_PUBLIC_SITE_URL}`,
    siteName: "Build with AI Cloud Hanoi 2025",
    images: [
      {
        url: `${process.env.NEXT_PUBLIC_APP_URL}/og`,
        width: 1200,
        height: 630,
        alt: "Build with AI Cloud Hanoi 2025",
      },
    ],
    type: "website",
    locale: "vi_VN",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <body className={`${googleSans.variable} antialiased`}>
        <NextIntlClientProvider>
          <BrowserRequired>
            <AppCheckProvider>
              <ScrollProvider>
                {children}
                <Toaster />
              </ScrollProvider>
            </AppCheckProvider>
          </BrowserRequired>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
