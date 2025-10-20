import type { PropsWithChildren } from "react"

export type AbstractIntlMessages = Record<string, unknown>

type TranslationValues = Record<string, unknown>

type TranslationFunction = (key: string, values?: TranslationValues) => string

type Formatter = {
  number: (value: number) => string
  dateTime: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string
  relativeTime: (
    value: number,
    options?: Intl.RelativeTimeFormatOptions & { unit?: Intl.RelativeTimeFormatUnit }
  ) => string
}

const DEFAULT_LOCALE = "en"

export function useTranslations(): TranslationFunction {
  return (key, values) => {
    if (!values) {
      return key
    }

    return key.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, token) => {
      if (Object.prototype.hasOwnProperty.call(values, token)) {
        const value = values[token]
        return value === undefined || value === null ? "" : String(value)
      }
      return ""
    })
  }
}

export function useLocale(): string {
  return DEFAULT_LOCALE
}

export function useFormatter(): Formatter {
  return {
    number: (value: number) => new Intl.NumberFormat(DEFAULT_LOCALE).format(value),
    dateTime: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => {
      const date = value instanceof Date ? value : new Date(value)
      return new Intl.DateTimeFormat(DEFAULT_LOCALE, options).format(date)
    },
    relativeTime: (
      value: number,
      options?: Intl.RelativeTimeFormatOptions & { unit?: Intl.RelativeTimeFormatUnit }
    ) => {
      const { unit = "second", ...rest } = options ?? {}
      return new Intl.RelativeTimeFormat(DEFAULT_LOCALE, rest).format(value, unit)
    }
  }
}

export function NextIntlClientProvider({ children }: PropsWithChildren<{ locale?: string; messages?: AbstractIntlMessages }>) {
  return (children ?? null) as any
}
