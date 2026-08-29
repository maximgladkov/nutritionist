import { getToken } from "next-auth/jwt";
import type { JWT } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const AUTH_SESSION_COOKIE_NAMES = [
  "authjs.nutritionist.session-token",
  "__Secure-authjs.nutritionist.session-token",
] as const;

function useSecureAuthCookies(): boolean {
  return process.env.AUTH_URL?.startsWith("https://") === true;
}

export function authJsCookies() {
  const secure = useSecureAuthCookies();
  const hostPrefix = secure ? "__Host-" : "";
  const securePrefix = secure ? "__Secure-" : "";
  const options = {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure,
  };
  return {
    callbackUrl: {
      name: `${securePrefix}authjs.nutritionist.callback-url`,
      options,
    },
    csrfToken: {
      name: `${hostPrefix}authjs.nutritionist.csrf-token`,
      options,
    },
    nonce: {
      name: `${securePrefix}authjs.nutritionist.nonce`,
      options,
    },
    pkceCodeVerifier: {
      name: `${securePrefix}authjs.nutritionist.pkce.code_verifier`,
      options: { ...options, maxAge: 60 * 15 },
    },
    sessionToken: {
      name: `${securePrefix}authjs.nutritionist.session-token`,
      options,
    },
    state: {
      name: `${securePrefix}authjs.nutritionist.state`,
      options: { ...options, maxAge: 60 * 15 },
    },
  };
}

export function hasAuthSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) =>
    AUTH_SESSION_COOKIE_NAMES.some(
      (prefix) => cookie.name === prefix || cookie.name.startsWith(`${prefix}.`),
    ),
  );
}

export async function readAuthJwt(req: {
  headers: Headers;
}): Promise<JWT | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return null;
  }
  for (const cookieName of AUTH_SESSION_COOKIE_NAMES) {
    try {
      const token = await getToken({
        cookieName,
        req,
        salt: cookieName,
        secret,
      });
      if (token) {
        return token;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function clearAuthSessionCookies(response: NextResponse): NextResponse {
  const base = {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax" as const,
    value: "",
  };
  for (const name of AUTH_SESSION_COOKIE_NAMES) {
    const secure = name.startsWith("__Secure-");
    response.cookies.set({ ...base, name, secure });
    for (let index = 0; index < 8; index += 1) {
      response.cookies.set({ ...base, name: `${name}.${index}`, secure });
    }
  }
  return response;
}
