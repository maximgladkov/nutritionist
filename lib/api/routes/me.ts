import { z } from "zod";
import { listCountries, normalizeCountryCode } from "../../countries.ts";
import { GOAL_FIELDS, GOAL_SPECS } from "../../goal-values.ts";
import { getGoals, saveGoals } from "../../goals.ts";
import { isLocale, locales, resolveLocale } from "../../i18n/locales.ts";
import { consumeLinkCode, createLinkCode } from "../../identity.ts";
import { prisma } from "../../prisma.ts";
import { REMINDER_LABELS, isReminderLabel } from "../../reminder-clock.ts";
import { ensureDefaultReminders, listReminders, rescheduleReminders, saveReminders } from "../../reminders.ts";
import { listTimeZones, normalizeTimezone } from "../../timezone.ts";
import { invalid, notFound } from "../errors.ts";
import { noContent, readJson } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import { issueTokens } from "../tokens.ts";

export type MeView = {
  country: string | null;
  email: string | null;
  id: string;
  linkedChannels: string[];
  locale: string;
  name: string | null;
  plan: "free";
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
    country: user.profile?.country ?? null,
    email: user.email,
    id: user.id,
    linkedChannels: [...new Set(user.identities.map((identity) => identity.provider))].sort(),
    locale: resolveLocale(user.profile?.locale),
    name: user.name,
    plan: "free",
    timezone: user.profile?.timezone ?? null,
  };
}

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
            country: z.string().trim().nullable().optional(),
            locale: z.string().optional(),
            name: z.string().trim().min(1).max(80).optional(),
            timezone: z.string().trim().nullable().optional(),
          })
          .strict(),
      );
      const profile: { country?: string | null; locale?: string; timezone?: string | null } = {};
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
      if (body.name !== undefined) {
        await prisma.user.update({ data: { name: body.name }, where: { id: user.id } });
      }
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
      return { code: link.code, expiresAt: link.expiresAt.toISOString() };
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
    auth: false,
    async handler({ url }) {
      const locale = resolveLocale(url.searchParams.get("locale"));
      return { countries: listCountries(locale), locales: [...locales], timeZones: listTimeZones() };
    },
    method: "GET",
    path: "/meta/options",
  },
];
