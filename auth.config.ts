import type { NextAuthConfig } from "next-auth";
import { authJsCookies } from "./lib/auth-cookies";

export const authConfig = {
  cookies: authJsCookies(),
  providers: [],
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/login" || pathname.startsWith("/api/auth")) {
        return true;
      }
      if (pathname === "/" || pathname.startsWith("/s") || pathname.startsWith("/settings")) {
        return Boolean(auth?.user);
      }
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (typeof token.id === "string" ? token.id : token.sub) ?? "";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
