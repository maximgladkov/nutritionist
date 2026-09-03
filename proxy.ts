import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  clearAuthSessionCookies,
  hasAuthSessionCookie,
  readAuthJwt,
} from "./lib/auth-cookies";
import { isLocale, localeCookieOptions, LOCALE_COOKIE_NAME, negotiateLocale } from "./lib/i18n/locales";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = await readAuthJwt(request);
  const staleCookie = hasAuthSessionCookie(request) && token === null;
  const telegramEmbed =
    pathname.startsWith("/summary") && request.nextUrl.searchParams.get("embed") === "tg";

  if (pathname === "/login") {
    if (!staleCookie) {
      return withLocaleCookie(request, NextResponse.next());
    }
    return withLocaleCookie(request, clearAuthSessionCookies(NextResponse.next()));
  }

  if (telegramEmbed) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tg-embed", "1");
    return withLocaleCookie(request, NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (
    pathname === "/" ||
    pathname.startsWith("/s") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/summary")
  ) {
    if (token) {
      return withLocaleCookie(request, NextResponse.next());
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(url);
    if (staleCookie) {
      return withLocaleCookie(request, clearAuthSessionCookies(response));
    }
    return withLocaleCookie(request, response);
  }

  return withLocaleCookie(request, NextResponse.next());
}

export const config = {
  matcher: ["/", "/s/:path*", "/settings", "/summary", "/login"],
};

function withLocaleCookie(request: NextRequest, response: NextResponse): NextResponse {
  const existing = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (existing && isLocale(existing)) {
    return response;
  }
  response.cookies.set(
    LOCALE_COOKIE_NAME,
    negotiateLocale(request.headers.get("accept-language")),
    localeCookieOptions(),
  );
  return response;
}
