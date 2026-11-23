import { z } from "zod";
import { prisma } from "../../prisma.ts";
import { readSummaryContext } from "../../summary.ts";
import { invalid, notFound } from "../errors.ts";
import { noContent, readJson, readQuery } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import { ymdSchema } from "../schemas.ts";
import { attachmentUrl } from "../views.ts";
import { requireOwnedAttachments } from "./uploads.ts";

const weightSchema = z.number().min(20, "Enter a weight in kilograms.").max(400, "Enter a weight in kilograms.");

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function weightsView(userId: string, from?: string, to?: string) {
  const [profile, entries, first] = await Promise.all([
    prisma.userProfile.findUnique({ select: { goalWeightKg: true, startWeightKg: true }, where: { userId } }),
    prisma.weightEntry.findMany({
      orderBy: { date: "desc" },
      where: { date: { gte: from, lte: to }, userId },
    }),
    prisma.weightEntry.findFirst({ orderBy: { date: "asc" }, where: { userId } }),
  ]);
  const latest = await prisma.weightEntry.findFirst({ orderBy: { date: "desc" }, where: { userId } });
  const startKg = profile?.startWeightKg ?? first?.weightKg ?? null;
  const goalKg = profile?.goalWeightKg ?? null;
  const currentKg = latest?.weightKg ?? null;
  // Progress from start toward goal, 0..1. Null until start, current and goal are all known.
  const progress =
    startKg !== null && goalKg !== null && currentKg !== null && startKg !== goalKg
      ? Math.min(1, Math.max(0, (startKg - currentKg) / (startKg - goalKg)))
      : null;
  return {
    currentKg,
    entries: entries.map((entry, index) => {
      const previous = entries[index + 1];
      return {
        date: entry.date,
        deltaKg: previous ? round1(entry.weightKg - previous.weightKg) : null,
        id: entry.id,
        weightKg: entry.weightKg,
      };
    }),
    goalKg,
    progress,
    startKg,
  };
}

async function todayFor(userId: string): Promise<string> {
  return (await readSummaryContext(userId)).today;
}

// Up to a year of days per sync, so a first sync from Apple Health can fill recent history.
const MAX_SYNC_DAYS = 400;

const activitySchema = z.object({
  days: z
    .array(
      z.object({
        activeKcal: z.number().min(0).max(20_000).nullable().optional(),
        date: ymdSchema,
        steps: z.number().int().min(0).max(300_000).nullable().optional(),
      }),
    )
    .max(MAX_SYNC_DAYS),
});

const weightImportSchema = z.object({
  entries: z.array(z.object({ date: ymdSchema, weightKg: weightSchema })).max(MAX_SYNC_DAYS * 3),
});

export const bodyRoutes: RouteDefinition[] = [
  {
    async handler({ url, user }) {
      const query = readQuery(url, z.object({ from: ymdSchema.optional(), to: ymdSchema.optional() }));
      return weightsView(user.id, query.from, query.to);
    },
    method: "GET",
    path: "/me/weights",
  },
  {
    async handler({ request, user }) {
      const body = await readJson(request, z.object({ date: ymdSchema.optional(), weightKg: weightSchema }));
      const today = await todayFor(user.id);
      const date = body.date ?? today;
      if (date > today) {
        throw invalid("You can't log weight for a future day.");
      }
      await prisma.weightEntry.upsert({
        create: { date, userId: user.id, weightKg: round1(body.weightKg) },
        update: { weightKg: round1(body.weightKg) },
        where: { userId_date: { date, userId: user.id } },
      });
      return weightsView(user.id);
    },
    method: "POST",
    path: "/me/weights",
  },
  {
    async handler({ request, user }) {
      const body = await readJson(
        request,
        z.object({ goalWeightKg: weightSchema.nullable().optional(), startWeightKg: weightSchema.nullable().optional() }).strict(),
      );
      await prisma.userProfile.upsert({
        create: { userId: user.id, ...body },
        update: body,
        where: { userId: user.id },
      });
      return weightsView(user.id);
    },
    method: "PATCH",
    path: "/me/weights",
  },
  {
    // Weigh-ins from Apple Health: fills days with no weight here, never overwrites one.
    async handler({ request, user }) {
      const body = await readJson(request, weightImportSchema);
      const today = await todayFor(user.id);
      const byDate = new Map<string, number>();
      for (const entry of body.entries) {
        if (entry.date <= today) byDate.set(entry.date, round1(entry.weightKg));
      }
      const created = await prisma.weightEntry.createMany({
        data: [...byDate].map(([date, weightKg]) => ({ date, userId: user.id, weightKg })),
        skipDuplicates: true,
      });
      return { ...(await weightsView(user.id)), imported: created.count };
    },
    method: "POST",
    path: "/me/weights/import",
  },
  {
    // Daily totals from Apple Health. A field left out keeps what's stored; null clears it (the
    // user stopped sharing it).
    async handler({ request, user }) {
      const body = await readJson(request, activitySchema);
      const today = await todayFor(user.id);
      const days = body.days.filter((day) => day.date <= today);
      await prisma.$transaction(
        days.map((day) => {
          const values = {
            ...(day.activeKcal !== undefined ? { activeKcal: day.activeKcal === null ? null : Math.round(day.activeKcal) } : {}),
            ...(day.steps !== undefined ? { steps: day.steps } : {}),
          };
          return prisma.dailyActivity.upsert({
            create: { date: day.date, userId: user.id, ...values },
            update: values,
            where: { userId_date: { date: day.date, userId: user.id } },
          });
        }),
      );
      return { saved: days.length };
    },
    method: "PUT",
    path: "/me/activity",
  },
  {
    async handler({ params, user }) {
      const result = await prisma.weightEntry.deleteMany({ where: { id: params.id, userId: user.id } });
      if (result.count === 0) {
        throw notFound("Weight entry not found.");
      }
      return noContent();
    },
    method: "DELETE",
    path: "/me/weights/:id",
  },
  {
    async handler({ user }) {
      const photos = await prisma.progressPhoto.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], where: { userId: user.id } });
      return { photos: photos.map((photo) => ({ date: photo.date, id: photo.id, url: attachmentUrl(photo.attachmentId) })) };
    },
    method: "GET",
    path: "/me/progress-photos",
  },
  {
    async handler({ request, user }) {
      const body = await readJson(request, z.object({ date: ymdSchema.optional(), uploadId: z.string().min(1) }));
      await requireOwnedAttachments(user.id, [body.uploadId]);
      const photo = await prisma.progressPhoto.create({
        data: { attachmentId: body.uploadId, date: body.date ?? (await todayFor(user.id)), userId: user.id },
      });
      return { photo: { date: photo.date, id: photo.id, url: attachmentUrl(photo.attachmentId) } };
    },
    method: "POST",
    path: "/me/progress-photos",
  },
  {
    async handler({ params, user }) {
      const result = await prisma.progressPhoto.deleteMany({ where: { id: params.id, userId: user.id } });
      if (result.count === 0) {
        throw notFound("Photo not found.");
      }
      return noContent();
    },
    method: "DELETE",
    path: "/me/progress-photos/:id",
  },
];
