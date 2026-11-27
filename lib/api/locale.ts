import { pickLocale, type Locale } from "../i18n/locales.ts";
import { prisma } from "../prisma.ts";

// The language of what a request gets back: the account's chosen one, else the app's
// Accept-Language. Looked up only when a route writes something, and once per request.
export function localeResolver(request: Request, userId?: string): () => Promise<Locale> {
  let pending: Promise<Locale> | undefined;
  return () => {
    pending ??= (async () => {
      const profile = userId
        ? await prisma.userProfile.findUnique({ select: { locale: true }, where: { userId } })
        : null;
      return pickLocale(profile?.locale, request.headers.get("accept-language"));
    })();
    return pending;
  };
}
