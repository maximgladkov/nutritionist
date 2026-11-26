import { loadNutritionDays, readSummaryContext } from "../summary.ts";
import { prisma } from "../prisma.ts";
import { loadTodayNutritionProgress } from "../nutrition-progress.ts";
import { getZonedParts, shiftYmd } from "../timezone.ts";
import { frequentFoods } from "./frequent-foods.ts";

export type HomeCardMessage = { id: string; mood: "happy" | "idle" | "thinking"; text: string };

const MIN_PROTEIN_LEFT_G = 15;
const MIN_LOGGED_DAYS = 3;

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] || "Your coach";
}

// How much of what's left a food covers, in words; null when it's too little to mention.
export function coverage(part: number, whole: number): string | null {
  const share = part / whole;
  if (share < 0.2) return null;
  if (share >= 0.9) return "covers it";
  if (share >= 0.6) return "covers most of it";
  if (share >= 0.42) return "covers about half";
  return share >= 0.29 ? "covers about a third" : "covers about a quarter";
}

// What the coach has to say on Today, worked out from the diary; often nothing. No model runs here,
// so opening the app costs nothing and every figure is the diary's own.
export async function homeCardMessages(userId: string, now: Date): Promise<HomeCardMessage[]> {
  const { goals, timezone, today } = await readSummaryContext(userId, now);
  const hour = getZonedParts(now, timezone).hour;
  const [progress, comments, week] = await Promise.all([
    loadTodayNutritionProgress(userId, now),
    prisma.groupMessage.findMany({
      orderBy: { createdAt: "desc" },
      select: { fromUser: { select: { name: true } } },
      where: {
        draftFor: null,
        fromUserId: { not: userId },
        group: { members: { some: { userId } } },
        replyToId: null,
        targetDate: today,
        toUserId: userId,
      },
    }),
    loadNutritionDays({ from: shiftYmd(today, -7), now, to: shiftYmd(today, -1), userId }),
  ]);
  const messages: HomeCardMessage[] = [];
  const eaten = progress.current.energyKcal ?? 0;

  const proteinLeft = Math.round(progress.remaining.proteins ?? 0);
  if (eaten > 0 && hour >= 10 && proteinLeft >= MIN_PROTEIN_LEFT_G) {
    const foods = await frequentFoods({ limit: 12, now, userId });
    const best = foods.filter((food) => (food.proteins ?? 0) > 0).sort((a, b) => (b.proteins ?? 0) - (a.proteins ?? 0))[0];
    const share = best ? coverage(best.proteins ?? 0, proteinLeft) : null;
    messages.push({
      id: `protein:${today}`,
      mood: "happy",
      text: `You still need ${proteinLeft} grams of protein.${best && share ? ` ${best.name} ${share}.` : ""}`,
    });
  }

  const commenter = comments[0];
  if (commenter) {
    const count = comments.length === 1 ? "a comment" : `${comments.length} comments`;
    messages.push({ id: `comments:${today}:${comments.length}`, mood: "idle", text: `${firstName(commenter.fromUser.name)} left ${count} on your day.` });
  }

  const loggedDays = week.days.filter((day) => day.itemCount > 0);
  const goal = goals.caloriesPerDay;
  if (goal && loggedDays.length >= MIN_LOGGED_DAYS) {
    const average = Math.round(loggedDays.reduce((sum, day) => sum + (day.totals.energyKcal ?? 0), 0) / loggedDays.length);
    const ratio = average / goal;
    const figure = average.toLocaleString("en");
    // Eating far under the goal isn't praised: usually something wasn't logged.
    const text =
      ratio < 0.75
        ? `You logged ${figure} kcal a day this week, well under your goal. Is anything missing?`
        : ratio <= 1.05
          ? `You averaged ${figure} kcal a day this week, close to your goal.`
          : `You averaged ${figure} kcal a day this week. Want a hand planning the next one?`;
    messages.push({ id: `week:${today}`, mood: ratio >= 0.75 && ratio <= 1.05 ? "happy" : "thinking", text });
  }

  if (eaten === 0 && hour >= 11) {
    messages.push({ id: `empty:${today}`, mood: "idle", text: "Nothing logged yet today. Tell me what you ate and I'll add it." });
  }
  return messages;
}
