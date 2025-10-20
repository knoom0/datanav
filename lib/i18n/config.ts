export const locales = ["en", "ko", "zh", "es"] as const;

export type Locale = typeof locales[number];

export const defaultLocale: Locale = "en";

export const localeLabels: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
  zh: "中文",
  es: "Español",
};

export const localeOptions = locales.map((locale) => ({
  value: locale,
  label: localeLabels[locale],
}));

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value);
}
