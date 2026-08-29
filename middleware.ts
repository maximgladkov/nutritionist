import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  clearAuthSessionCookies,
  hasAuthSessionCookie,
  readAuthJwt,
} from "./lib/auth-cookies";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = await readAuthJwt(request);
  const staleCookie = hasAuthSessionCookie(request) && token === null;

  if (pathname === "/login") {
    if (!staleCookie) {
      return NextResponse.next();
    }
    return clearAuthSessionCookies(NextResponse.next());
  }

  if (pathname === "/" || pathname.startsWith("/s") || pathname.startsWith("/settings")) {
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
  matcher: ["/", "/s/:path*", "/settings", "/login"],
};
