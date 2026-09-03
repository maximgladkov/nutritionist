import "server-only";
import { cookies } from "next/headers";
import { localeCookieOptions, LOCALE_COOKIE_NAME, type Locale } from "./locales";

export async function persistLocaleCookie(locale: Locale): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE_NAME, locale, localeCookieOptions());
}
