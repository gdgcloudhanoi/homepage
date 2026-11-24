import type { Config } from "tailwindcss";

// Tailwind 3 config of the original DevFest 2024 app, loaded via `@config`.
// Colors are pinned to the v3 palette (v4 switched to OKLCH).
const config: Config = {
  content: ["./**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: { 50: "#f8fafc" },
        gray: {
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827",
        },
        blue: { 400: "#60a5fa", 600: "#2563eb", 700: "#1d4ed8" },
        pink: { 500: "#ec4899" },
      },
    },
  },
};

export default config;
