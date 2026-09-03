import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { authConfig } from "./auth.config";
import { APP_NAME } from "./lib/brand";
import { ensureEmailIdentity, resolveChannelUser } from "./lib/identity";
import { prisma } from "./lib/prisma";
import { verifyTelegramLoginWidget } from "./lib/telegram-login-widget";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Resend({
      from: process.env.AUTH_EMAIL_FROM ?? `${APP_NAME} <onboarding@resend.dev>`,
    }),
    Credentials({
      id: "telegram",
      credentials: {
        auth_date: {},
        first_name: {},
        hash: {},
        id: {},
        last_name: {},
        photo_url: {},
        username: {},
      },
      async authorize(credentials) {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken || !credentials) {
          return null;
        }
        try {
          const telegramUser = verifyTelegramLoginWidget(credentials, botToken);
          const record = await resolveChannelUser({
            name:
              [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(" ") ||
              telegramUser.username,
            provider: "telegram",
            providerUserId: String(telegramUser.id),
          });
          return {
            id: record.id,
            name: record.name ?? telegramUser.firstName,
            image: telegramUser.photoUrl,
          };
        } catch {
          return null;
        }
      },
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
