import { getRequestConfig } from "next-intl/server";

// The site is Vietnamese-only. Old event pages pick their own locale and pass
// it explicitly (e.g. `getTranslations({ locale })`), which arrives here.
const locales = ["vi", "en"] as const;

export default getRequestConfig(async ({ locale: requested }) => {
  const locale = locales.find((l) => l === requested) ?? "vi";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
