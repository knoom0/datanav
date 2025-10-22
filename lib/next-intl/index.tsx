"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type PropsWithChildren,
  type ReactNode,
} from "react";

export type Primitive = string | number | boolean | null | undefined | Date;
export type TranslationValues = Record<string, Primitive>;
export type AbstractIntlMessages = Record<string, string | AbstractIntlMessages>;

interface IntlContextValue {
  locale: string;
  messages: AbstractIntlMessages;
}

const DEFAULT_LOCALE = "en";

const IntlContext = createContext<IntlContextValue | null>(null);

function ensureObject(value: unknown): AbstractIntlMessages | undefined {
  if (value && typeof value === "object") {
    return value as AbstractIntlMessages;
  }
  return undefined;
}

function resolveMessage(
  key: string,
  source: AbstractIntlMessages | undefined
): string | AbstractIntlMessages | undefined {
  if (!source) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(source, key)) {
    return source[key];
  }

  const parts = key.split(".");
  if (parts.length === 1) {
    return undefined;
  }

  return parts.reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[part];
  }, source) as string | AbstractIntlMessages | undefined;
}

function interpolate(
  template: string,
  values: TranslationValues | undefined,
  locale: string
): string {
  if (!values) {
    return template;
  }

  return template.replace(/\{\{\s*(.*?)\s*\}\}/g, (_match, token) => {
    if (!Object.prototype.hasOwnProperty.call(values, token)) {
      return "";
    }

    const rawValue = values[token];
    if (rawValue === null || rawValue === undefined) {
      return "";
    }

    if (rawValue instanceof Date) {
      return new Intl.DateTimeFormat(locale).format(rawValue);
    }

    return String(rawValue);
  });
}

function useIntlContext(): IntlContextValue {
  const context = useContext(IntlContext);
  if (!context) {
    throw new Error("next-intl hooks must be used within NextIntlClientProvider");
  }
  return context;
}

export function NextIntlClientProvider({
  locale,
  messages,
  children,
}: PropsWithChildren<{ locale?: string; messages?: AbstractIntlMessages }>) {
  const value = useMemo<IntlContextValue>(() => ({
    locale: locale ?? DEFAULT_LOCALE,
    messages: messages ?? {},
  }), [locale, messages]);

  return (
    <IntlContext.Provider value={value}>
      {children as ReactNode}
    </IntlContext.Provider>
  );
}

export function useTranslations(namespace?: string) {
  const { locale, messages } = useIntlContext();
  const scopedMessages = useMemo(() => {
    if (!namespace) {
      return messages;
    }

    const resolved = resolveMessage(namespace, messages);
    return ensureObject(resolved) ?? {};
  }, [messages, namespace]);

  return useCallback((key: string, values?: TranslationValues) => {
    const resolved = resolveMessage(key, scopedMessages);
    const message = typeof resolved === "string" ? resolved : key;
    return interpolate(message, values, locale);
  }, [locale, scopedMessages]);
}

export function useLocale(): string {
  return useIntlContext().locale;
}

export function useFormatter() {
  const { locale } = useIntlContext();

  return useMemo(() => ({
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value),
    dateTime: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => {
      const date = value instanceof Date ? value : new Date(value);
      return new Intl.DateTimeFormat(locale, options).format(date);
    },
    relativeTime: (
      value: number,
      options?: Intl.RelativeTimeFormatOptions & { unit?: Intl.RelativeTimeFormatUnit }
    ) => {
      const { unit = "second", ...rest } = options ?? {};
      return new Intl.RelativeTimeFormat(locale, rest).format(value, unit);
    },
  }), [locale]);
}

export type IntlFormatters = ReturnType<typeof useFormatter>;
