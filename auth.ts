import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Resend from "next-auth/providers/resend";
import { authConfig } from "./auth.config";
import { ensureEmailIdentity } from "./lib/identity";
import { prisma } from "./lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Resend({
      from: process.env.AUTH_EMAIL_FROM ?? "Nutritionist <onboarding@resend.dev>",
    }),
  ],
  events: {
    async createUser({ user }) {
      if (user.id && user.email) {
        await ensureEmailIdentity(user.id, user.email);
      }
    },
    async signIn({ user }) {
      if (user.id && user.email) {
        await ensureEmailIdentity(user.id, user.email);
      }
    },
  },
});
