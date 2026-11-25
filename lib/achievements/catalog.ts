import { BURNED_DAY_KCAL, STEPS_DAY } from "./metrics.ts";
import type { AchievementContext, MetricName } from "./metrics.ts";

// Every badge there is. Adding one is adding an entry here: the app draws whatever families and
// badges the API returns, so a badge on an existing metric and icon needs no app release. An icon
// or colour the app doesn't know yet shows as a plain star on champagne.
//
// Ids are stored with the day a badge was earned, so never change or reuse one.

// Icons and colours the app draws (src/features/achievements in btrme-app).
export type BadgeIcon =
  | "barcode" | "burn" | "camera" | "chat" | "clock" | "down" | "flag" | "flame" | "food" | "group" | "mic" | "phone"
  | "protein" | "scale" | "sparkles" | "steps" | "target" | "up" | "water";
export type BadgeColor = "carbs" | "champagne" | "fat" | "ink" | "protein";

export type Achievement = {
  // Stored; never change it.
  id: string;
  color: BadgeColor;
  // What it's for, once earned.
  description: string;
  icon: BadgeIcon;
  metric: MetricName;
  // Short, under the badge ("7 days").
  name: string;
  target: number;
  // Written on the badge under its icon ("7D"); empty for none.
  tier: string;
  // Its full name ("7-day streak").
  title: string;
  // What's left to do, for a badge not earned yet. Without it: "3 days to go."
  toGo?: (left: number) => string;
  // For "3 / 7 days"; empty for things done once.
  unit: string;
};

export type AchievementFamily = {
  id: string;
  title: string;
  // Said under a badge among the latest ones ("Day streak").
  context: string;
  // One after another (3 days, then 7, then 14), so only the next one is within reach. The badges
  // of an unordered family can be earned in any order.
  ordered: boolean;
  rule: (context: AchievementContext) => string;
  // `earnedIds` lets a family keep showing earned badges whose target came from a setting that has
  // changed since (a goal weight).
  badges: (context: AchievementContext, earnedIds: ReadonlySet<string>) => Achievement[];
};

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

// A badge per length of time, all counting the same kind of day.
function dayTiers(input: {
  idPrefix: string;
  color: BadgeColor;
  describe: (span: string) => string;
  icon: BadgeIcon;
  metric: MetricName;
  title: string;
  toGo: (left: number) => string;
}): Achievement[] {
  const tiers = [
    { days: 7, name: "7 days", tier: "7D" },
    { days: 30, name: "1 month", tier: "1M" },
    { days: 365, name: "1 year", tier: "1Y" },
  ];
  return tiers.map(({ days, name, tier }) => ({
    color: input.color,
    description: input.describe(plural(days, "day")),
    icon: input.icon,
    id: `${input.idPrefix}-${days}`,
    metric: input.metric,
    name,
    target: days,
    tier,
    title: `${input.title} · ${name}`,
    toGo: input.toGo,
    unit: "days",
  }));
}

const STREAKS: AchievementFamily = {
  badges: () =>
    [
      { days: 3, description: "Three days in a row with at least one meal logged.", name: "3 days", tier: "3" },
      { days: 7, description: "A full week of logging. This is where habits start.", name: "7 days", tier: "7" },
      { days: 14, description: "Two weeks of logging without a gap.", name: "14 days", tier: "14" },
      { days: 30, description: "A whole month of logging. It’s a habit now.", name: "30 days", tier: "30" },
      { days: 100, description: "A hundred days in a row. Few people get here.", name: "100 days", tier: "100" },
      { days: 365, description: "A year of logging, every single day.", name: "1 year", tier: "1Y" },
    ].map(({ days, description, name, tier }) => ({
      color: "champagne" as const,
      description,
      icon: "flame" as const,
      id: `streak-${days}`,
      metric: "logging_streak" as const,
      name,
      target: days,
      tier,
      title: `${days}-day streak`,
      toGo: (left: number) => `${plural(left, "more day")} in a row with a meal logged.`,
      unit: "days",
    })),
  context: "Day streak",
  id: "streaks",
  ordered: true,
  rule: () => "Log at least one meal every day.",
  title: "Streaks",
};

const PROTEIN: AchievementFamily = {
  badges: ({ goals }) =>
    dayTiers({
      color: "protein",
      describe: (span) => `${span} at or above your protein goal.`,
      icon: "protein",
      idPrefix: "protein",
      metric: "protein_days",
      title: "Protein goal",
      toGo: (left) =>
        goals.proteinGPerDay
          ? `${plural(left, "more day")} with ${goals.proteinGPerDay} grams of protein.`
          : "Set a protein goal to start this one.",
    }),
  context: "Protein goal",
  id: "protein",
  ordered: true,
  rule: ({ goals }) =>
    goals.proteinGPerDay
      ? `Eat at least ${goals.proteinGPerDay} grams of protein in a day.`
      : "Set a protein goal, then reach it in a day.",
  title: "Protein goal",
};

const CALORIES: AchievementFamily = {
  badges: ({ goals }) =>
    dayTiers({
      color: "champagne",
      describe: (span) => `${span} within 10% of your calorie goal.`,
      icon: "target",
      idPrefix: "calories",
      metric: "calorie_days",
      title: "On target",
      toGo: (left) =>
        goals.caloriesPerDay
          ? `${plural(left, "more day")} within 10% of your calorie goal.`
          : "Set a calorie goal to start this one.",
    }),
  context: "Calories on target",
  id: "calories",
  ordered: true,
  rule: ({ goals }) =>
    goals.caloriesPerDay
      ? `Stay within 10% of ${goals.caloriesPerDay.toLocaleString("en-US")} kcal for the day.`
      : "Set a calorie goal, then stay within 10% of it for the day.",
  title: "Calories on target",
};

const GOAL_WEIGHT_PREFIX = "weight-goal-";

function weightDirection({ goalWeightKg, startWeightKg }: AchievementContext): "gain" | "lose" {
  return goalWeightKg !== null && startWeightKg !== null && goalWeightKg > startWeightKg ? "gain" : "lose";
}

function kilos(value: number): string {
  return String(Math.round(value * 10) / 10);
}

const WEIGHT: AchievementFamily = {
  badges(context, earnedIds) {
    const direction = weightDirection(context);
    const { goalWeightKg, startWeightKg } = context;
    const goalDistance = goalWeightKg !== null && startWeightKg !== null ? Math.abs(goalWeightKg - startWeightKg) : null;
    const step = (kg: number, way: "gain" | "lose", title: string, description: string): Achievement => ({
      color: "fat",
      description,
      icon: way === "lose" ? "down" : "up",
      id: `weight-${way}-${kg}`,
      metric: way === "lose" ? "weight_lost_kg" : "weight_gained_kg",
      name: `${way === "lose" ? "−" : "+"}${kg} kg`,
      target: kg,
      tier: `${way === "lose" ? "−" : "+"}${kg}`,
      title,
      toGo: (left) => `${kilos(left)} kg to go.`,
      unit: "kg",
    });
    const steps = [
      { badge: step(1, "lose", "First kilo down", "You lost your first kilo. Keep going."), way: "lose" },
      { badge: step(5, "lose", "Five kilos down", "Five kilos lighter than where you started."), way: "lose" },
      { badge: step(1, "gain", "First kilo up", "You gained your first kilo. Keep going."), way: "gain" },
      { badge: step(5, "gain", "Five kilos up", "Five kilos heavier than where you started."), way: "gain" },
    ]
      // Only the way this person is headed, and no further than their goal; earned ones stay.
      .filter(
        ({ badge, way }) =>
          earnedIds.has(badge.id) || (way === direction && (goalDistance === null || goalDistance === 0 || badge.target <= goalDistance)),
      )
      .map(({ badge }) => badge);

    // A goal weight's badge is that weight's own: a new goal is a new badge.
    const goalBadge = (kg: string, target: number): Achievement => ({
      color: "fat",
      description: `You reached your goal of ${kg} kg.`,
      icon: "flag",
      id: `${GOAL_WEIGHT_PREFIX}${kg}`,
      metric: direction === "lose" ? "weight_lost_kg" : "weight_gained_kg",
      name: "Goal",
      target,
      tier: kg,
      title: `Goal weight · ${kg} kg`,
      toGo: (left) => `${kilos(left)} kg to go.`,
      unit: "kg",
    });
    const current = goalWeightKg !== null && goalDistance !== null && goalDistance > 0 ? kilos(goalWeightKg) : null;
    const earlier = [...earnedIds]
      .filter((id) => id.startsWith(GOAL_WEIGHT_PREFIX))
      .map((id) => id.slice(GOAL_WEIGHT_PREFIX.length))
      .filter((kg) => kg !== current);
    return [
      ...steps,
      ...earlier.map((kg) => ({ ...goalBadge(kg, 1), unit: "" })),
      ...(current !== null ? [goalBadge(current, Math.round((goalDistance ?? 0) * 10) / 10)] : []),
    ];
  },
  context: "Weight",
  id: "weight",
  ordered: true,
  rule: ({ goalWeightKg, startWeightKg }) =>
    goalWeightKg !== null && startWeightKg !== null && goalWeightKg !== startWeightKg
      ? `Milestones on the way from ${kilos(startWeightKg)} to ${kilos(goalWeightKg)} kg.`
      : "Milestones on the way to your goal weight.",
  title: "Weight",
};

const FIRSTS: AchievementFamily = {
  badges: () => {
    const once = (
      id: string,
      icon: BadgeIcon,
      metric: MetricName,
      name: string,
      title: string,
      description: string,
      toGo: string,
    ): Achievement => ({ color: "ink", description, icon, id, metric, name, target: 1, tier: "", title, toGo: () => toGo, unit: "" });
    return [
      once("first-barcode", "barcode", "event:barcode_scan", "Barcode", "First barcode scan", "You scanned your first product.", "Scan the barcode on a product."),
      once("first-photo", "camera", "meal_photos", "Photo", "First meal photo", "You added a photo to a meal.", "Add a photo to a meal."),
      once("first-voice", "mic", "event:voice_note", "Voice", "Describe by voice", "You said what you ate.", "Say what you ate instead of typing it."),
      once("first-group", "group", "groups_joined", "Group", "Joined a group", "You joined your first group.", "Join a group with a code or a link."),
      {
        color: "ink", description: "A hundred foods in your diary.", icon: "food", id: "foods-100", metric: "foods_logged",
        name: "100 foods", target: 100, tier: "100", title: "100 foods logged",
        toGo: (left) => `${plural(left, "more food")} to log.`, unit: "foods",
      },
      {
        color: "ink", description: "You weighed in ten times.", icon: "scale", id: "weigh-ins-10", metric: "weigh_ins",
        name: "Weigh-ins", target: 10, tier: "10", title: "10 weigh-ins",
        toGo: (left) => `${plural(left, "more weigh-in")} to log.`, unit: "weigh-ins",
      },
    ];
  },
  context: "First time",
  id: "firsts",
  ordered: false,
  rule: () => "Try every way to log and connect.",
  title: "Firsts",
};

// So much in one day, then a good day that often.
function dayBest(input: {
  id: string;
  color: BadgeColor;
  icon: BadgeIcon;
  best: MetricName;
  days: MetricName;
  goodDay: number;
  targets: readonly number[];
  tier: (target: number) => string;
  title: string;
  unit: string;
}): Achievement[] {
  const { best, color, days, goodDay, icon, id, targets, tier, title, unit } = input;
  const amount = (value: number) => `${value.toLocaleString("en-US")} ${unit}`;
  return [
    ...targets.map((target): Achievement => ({
      color, description: "All in a single day. Keep moving.", icon, id: `${id}-${target}`, metric: best, name: target.toLocaleString("en-US"),
      target, tier: tier(target), title: `${amount(target)} in a day`, toGo: () => `Reach ${amount(target)} in one day.`, unit,
    })),
    ...[7, 30].map((count): Achievement => ({
      color, description: `${count} days with at least ${amount(goodDay)}.`, icon, id: `${id}-days-${count}`, metric: days, name: `${count} days`,
      target: count, tier: `${count}D`, title: `${title} · ${count} days`,
      toGo: (left) => `${plural(left, "more day")} with at least ${amount(goodDay)}.`, unit: "days",
    })),
  ];
}

const thousands = (value: number) => (value >= 1000 ? `${value / 1000}K` : String(value));

const STEPS: AchievementFamily = {
  badges: () =>
    dayBest({
      best: "steps_best", color: "carbs", days: "steps_days", goodDay: STEPS_DAY, icon: "steps", id: "steps",
      targets: [5_000, 10_000, 15_000, 20_000], tier: thousands, title: "Steps", unit: "steps",
    }),
  context: "Steps",
  id: "steps",
  ordered: false,
  rule: () => "Walk more in a day. Steps come from Apple Health.",
  title: "Steps",
};

const BURNED: AchievementFamily = {
  badges: () =>
    dayBest({
      best: "burned_best", color: "protein", days: "burned_days", goodDay: BURNED_DAY_KCAL, icon: "burn", id: "burned",
      targets: [300, 500, 750, 1_000], tier: thousands, title: "Burned", unit: "kcal",
    }),
  context: "Calories burned",
  id: "burned",
  ordered: false,
  rule: () => "Burn more by moving in a day. It comes from Apple Health.",
  title: "Calories burned",
};

const ASSISTANT: AchievementFamily = {
  badges: () => {
    const badge = (
      id: string, icon: BadgeIcon, metric: MetricName, target: number, name: string, title: string, description: string,
      toGo: (left: number) => string, unit = "", tier = "",
    ): Achievement => ({ color: "champagne", description, icon, id: `assistant-${id}`, metric, name, target, tier, title, toGo, unit });
    return [
      badge("chat", "chat", "assistant_chats", 1, "Hello", "First message", "You wrote to your coach.", () => "Write to your coach."),
      badge("voice", "mic", "assistant_voice_notes", 1, "Voice note", "First voice note", "You sent your coach a voice note.", () => "Send your coach a voice note."),
      badge("call", "phone", "assistant_calls", 1, "Call", "First call", "You talked with your coach.", () => "Talk live with your coach."),
      badge("photo", "camera", "assistant_photos", 1, "Photo", "Show and ask", "You showed your coach a photo.", () => "Send your coach a photo, like a menu."),
      badge("reply", "sparkles", "assistant_openers", 1, "Reply", "Picked up the thread", "You followed up on a message on Today.", () => "Tap your coach’s message on Today."),
      badge("idea", "food", "assistant_ideas", 1, "Idea", "Good idea", "You added a meal your coach suggested.", () => "Add a meal your coach suggests."),
      badge("recipe", "food", "recipes_saved", 1, "Recipe", "First recipe", "You saved a recipe from your coach.", () => "Ask your coach for a recipe and save it."),
      badge("ideas-10", "food", "assistant_ideas", 10, "10 ideas", "10 ideas eaten", "Ten of your coach’s ideas in your diary.", (left) => `${plural(left, "more idea")} to add.`, "ideas", "10"),
      badge("chats-50", "chat", "assistant_chats", 50, "50 messages", "50 messages", "Fifty messages answered by your coach.", (left) => `${plural(left, "more message")} to go.`, "messages", "50"),
      badge("calls-5", "phone", "assistant_calls", 5, "5 calls", "5 calls", "Five conversations with your coach.", (left) => `${plural(left, "more call")} to go.`, "calls", "5"),
      ...[10, 60, 300].map((minutes) =>
        badge(
          `minutes-${minutes}`, "clock", "assistant_minutes", minutes, minutes < 60 ? `${minutes} min` : plural(minutes / 60, "hour"),
          `${minutes < 60 ? `${minutes} minutes` : plural(minutes / 60, "hour")} together`,
          `${minutes < 60 ? `${minutes} minutes` : plural(minutes / 60, "hour")} spent with your coach.`,
          (left) => `${plural(Math.ceil(left), "more minute")} with your coach.`, "minutes", minutes < 60 ? `${minutes}M` : `${minutes / 60}H`,
        ),
      ),
    ];
  },
  context: "Assistant",
  id: "assistant",
  ordered: false,
  rule: () => "Get to know your coach: write, talk, show and cook.",
  title: "Assistant",
};

// In the order the app shows them.
export const ACHIEVEMENT_FAMILIES: readonly AchievementFamily[] = [STREAKS, PROTEIN, CALORIES, STEPS, BURNED, ASSISTANT, WEIGHT, FIRSTS];
