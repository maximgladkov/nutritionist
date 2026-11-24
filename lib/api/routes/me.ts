import { z } from "zod";
import { listCountries, normalizeCountryCode } from "../../countries.ts";
import { GOAL_FIELDS, GOAL_SPECS } from "../../goal-values.ts";
import { getGoals, saveGoals } from "../../goals.ts";
import { isLocale, locales, resolveLocale } from "../../i18n/locales.ts";
import { consumeLinkCode, createLinkCode } from "../../identity.ts";
import { prisma } from "../../prisma.ts";
import {
  avatarUrl,
  fillProfileDetails,
  readGender,
  readSettled,
  saveProfileDetails,
  type FillField,
  type ProfileGender,
} from "../../profile.ts";
import { REMINDER_LABELS, isReminderLabel } from "../../reminder-clock.ts";
import { ensureDefaultReminders, listReminders, rescheduleReminders, saveReminders } from "../../reminders.ts";
import { listTimeZones, normalizeTimezone } from "../../timezone.ts";
import { invalid, notFound } from "../errors.ts";
import { noContent, readJson } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import { birthDateSchema, genderSchema, heightSchema } from "../schemas.ts";
import { issueTokens } from "../tokens.ts";
import { ApiError } from "../errors.ts";
import { apiDeps } from "../deps.ts";

// Known preferences and their allowed values; anything else is rejected, so stored preferences
// stay well-formed for every client.
const NUTRIENT_KEYS = ["kcal", "protein", "carbs", "fat"] as const;
export const preferencesSchema = z
  .object({
    // Order nutrients appear in across the app; must list each nutrient exactly once.
    nutrientOrder: z
      .array(z.enum(NUTRIENT_KEYS))
      .length(NUTRIENT_KEYS.length)
      .refine((order) => new Set(order).size === order.length, "List each nutrient once."),
  })
  .partial()
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;

function readPreferences(value: unknown): Preferences {
  const parsed = preferencesSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

export type MeView = {
  avatarUrl: string | null;
  birthDate: string | null;
  country: string | null;
  email: string | null;
  gender: ProfileGender | null;
  heightCm: number | null;
  id: string;
  linkedChannels: string[];
  locale: string;
  name: string | null;
  plan: "free";
  preferences: Preferences;
  // Details the person set or cleared themselves, which connected apps no longer fill in.
  settledFields: FillField[];
  timezone: string | null;
};

export async function toMeView(userId: string): Promise<MeView> {
  const user = await prisma.user.findUnique({
    include: { identities: { select: { provider: true } }, profile: true },
    where: { id: userId },
  });
  if (!user) {
    throw notFound("Account not found.");
  }
  return {
    avatarUrl: avatarUrl(user.profile),
    birthDate: user.profile?.birthDate ?? null,
    country: user.profile?.country ?? null,
    email: user.email,
    gender: readGender(user.profile?.gender),
    heightCm: user.profile?.heightCm ?? null,
    id: user.id,
    linkedChannels: [...new Set(user.identities.map((identity) => identity.provider))].sort(),
    locale: resolveLocale(user.profile?.locale),
    name: user.name,
    plan: "free",
    preferences: readPreferences(user.profile?.preferences),
    settledFields: readSettled(user.profile?.settledFields),
    timezone: user.profile?.timezone ?? null,
  };
}

const UNLINKABLE = new Set(["apple", "telegram", "whatsapp"]);
const SIGN_IN_PROVIDERS = new Set(["apple", "email"]);

const goalNumber = (field: (typeof GOAL_FIELDS)[number]) =>
  z.number().int().min(GOAL_SPECS[field].min).max(GOAL_SPECS[field].max).nullable().optional();

const goalsPatchSchema = z
  .object({
    caloriesPerDay: goalNumber("caloriesPerDay"),
    carbsGPerDay: goalNumber("carbsGPerDay"),
    fatGPerDay: goalNumber("fatGPerDay"),
    fiberGPerDay: goalNumber("fiberGPerDay"),
    goalWeightKg: z.number().min(20).max(400).nullable().optional(),
    proteinGPerDay: goalNumber("proteinGPerDay"),
  })
  .strict();

async function goalsView(userId: string) {
  const [goals, profile] = await Promise.all([
    getGoals(userId),
    prisma.userProfile.findUnique({ select: { goalWeightKg: true }, where: { userId } }),
  ]);
  return { ...goals, goalWeightKg: profile?.goalWeightKg ?? null };
}

async function remindersView(userId: string) {
  const state = await listReminders(userId);
  return {
    reminders: state.reminders.map((row) => ({
      enabled: row.enabled,
      hour: row.hour,
      label: row.label,
      minute: row.minute,
      nextRunAt: row.nextRunAt,
    })),
    timezone: state.timezone,
  };
}

const reminderPatchSchema = z.object({
  reminders: z
    .array(
      z.object({
        enabled: z.boolean().optional(),
        hour: z.number().int().min(0).max(23).optional(),
        label: z.string().refine(isReminderLabel, "Choose breakfast, lunch, dinner, or summary."),
        minute: z.number().int().min(0).max(59).optional(),
      }),
    )
    .min(1)
    .max(REMINDER_LABELS.length),
});

export const meRoutes: RouteDefinition[] = [
  { handler: async ({ user }) => toMeView(user.id), method: "GET", path: "/me" },
  {
    async handler({ request, user }) {
      const body = await readJson(
        request,
        z
          .object({
            birthDate: birthDateSchema.nullable().optional(),
            country: z.string().trim().nullable().optional(),
            gender: genderSchema.nullable().optional(),
            heightCm: heightSchema.nullable().optional(),
            locale: z.string().optional(),
            name: z.string().trim().min(1).max(80).nullable().optional(),
            // Merged into what's stored: sending one preference leaves the others as they are.
            preferences: preferencesSchema.optional(),
            timezone: z.string().trim().nullable().optional(),
          })
          .strict(),
      );
      const profile: { country?: string | null; locale?: string; preferences?: Preferences; timezone?: string | null } = {};
      if (body.preferences !== undefined) {
        const current = await prisma.userProfile.findUnique({ select: { preferences: true }, where: { userId: user.id } });
        profile.preferences = { ...readPreferences(current?.preferences), ...body.preferences };
      }
      if (body.locale !== undefined) {
        if (!isLocale(body.locale)) {
          throw invalid(`Choose one of: ${locales.join(", ")}.`);
        }
        profile.locale = body.locale;
      }
      if (body.country !== undefined) {
        const country = body.country ? normalizeCountryCode(body.country) : null;
        if (body.country && !country) {
          throw invalid("Choose a valid country.");
        }
        profile.country = country;
      }
      if (body.timezone !== undefined) {
        const timezone = body.timezone ? normalizeTimezone(body.timezone) : null;
        if (body.timezone && !timezone) {
          throw invalid("Choose a valid time zone.");
        }
        profile.timezone = timezone;
      }
      await saveProfileDetails(user.id, {
        birthDate: body.birthDate,
        gender: body.gender,
        heightCm: body.heightCm,
        name: body.name,
      });
      if (Object.keys(profile).length > 0) {
        await prisma.userProfile.upsert({
          create: { userId: user.id, ...profile },
          update: profile,
          where: { userId: user.id },
        });
      }
      if (profile.timezone) {
        await ensureDefaultReminders(user.id, profile.timezone);
        await rescheduleReminders(user.id, profile.timezone);
      }
      return toMeView(user.id);
    },
    method: "PATCH",
    path: "/me",
  },
  { handler: async ({ user }) => goalsView(user.id), method: "GET", path: "/me/goals" },
  {
    async handler({ request, user }) {
      const { goalWeightKg, ...patch } = await readJson(request, goalsPatchSchema);
      if (Object.keys(patch).length > 0) {
        await saveGoals(user.id, patch);
      }
      if (goalWeightKg !== undefined) {
        await prisma.userProfile.upsert({
          create: { goalWeightKg, userId: user.id },
          update: { goalWeightKg },
          where: { userId: user.id },
        });
      }
      return goalsView(user.id);
    },
    method: "PUT",
    path: "/me/goals",
  },
  { handler: async ({ user }) => remindersView(user.id), method: "GET", path: "/me/reminders" },
  {
    async handler({ request, user }) {
      const body = await readJson(request, reminderPatchSchema);
      await saveReminders({
        patches: body.reminders.map((patch) => ({ ...patch, label: patch.label as (typeof REMINDER_LABELS)[number] })),
        userId: user.id,
      });
      return remindersView(user.id);
    },
    method: "PUT",
    path: "/me/reminders",
  },
  {
    async handler({ request, user }) {
      const body = await readJson(
        request,
        z.object({
          platform: z.enum(["ios", "android", "web"]),
          token: z.string().trim().min(10).max(300),
        }),
      );
      // A device token belongs to whoever signed in on it last.
      const device = await prisma.pushDevice.upsert({
        create: { platform: body.platform, token: body.token, userId: user.id },
        update: { platform: body.platform, userId: user.id },
        where: { token: body.token },
      });
      return { id: device.id, platform: device.platform, token: device.token };
    },
    method: "POST",
    path: "/me/devices",
  },
  {
    async handler({ params, user }) {
      await prisma.pushDevice.deleteMany({ where: { token: params.token, userId: user.id } });
      return noContent();
    },
    method: "DELETE",
    path: "/me/devices/:token",
  },
  {
    async handler({ user }) {
      const link = await createLinkCode(user.id);
      const bot = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
      return {
        code: link.code,
        expiresAt: link.expiresAt.toISOString(),
        telegramBotUrl: bot ? `https://t.me/${bot}` : null,
      };
    },
    method: "POST",
    path: "/me/link-codes",
  },
  {
    async handler({ request, user }) {
      const body = await readJson(request, z.object({ code: z.string().trim().min(1) }));
      const result = await consumeLinkCode(body.code, user.id);
      if (result.status !== "merged" && result.status !== "linked" && result.status !== "already") {
        throw invalid("That code is not valid or expired.");
      }
      // A merge can keep the other account, so hand back tokens for whichever one survived.
      const survivorId = result.user.id;
      const tokens = survivorId === user.id ? undefined : await issueTokens(survivorId);
      return { me: await toMeView(survivorId), status: result.status, tokens };
    },
    method: "POST",
    path: "/me/link-codes/consume",
  },
  {
    async handler({ request, user }) {
      const body = await readJson(
        request,
        z.object({ fullName: z.string().trim().max(80).optional(), identityToken: z.string().min(20) }),
      );
      let apple;
      try {
        apple = await apiDeps().verifyAppleToken(body.identityToken);
      } catch {
        throw new ApiError(401, "unauthorized", "Apple sign-in failed. Try again.");
      }
      const existing = await prisma.channelIdentity.findUnique({
        where: { provider_providerUserId: { provider: "apple", providerUserId: apple.sub } },
      });
      if (existing && existing.userId !== user.id) {
        throw new ApiError(409, "already_linked", "That Apple ID already opens another Btr.me account. Use a link code to join the two.");
      }
      if (!existing) {
        await prisma.channelIdentity.create({ data: { provider: "apple", providerUserId: apple.sub, userId: user.id } });
      }
      if (body.fullName) {
        await fillProfileDetails(user.id, { name: body.fullName });
      }
      return toMeView(user.id);
    },
    method: "POST",
    path: "/me/linked-channels/apple",
  },
  {
    async handler({ params, user }) {
      const provider = params.provider ?? "";
      if (!UNLINKABLE.has(provider)) {
        throw invalid("Choose apple, telegram, or whatsapp.");
      }
      const identities = await prisma.channelIdentity.findMany({ where: { userId: user.id } });
      if (!identities.some((identity) => identity.provider === provider)) {
        throw notFound("That account is not linked.");
      }
      const signInLeft = identities.some((identity) => SIGN_IN_PROVIDERS.has(identity.provider) && identity.provider !== provider);
      if (SIGN_IN_PROVIDERS.has(provider) && !signInLeft) {
        throw new ApiError(409, "last_sign_in_method", "Add another way to sign in before removing this one.");
      }
      await prisma.channelIdentity.deleteMany({ where: { provider, userId: user.id } });
      return toMeView(user.id);
    },
    method: "DELETE",
    path: "/me/linked-channels/:provider",
  },
  {
    async handler({ user }) {
      // Cascades to meals, goals, groups the user owns, tokens and identities.
      await prisma.user.delete({ where: { id: user.id } });
      return noContent();
    },
    method: "DELETE",
    path: "/me",
  },
  {
    auth: false,
    async handler({ url }) {
      const locale = resolveLocale(url.searchParams.get("locale"));
      return { countries: listCountries(locale), locales: [...locales], timeZones: listTimeZones() };
    },
    method: "GET",
    path: "/meta/options",
  },
];
