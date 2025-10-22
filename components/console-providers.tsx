"use client";

import { MantineProvider } from "@mantine/core";
import type React from "react";

import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";

import { AppTitleProvider } from "@/components/app-title-context";
import { ConsoleLayout } from "@/components/console-layout";
import type { Locale } from "@/lib/i18n/config";

interface ConsoleProvidersProps {
  children: React.ReactNode;
  locale: Locale;
  messages: AbstractIntlMessages;
}

export function ConsoleProviders({ children, locale, messages }: ConsoleProvidersProps) {
  return (
    <MantineProvider theme={{ primaryColor: "orange" }}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AppTitleProvider>
          <ConsoleLayout>
            {children}
          </ConsoleLayout>
        </AppTitleProvider>
      </NextIntlClientProvider>
    </MantineProvider>
  );
}
