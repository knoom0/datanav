import { cookies } from "next/headers";
import type React from "react";

import { ConsoleProviders } from "@/components/console-providers";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { messages } from "@/lib/i18n/messages";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieLocale = cookies().get("NEXT_LOCALE")?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return (
    <html lang={locale}>
      <body>
        <ConsoleProviders locale={locale} messages={messages[locale]}>
          {children}
        </ConsoleProviders>
      </body>
    </html>
  );
}
