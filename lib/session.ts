import { decode, getToken } from "next-auth/jwt";
import { prisma } from "./prisma";
import type { UserRecord } from "./identity-core";

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (trimmed.slice(0, eq) === name) {
      return decodeURIComponent(trimmed.slice(eq + 1));
    }
  }
  return undefined;
}

function sessionCookieNames(): string[] {
  return ["__Secure-authjs.session-token", "authjs.session-token"];
}

export async function getUserFromRequest(request: Request): Promise<UserRecord | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return null;
  }

  const jwt = await getToken({ req: request, secret });
  if (typeof jwt?.sub === "string" && jwt.sub.length > 0) {
    const user = await prisma.user.findUnique({ where: { id: jwt.sub } });
    return user ? { id: user.id, email: user.email, name: user.name } : null;
  }

  for (const cookieName of sessionCookieNames()) {
    const raw = readCookie(request, cookieName);
    if (!raw) {
      continue;
    }
    const decoded = await decode<{ sessionToken?: string; sub?: string }>({
      token: raw,
      secret,
      salt: cookieName,
    });
    const sessionToken =
      (typeof decoded?.sessionToken === "string" && decoded.sessionToken) ||
      (decoded == null ? raw : undefined);
    const userId = typeof decoded?.sub === "string" ? decoded.sub : undefined;
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        return { id: user.id, email: user.email, name: user.name };
      }
    }
    if (sessionToken) {
      const session = await prisma.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      if (session && session.expires.getTime() > Date.now()) {
        return {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        };
      }
    }
  }

  return null;
}

export function eveSessionIdFromPath(pathname: string): string | undefined {
  const match = /^\/eve\/v1\/session\/([^/]+)/.exec(pathname);
  const sessionId = match?.[1];
  if (!sessionId || sessionId === "cancel" || sessionId.length === 0) {
    return undefined;
  }
  return decodeURIComponent(sessionId);
}
