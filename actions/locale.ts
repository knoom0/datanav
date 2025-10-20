"use server";

import { cookies } from "next/headers";

import { defaultLocale, isLocale } from "@/lib/i18n/config";

const LOCALE_COOKIE = "NEXT_LOCALE";

export async function setLocale(locale: string) {
  const targetLocale = isLocale(locale) ? locale : defaultLocale;

  cookies().set(LOCALE_COOKIE, targetLocale, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}
