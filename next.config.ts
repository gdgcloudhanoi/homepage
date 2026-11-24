import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/**",
      },
    ],
  },
  allowedDevOrigins: ['192.168.2.48'],
};

const withNextIntl = createNextIntlPlugin();

// Plugin names as strings: Turbopack can't take plugin functions.
const withMDX = createMDX({
  options: { remarkPlugins: ["remark-gfm"] },
});

export default withNextIntl(withMDX(nextConfig));
