import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  clearAuthSessionCookies,
  hasAuthSessionCookie,
  readAuthJwt,
} from "./lib/auth-cookies";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = await readAuthJwt(request);
  const staleCookie = hasAuthSessionCookie(request) && token === null;
  const telegramEmbed =
    pathname.startsWith("/summary") && request.nextUrl.searchParams.get("embed") === "tg";

  if (pathname === "/login") {
    if (!staleCookie) {
      return NextResponse.next();
    }
    return clearAuthSessionCookies(NextResponse.next());
  }

  if (telegramEmbed) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tg-embed", "1");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (
    pathname === "/" ||
    pathname.startsWith("/s") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/summary")
  ) {
    if (token) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(url);
    if (staleCookie) {
      return clearAuthSessionCookies(response);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/s/:path*", "/settings", "/summary", "/login"],
};
