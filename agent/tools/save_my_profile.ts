import { defineTool } from "eve/tools";
import { z } from "zod";
import { normalizeCountryCode } from "../../lib/countries";
import { prisma } from "../../lib/prisma";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Save the caller's nutrition profile. Pass notes and/or country. Omitting a field leaves it unchanged. Pass country as a 2-letter ISO 3166-1 code, or null to clear it. Never pass another person's id.",
  inputSchema: z
    .object({
      notes: z.string().max(4000).optional(),
      country: z.union([z.string(), z.null()]).optional(),
    })
    .refine((value) => value.notes !== undefined || value.country !== undefined, {
      message: "Provide notes and/or country",
    }),
  async execute({ notes, country }, ctx) {
    const { userId } = requireUser(ctx);
    const data: { notes?: string; country?: string | null } = {};
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

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        notes: data.notes ?? "",
        country: data.country ?? null,
      },
      update: data,
    });
    return { notes: profile.notes, country: profile.country };
  },
});
