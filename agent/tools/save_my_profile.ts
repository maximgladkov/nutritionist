import { defineTool } from "eve/tools";
import { z } from "zod";
import { normalizeCountryCode } from "../../lib/countries";
import { prisma } from "../../lib/prisma";
import { ensureDefaultReminders, rescheduleReminders } from "../../lib/reminders";
import { normalizeTimezone } from "../../lib/timezone";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Save the caller's nutrition profile. Pass notes, country, and/or timezone. Omitting a field leaves it unchanged. Pass country as a 2-letter ISO 3166-1 code, or null to clear it. Pass timezone as an IANA name such as Europe/Berlin, or null to clear it. Never pass another person's id.",
  inputSchema: z
    .object({
      notes: z.string().max(4000).optional(),
      country: z.union([z.string(), z.null()]).optional(),
      timezone: z.union([z.string(), z.null()]).optional(),
    })
    .refine(
      (value) =>
        value.notes !== undefined || value.country !== undefined || value.timezone !== undefined,
      {
        message: "Provide notes, country, and/or timezone",
      },
    ),
  async execute({ notes, country, timezone }, ctx) {
    const { userId } = requireUser(ctx);
    const data: { notes?: string; country?: string | null; timezone?: string | null } = {};
    if (notes !== undefined) {
      data.notes = notes;
    }
    if (country !== undefined) {
      if (country === null) {
        data.country = null;
      } else {
        const normalized = normalizeCountryCode(country);
        if (!normalized) {
          throw new Error("country must be a 2-letter ISO 3166-1 code");
        }
        data.country = normalized;
      }
    }
    if (timezone !== undefined) {
      if (timezone === null) {
        data.timezone = null;
      } else {
        const normalized = normalizeTimezone(timezone);
        if (!normalized) {
          throw new Error("timezone must be a valid IANA time zone");
        }
        data.timezone = normalized;
      }
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        notes: data.notes ?? "",
        country: data.country ?? null,
        timezone: data.timezone ?? null,
      },
      update: data,
    });
    if (profile.timezone) {
      await ensureDefaultReminders(userId, profile.timezone);
      if (timezone !== undefined && timezone !== null) {
        await rescheduleReminders(userId, profile.timezone);
      }
    }
    return { notes: profile.notes, country: profile.country, timezone: profile.timezone };
  },
});
