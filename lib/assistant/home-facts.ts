import { achievementsView } from "../achievements/view.ts";
import { parseTranscript } from "../agent-turn-model.ts";
import { conversationTextWithoutMediaStubs } from "../conversation-query.ts";
import { computeItemNutrition, sumNutrients } from "../nutrition.ts";
import { loadTodayNutritionProgress } from "../nutrition-progress.ts";
import type { ProductNutriments } from "../open-food-facts.ts";
import { prisma } from "../prisma.ts";
import { listRecipes } from "../recipes.ts";
import { loadNutritionDays, readSummaryContext } from "../summary.ts";
import { formatDateInTimeZone, getZonedParts, shiftYmd } from "../timezone.ts";
import { frequentFoods } from "./frequent-foods.ts";
import { coverage } from "./home-card.ts";

export type HomeMood = "happy" | "idle" | "thinking";

// Something true right now that's worth saying. Every figure is worked out here; the model only
// chooses among these and words one.
export type HomeFact = {
  // What it's about, so the same thing isn't said twice in a row.
  key: string;
  mood: HomeMood;
  // Higher is better to say now.
  score: number;
  // What to say without the model, in the middle of a sentence after a name; null when only it can.
  plain: string | null;
  text: string;
};

export type HomeFacts = {
  facts: HomeFact[];
  // What they last wrote, to match its language; newest last.
  lastWords: string[];
  localTime: string;
  name: string | null;
  // Changes when what they logged or were told changes.
  stamp: string;
  today: string;
};

const DAY_MS = 86_400_000;
const USUAL_WINDOW_MIN = 90;

const n = (value: number): string => Math.round(value).toLocaleString("en");
const one = (value: number): string => (Math.round(value * 10) / 10).toLocaleString("en");
const days = (count: number): string => `${count} ${count === 1 ? "day" : "days"}`;

export function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

async function recentWords(userId: string, now: Date) {
  const turns = await prisma.agentTurn.findMany({
    orderBy: { startedAt: "desc" },
    select: { messages: true, startedAt: true },
    take: 3,
    where: { channel: "app", startedAt: { gt: new Date(now.getTime() - 30 * DAY_MS) }, userId },
  });
  return turns.reverse().flatMap((turn) => {
    const said = parseTranscript(turn.messages).items.flatMap((item) => (item.type === "user" ? [item.text] : [])).join(" ");
    const text = conversationTextWithoutMediaStubs(said).replace(/\s+/gu, " ").slice(0, 200);
    return text ? [{ at: turn.startedAt, text }] : [];
  });
}

// Something they keep and could make, that fits what's left.
async function dishes(userId: string) {
  const [recipes, meals] = await Promise.all([
    listRecipes(userId),
    prisma.savedMeal.findMany({ include: { items: true }, take: 20, where: { userId } }),
  ]);
  return [
    ...recipes.map((recipe) => ({ kcal: recipe.perServing.energyKcal, name: recipe.name, proteins: recipe.perServing.proteins, what: "saved recipe" })),
    ...meals.map((meal) => {
      const totals = sumNutrients(
        meal.items.map((item) => computeItemNutrition({ amount: item.amount, nutriments: item.nutrimentsPer100g as ProductNutriments, unit: item.unit }).metrics),
      );
      return { kcal: totals.energyKcal, name: meal.name, proteins: totals.proteins, what: "saved meal" };
    }),
  ];
}

// The food they most often have around this time, and haven't had around it today.
async function usualNow(userId: string, now: Date, timezone: string, today: string): Promise<{ count: number; name: string } | null> {
  const rows = await prisma.mealItem.findMany({
    select: { meal: { select: { eatenAt: true } }, name: true },
    take: 600,
    where: { meal: { eatenAt: { gte: new Date(now.getTime() - 21 * DAY_MS), lte: now }, userId } },
  });
  const minuteOf = (at: Date) => {
    const parts = getZonedParts(at, timezone);
    return parts.hour * 60 + parts.minute;
  };
  const here = minuteOf(now);
  const seen = new Map<string, { dates: Set<string>; name: string }>();
  for (const row of rows) {
    const apart = Math.abs(minuteOf(row.meal.eatenAt) - here);
    if (Math.min(apart, 1440 - apart) > USUAL_WINDOW_MIN) continue;
    const date = formatDateInTimeZone(row.meal.eatenAt, timezone);
    // Already ate around now.
    if (date === today) return null;
    const key = row.name.trim().toLowerCase();
    const known = seen.get(key) ?? { dates: new Set<string>(), name: row.name };
    known.dates.add(date);
    seen.set(key, known);
  }
  const best = [...seen.values()].sort((a, b) => b.dates.size - a.dates.size)[0];
  return best && best.dates.size >= 4 ? { count: best.dates.size, name: best.name } : null;
}

export async function loadHomeFacts(userId: string, now: Date): Promise<HomeFacts> {
  const { goals, timezone, today } = await readSummaryContext(userId, now);
  const clock = getZonedParts(now, timezone);
  const { hour } = clock;
  const [user, profile, progress, comments, history, foods, kept, usual, badges, weights, activity, words, latestItem] = await Promise.all([
    prisma.user.findUnique({ select: { name: true }, where: { id: userId } }),
    prisma.userProfile.findUnique({ select: { goalWeightKg: true }, where: { userId } }),
    loadTodayNutritionProgress(userId, now),
    prisma.groupMessage.findMany({
      orderBy: { createdAt: "desc" },
      select: { body: true, createdAt: true, fromUser: { select: { name: true } } },
      where: { fromUserId: { not: userId }, group: { members: { some: { userId } } }, replyToId: null, targetDate: today, toUserId: userId },
    }),
    loadNutritionDays({ from: shiftYmd(today, -14), now, to: shiftYmd(today, -1), userId }),
    frequentFoods({ limit: 12, now, userId }),
    dishes(userId),
    usualNow(userId, now, timezone, today),
    achievementsView(userId),
    prisma.weightEntry.findMany({ orderBy: { date: "desc" }, take: 60, where: { userId } }),
    prisma.dailyActivity.findMany({ orderBy: { date: "desc" }, where: { date: { gte: shiftYmd(today, -8), lt: today }, userId } }),
    recentWords(userId, now),
    prisma.mealItem.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true }, where: { meal: { userId } } }),
  ]);

  const facts: HomeFact[] = [];
  const add = (key: string, score: number, mood: HomeMood, text: string, plain: string | null) => facts.push({ key, mood, plain, score, text });

  const eaten = progress.current.energyKcal ?? 0;
  const protein = progress.current.proteins ?? 0;
  const kcalGoal = goals.caloriesPerDay;
  const proteinGoal = goals.proteinGPerDay;
  const kcalLeft = kcalGoal ? Math.round(kcalGoal - eaten) : null;
  const proteinLeft = proteinGoal ? Math.round(proteinGoal - protein) : null;
  // Late in the day with little logged is far more often a gap in the diary than a success.
  const sparse = kcalGoal !== null && eaten > 0 && hour >= 20 && eaten < kcalGoal * 0.5;

  if (sparse) {
    add("sparse", 92, "thinking", `Only ${n(eaten)} kcal is logged today and it's evening. Probably something is missing from the diary. Ask, don't praise.`, `only ${n(eaten)} kcal is logged today. Is anything missing?`);
  } else if (eaten > 0) {
    if (proteinLeft !== null && proteinLeft >= 15 && hour >= 10) {
      const best = foods.filter((food) => (food.proteins ?? 0) > 0).sort((a, b) => (b.proteins ?? 0) - (a.proteins ?? 0))[0];
      const share = best ? coverage(best.proteins ?? 0, proteinLeft) : null;
      const idea = best && share ? ` ${best.name}, which they often log, ${share}.` : "";
      add(
        "protein_left",
        hour >= 17 ? 84 : 74,
        "happy",
        `${n(proteinLeft)} grams of protein left today to reach the goal.${idea}`,
        `you still need ${n(proteinLeft)} grams of protein.${best && share ? ` ${best.name} ${share}.` : ""}`,
      );
    }
    if (kcalLeft !== null && kcalLeft >= 150 && hour >= 11) {
      const dish = kept
        .filter((row) => row.kcal !== null && row.kcal >= 100 && row.kcal <= kcalLeft)
        .sort((a, b) => (b.proteins ?? 0) - (a.proteins ?? 0))[0];
      if (dish) {
        add(
          "dish",
          80,
          "happy",
          `${n(kcalLeft)} kcal left today. Their ${dish.what} "${dish.name}" fits: ${n(dish.kcal!)} kcal${dish.proteins ? ` and ${n(dish.proteins)} grams of protein` : ""} a serving.`,
          `you have ${n(kcalLeft)} kcal left. Your ${dish.name} fits.`,
        );
      } else {
        add("kcal_left", 60, "idle", `${n(kcalLeft)} kcal left today of the goal of ${n(kcalGoal!)}.`, `you have ${n(kcalLeft)} kcal left today.`);
      }
    }
    if (proteinLeft !== null && proteinLeft <= 0) {
      add("protein_done", 78, "happy", `Protein goal reached today: ${n(protein)} of ${n(proteinGoal!)} grams.`, `your protein goal is done for today. Nice work.`);
    }
    if (kcalLeft !== null && kcalLeft < -kcalGoal! * 0.05) {
      add("over", 55, "thinking", `${n(-kcalLeft)} kcal over today's goal. Be kind and practical: one day matters little; offer help planning tomorrow.`, `one day over doesn't undo your week. Want a hand planning tomorrow?`);
    }
  }

  const week = history.days.filter((day) => day.date >= shiftYmd(today, -7) && day.itemCount > 0);
  const before = history.days.filter((day) => day.date < shiftYmd(today, -7) && day.itemCount > 0);
  const mean = (rows: typeof week, key: "energyKcal" | "proteins") => rows.reduce((sum, day) => sum + (day.totals[key] ?? 0), 0) / Math.max(1, rows.length);
  if (week.length >= 3) {
    if (proteinGoal) {
      const hit = week.filter((day) => (day.totals.proteins ?? 0) >= proteinGoal).length;
      if (hit >= 2 && hit * 2 >= week.length) {
        add("protein_week", 66, "happy", `Protein goal reached on ${hit} of the ${days(week.length)} logged in the last 7 days.`, `you hit your protein goal on ${hit} of ${days(week.length)} this past week.`);
      }
    }
    if (kcalGoal) {
      const average = mean(week, "energyKcal");
      const ratio = average / kcalGoal;
      if (ratio < 0.75) {
        add("week", 50, "thinking", `Logged ${n(average)} kcal a day on average over the last 7 days, well under the goal of ${n(kcalGoal)}. Ask whether something isn't being logged; never praise it.`, `you logged ${n(average)} kcal a day this past week, well under your goal. Is anything missing?`);
      } else if (ratio <= 1.05) {
        add("week", 58, "happy", `Averaged ${n(average)} kcal a day over the last 7 days, close to the goal of ${n(kcalGoal)}.`, `you averaged ${n(average)} kcal a day this past week, close to your goal.`);
      } else {
        add("week", 46, "thinking", `Averaged ${n(average)} kcal a day over the last 7 days; the goal is ${n(kcalGoal)}. Be kind; offer help planning.`, `you averaged ${n(average)} kcal a day this past week. Want a hand planning the next one?`);
      }
    }
    if (before.length >= 3) {
      const [was, is] = [mean(before, "proteins"), mean(week, "proteins")];
      if (is >= was * 1.1 && is - was >= 5) {
        add("protein_up", 64, "happy", `Protein is up: ${n(is)} grams a day in the last 7 days, from ${n(was)} the 7 days before.`, `your protein is up to ${n(is)} grams a day, from ${n(was)} the week before.`);
      }
    }
  }

  const { streak } = badges;
  if (streak.days >= 2) {
    if (streak.loggedToday) add("streak", 52, "happy", `${days(streak.days)} in a row with something logged; today counts already.`, `that's ${days(streak.days)} logged in a row. Keep it rolling.`);
    else add("streak", hour >= 17 ? 88 : 56, "idle", `${days(streak.days)} in a row with something logged. Nothing logged yet today; logging keeps the streak.`, `log something today to keep your ${streak.days}-day streak.`);
  }
  const fresh = badges.latest.find((badge) => badge.earnedOn !== null && badge.earnedOn >= shiftYmd(today, -1));
  if (fresh) add(`badge:${fresh.id}`, 86, "happy", `Just earned the badge "${fresh.title}": ${fresh.description}`, `you earned a badge: ${fresh.title}.`);
  const near = badges.closest[0];
  if (near && near.progress >= 0.7) add("next_badge", 54, "happy", `Closest badge: "${near.title}", ${near.progressText}. ${near.description}`, `you're close to a badge: ${near.title}, ${near.progressText}.`);

  const latest = weights[0];
  const goalWeight = profile?.goalWeightKg ?? null;
  if (latest && goalWeight !== null && latest.date >= shiftYmd(today, -7)) {
    const earlier = weights.find((entry) => entry.date <= shiftYmd(latest.date, -14));
    const closer = earlier ? Math.abs(earlier.weightKg - goalWeight) - Math.abs(latest.weightKg - goalWeight) : 0;
    // Only ever said when it's going where they want.
    if (earlier && closer >= 0.3) {
      add("weight", 62, "happy", `Weight is ${one(closer)} kg closer to the goal than on ${earlier.date}.`, `you're ${one(closer)} kg closer to your goal weight than a few weeks ago.`);
    }
  }

  const steps = activity.find((row) => row.date === shiftYmd(today, -1))?.steps ?? null;
  const others = activity.filter((row) => row.date < shiftYmd(today, -1)).flatMap((row) => (row.steps ? [row.steps] : []));
  if (steps && others.length >= 4) {
    const usualSteps = others.reduce((sum, value) => sum + value, 0) / others.length;
    if (steps >= usualSteps * 1.15) add("steps", 48, "happy", `${n(steps)} steps yesterday, above the usual ${n(usualSteps)}.`, `you walked ${n(steps)} steps yesterday, above your usual ${n(usualSteps)}.`);
  }

  const comment = comments[0];
  if (comment) {
    const from = firstName(comment.fromUser.name) ?? "their coach";
    const count = comments.length === 1 ? "a comment" : `${comments.length} comments`;
    add(`comments:${comments.length}`, 90, "idle", `${from} (their human coach, a different person from you) left ${count} on today: "${comment.body.slice(0, 160)}"`, `there's ${count} from ${from === "their coach" ? "your coach" : from} on your day.`);
  }

  if (usual) add("usual", 70, "idle", `They usually have ${usual.name} around this time (${usual.count} of the last 21 days) and haven't logged it today.`, `time for your usual ${usual.name}? Tell me and I'll log it.`);

  if (eaten === 0) {
    if (hour >= 11) add("empty", 72, "idle", "Nothing logged yet today, and it's past 11. They can tell you what they ate, or send a photo, and you log it.", "nothing's logged yet today. Tell me what you ate and I'll add it.");
    else if (hour >= 4) add("morning", 44, "happy", "A new day with nothing logged yet. Ask what's for breakfast, or wish them a good start.", "good morning! What's for breakfast?");
  }

  const said = words.at(-1);
  // A bare "yes" or "why?" isn't anything to come back to.
  if (said && said.text.length >= 15 && now.getTime() - said.at.getTime() > 45 * 60_000 && now.getTime() - said.at.getTime() < 14 * 3_600_000) {
    const at = getZonedParts(said.at, timezone);
    add("chat", 68, "idle", `They wrote to you at ${at.hour}:${String(at.minute).padStart(2, "0")}: "${said.text}". Only worth following up if it was about something still ahead or that just happened.`, null);
  }

  // Only for want of anything else.
  if (facts.filter((fact) => fact.plain !== null).length < 3) add("hello", 5, "happy", "Nothing in particular to report. Offer help with a meal idea, or logging by text, voice or photo.", "ask me for a meal idea, or send a photo of what you're eating.");

  return {
    facts: facts.sort((a, b) => b.score - a.score),
    lastWords: words.map((row) => row.text),
    localTime: `${new Intl.DateTimeFormat("en", { timeZone: timezone, weekday: "long" }).format(now)}, ${clock.hour}:${String(clock.minute).padStart(2, "0")}`,
    name: firstName(user?.name),
    stamp: [today, latestItem?.id ?? "", Math.round(eaten), comments.length].join("|"),
    today,
  };
}
