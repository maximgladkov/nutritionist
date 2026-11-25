import { achievementsView } from "../achievements/view.ts";
import { listGroupNotices } from "../group-notices.ts";
import { listGroupsForUser } from "../groups.ts";
import { getGoals } from "../goals.ts";
import { prisma } from "../prisma.ts";
import { readGender } from "../profile.ts";
import { listRecipes } from "../recipes.ts";
import { listReminders } from "../reminders.ts";
import { readSummaryContext } from "../summary.ts";
import { shiftYmd } from "../timezone.ts";
import { listUserProducts } from "../user-products-store.ts";
import { parseTranscript } from "../agent-turn-model.ts";
import type { TalkPayload } from "./talk.ts";

// Everything kept about the person that they can see in the app, for the agent to answer from. Only
// ever their own: nothing about other members of their groups, and no email, sign-in or link details.
export const INFO_SECTIONS = [
  "profile",
  "goals",
  "weight",
  "activity",
  "achievements",
  "groups",
  "coach_comments",
  "favorites",
  "foods",
  "saved_meals",
  "recipes",
  "photos",
  "reminders",
  "connections",
  "past_chats",
] as const;
export type InfoSection = (typeof INFO_SECTIONS)[number];

const LIST_MAX = 30;

function ageOn(today: string, birthDate: string): number {
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return today.slice(5) < birthDate.slice(5) ? years - 1 : years;
}

const readers: Record<InfoSection, (userId: string, now: Date) => Promise<unknown>> = {
  async achievements(userId) {
    const { closest, earnedCount, latest, streak, totalCount } = await achievementsView(userId);
    const brief = (badge: (typeof latest)[number]) => ({
      about: badge.description,
      earnedOn: badge.earnedOn,
      progress: badge.progressText,
      title: badge.title,
    });
    return { closest: closest.map(brief), earnedCount, latest: latest.map(brief), streak: { best: streak.best, days: streak.days, next: streak.next }, totalCount };
  },
  async activity(userId, now) {
    const { today } = await readSummaryContext(userId, now);
    return prisma.dailyActivity.findMany({
      orderBy: { date: "desc" },
      select: { activeKcal: true, date: true, steps: true },
      where: { date: { gte: shiftYmd(today, -29) }, userId },
    });
  },
  async coach_comments(userId) {
    const rows = await prisma.groupMessage.findMany({
      include: { fromUser: { select: { name: true } }, group: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: LIST_MAX,
      // Between this person and the owner only, in groups they're still in.
      where: { OR: [{ toUserId: userId }, { fromUserId: userId }], group: { members: { some: { userId } } } },
    });
    const foods = await prisma.mealItem.findMany({
      select: { id: true, name: true },
      where: { id: { in: rows.flatMap((row) => (row.targetMealItemId ? [row.targetMealItemId] : [])) }, meal: { userId } },
    });
    const foodNames = new Map(foods.map((food) => [food.id, food.name]));
    return rows.map((row) => ({
      aboutDate: row.targetDate,
      aboutFood: row.targetMealItemId ? (foodNames.get(row.targetMealItemId) ?? null) : null,
      at: row.createdAt.toISOString(),
      from: row.fromUserId === userId ? "you" : (row.fromUser.name ?? "coach"),
      group: row.group.name,
      text: row.body,
    }));
  },
  async connections(userId) {
    const [identities, fatSecret, activity] = await Promise.all([
      prisma.channelIdentity.findMany({ select: { provider: true }, where: { userId } }),
      prisma.fatSecretConnection.findUnique({ select: { userId: true }, where: { userId } }),
      prisma.dailyActivity.findFirst({ select: { date: true }, where: { userId } }),
    ]);
    return {
      appleHealthShared: activity !== null,
      fatSecret: fatSecret !== null,
      signInAndChats: [...new Set(identities.map((row) => row.provider))].sort(),
    };
  },
  async favorites(userId) {
    return (await listUserProducts({ segment: "favorites", userId })).slice(0, LIST_MAX);
  },
  async foods(userId) {
    return (await listUserProducts({ segment: "recent", userId })).slice(0, LIST_MAX);
  },
  async goals(userId) {
    const profile = await prisma.userProfile.findUnique({ select: { goalWeightKg: true }, where: { userId } });
    return { ...(await getGoals(userId)), goalWeightKg: profile?.goalWeightKg ?? null };
  },
  async groups(userId) {
    const groups = await listGroupsForUser(userId);
    return Promise.all(
      groups.map(async (group) => {
        const member = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } });
        const notices = await listGroupNotices(group.id, member);
        return {
          coach: group.ownerName,
          description: group.description,
          name: group.name,
          notices: notices.slice(0, 10).map((notice) => ({ body: notice.body, pinned: notice.pinned, title: notice.title })),
          role: group.role,
          sharing: group.role === "member" ? { asksFor: group.shares, youAllow: member?.allowedShares ?? [] } : null,
        };
      }),
    );
  },
  async past_chats(userId) {
    const [turns, talks] = await Promise.all([
      prisma.agentTurn.findMany({ orderBy: { startedAt: "desc" }, take: 20, where: { channel: "app", userId } }),
      prisma.assistantAction.findMany({ orderBy: { createdAt: "desc" }, take: 5, where: { kind: "talk", userId } }),
    ]);
    return {
      calls: talks.flatMap((row) => {
        const lines = (row.payload as TalkPayload).lines ?? [];
        return lines.length > 0 ? [{ at: row.createdAt.toISOString(), lines: lines.map((line) => `${line.speaker}: ${line.text}`).slice(-40) }] : [];
      }),
      chat: turns.reverse().flatMap((turn) =>
        parseTranscript(turn.messages).items.flatMap((item) =>
          item.type === "user" || (item.type === "assistant" && item.finishReason !== "tool-calls")
            ? [{ at: item.at, from: item.type, text: item.text.slice(0, 600) }]
            : [],
        ),
      ),
    };
  },
  async photos(userId) {
    const [progress, meals] = await Promise.all([
      prisma.progressPhoto.findMany({ orderBy: { date: "desc" }, select: { date: true }, take: LIST_MAX, where: { userId } }),
      prisma.mealPhoto.findMany({
        orderBy: { createdAt: "desc" },
        select: { meal: { select: { eatenAt: true, label: true } } },
        take: LIST_MAX,
        where: { meal: { userId } },
      }),
    ]);
    return {
      mealPhotos: meals.map(({ meal }) => ({ eatenAt: meal.eatenAt.toISOString(), meal: meal.label })),
      progressPhotoDates: progress.map((photo) => photo.date),
    };
  },
  async profile(userId, now) {
    const [profile, user, weight, { today }] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.user.findUnique({ select: { name: true }, where: { id: userId } }),
      prisma.weightEntry.findFirst({ orderBy: { date: "desc" }, where: { userId } }),
      readSummaryContext(userId, now),
    ]);
    return {
      age: profile?.birthDate ? ageOn(today, profile.birthDate) : null,
      country: profile?.country ?? null,
      currentWeightKg: weight?.weightKg ?? null,
      gender: readGender(profile?.gender),
      goalWeightKg: profile?.goalWeightKg ?? null,
      heightCm: profile?.heightCm ?? null,
      language: profile?.locale ?? null,
      name: user?.name ?? null,
      notes: profile?.notes ?? "",
      startWeightKg: profile?.startWeightKg ?? null,
      timezone: profile?.timezone ?? null,
    };
  },
  async recipes(userId) {
    return (await listRecipes(userId)).slice(0, LIST_MAX).map((recipe) => ({
      ingredients: recipe.items.map((item) => `${item.name} ${item.amount} ${item.unit}`),
      minutes: recipe.minutes,
      name: recipe.name,
      perServing: recipe.perServing,
      servings: recipe.servings,
    }));
  },
  async reminders(userId) {
    const { reminders, timezone } = await listReminders(userId);
    return { reminders: reminders.map(({ enabled, hour, label, minute }) => ({ enabled, hour, label, minute })), timezone };
  },
  async saved_meals(userId) {
    const rows = await prisma.savedMeal.findMany({ include: { items: true }, orderBy: { updatedAt: "desc" }, take: LIST_MAX, where: { userId } });
    return rows.map((row) => ({ foods: row.items.map((item) => `${item.name} ${item.amount} ${item.unit}`), name: row.name }));
  },
  async weight(userId) {
    const [profile, entries] = await Promise.all([
      prisma.userProfile.findUnique({ select: { goalWeightKg: true, startWeightKg: true }, where: { userId } }),
      prisma.weightEntry.findMany({ orderBy: { date: "desc" }, select: { date: true, weightKg: true }, take: 60, where: { userId } }),
    ]);
    return { entries, goalWeightKg: profile?.goalWeightKg ?? null, startWeightKg: profile?.startWeightKg ?? null };
  },
};

export async function myInfo(userId: string, sections: readonly InfoSection[], now: Date): Promise<Partial<Record<InfoSection, unknown>>> {
  const unique = [...new Set(sections)];
  return Object.fromEntries(await Promise.all(unique.map(async (section) => [section, await readers[section](userId, now)] as const)));
}
