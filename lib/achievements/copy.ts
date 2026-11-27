import { formatNumber, type Locale } from "../i18n/locales.ts";
import { de } from "./copy.de.ts";
import { es } from "./copy.es.ts";
import { fr } from "./copy.fr.ts";
import { it } from "./copy.it.ts";
import { ru } from "./copy.ru.ts";

// Everything the achievements API says, per language. Whole sentences, not pieces glued together,
// so each language can put numbers and plurals where they belong.

export type Unit = "calls" | "days" | "foods" | "ideas" | "kcal" | "kg" | "messages" | "minutes" | "steps" | "weigh-ins";

export type OnceId = "first-barcode" | "first-group" | "first-photo" | "first-voice";
export type AssistantId = "call" | "calls-5" | "chat" | "chats-50" | "idea" | "ideas-10" | "photo" | "recipe" | "reply" | "voice";
export type StreakDays = 3 | 7 | 14 | 30 | 100 | 365;
export type TierDays = 7 | 30 | 365;
export type WeightStep = "gain-1" | "gain-5" | "lose-1" | "lose-5";

type Family = { context: string; title: string };
type Text = { description: string; name: string; title: string };

// Steps and calories burned: so much in one day, then a good day that often.
type DayBest = Family & {
  // "10,000 steps", for the "that often" badges' titles.
  oftenTitle: string;
  oftenEarned: readonly [days7: string, days30: string];
  // `amount` is already written out ("10,000 steps").
  inADay: (amount: string) => string;
  inOneDay: (amount: string) => string;
  oftenToGo: (left: number, amount: string) => string;
  rule: string;
  targets: Record<number, string>;
};

export type AchievementCopy = {
  locale: Locale;
  number: (value: number) => string;
  // "7 days", "1,000 kcal".
  count: (value: number, unit: Unit) => string;
  notStarted: string;
  unlocked: string;
  toGo: (left: number, unit: Unit | "") => string;

  streak: {
    message: (input: { best: number; days: number; loggedToday: boolean }) => string;
    next: (title: string) => string;
    daysToGo: (left: number) => string;
  };
  streaks: Family & {
    badgeTitle: (days: number) => string;
    rule: string;
    tiers: Record<StreakDays, { description: string; name: string }>;
    toGo: (left: number) => string;
  };
  // Names of the 7-day, 1-month and 1-year badges.
  tiers: Record<TierDays, string>;
  protein: Family & {
    describe: (days: number) => string;
    rule: (grams: number | null) => string;
    toGo: (left: number, grams: number | null) => string;
  };
  calories: Family & {
    badgeTitle: string;
    describe: (days: number) => string;
    rule: (kcal: number | null) => string;
    toGo: (left: number, kcal: number | null) => string;
  };
  weight: Family & {
    goalDescription: (kg: string) => string;
    goalName: string;
    goalTitle: (kg: string) => string;
    rule: (from: string | null, to: string | null) => string;
    steps: Record<WeightStep, { description: string; title: string }>;
    toGo: (kg: string) => string;
  };
  firsts: Family & {
    foods: Text & { toGo: (left: number) => string };
    once: Record<OnceId, Text & { toGo: string }>;
    rule: string;
    weighIns: Text & { toGo: (left: number) => string };
  };
  steps: DayBest;
  burned: DayBest;
  assistant: Family & {
    badges: Record<AssistantId, Text & { toGo: (left: number) => string }>;
    minutes: (minutes: number) => Text & { toGo: (left: number) => string };
    rule: string;
  };
};

function plural(n: (value: number) => string, count: number, one: string, many = `${one}s`): string {
  return `${n(count)} ${count === 1 ? one : many}`;
}

const enNumber = (value: number) => formatNumber("en", value);
const p = (count: number, one: string, many?: string) => plural(enNumber, count, one, many);

const EN_UNITS: Record<Unit, [one: string, many: string]> = {
  calls: ["call", "calls"],
  days: ["day", "days"],
  foods: ["food", "foods"],
  ideas: ["idea", "ideas"],
  kcal: ["kcal", "kcal"],
  kg: ["kg", "kg"],
  messages: ["message", "messages"],
  minutes: ["minute", "minutes"],
  steps: ["steps", "steps"],
  "weigh-ins": ["weigh-in", "weigh-ins"],
};

export const en: AchievementCopy = {
  count: (value, unit) => p(value, ...EN_UNITS[unit]),
  locale: "en",
  notStarted: "Not started",
  number: enNumber,
  toGo: (left, unit) => `${left} ${unit || "more"} to go.`,
  unlocked: "Unlocked",

  streak: {
    daysToGo: (left) => `${left} ${left === 1 ? "day" : "days"} to go`,
    message: ({ best, days, loggedToday }) => {
      if (days === 0) return "Log a meal today to start a streak.";
      const standing = days === best ? "Your best so far." : `Your best is ${best} ${best === 1 ? "day" : "days"}.`;
      return loggedToday ? `${standing} You’ve logged today.` : `${standing} Log a meal today to keep it.`;
    },
    next: (title) => `Next: ${title}`,
  },
  streaks: {
    badgeTitle: (days) => `${days}-day streak`,
    context: "Day streak",
    rule: "Log at least one meal every day.",
    tiers: {
      3: { description: "Three days in a row with at least one meal logged.", name: "3 days" },
      7: { description: "A full week of logging. This is where habits start.", name: "7 days" },
      14: { description: "Two weeks of logging without a gap.", name: "14 days" },
      30: { description: "A whole month of logging. It’s a habit now.", name: "30 days" },
      100: { description: "A hundred days in a row. Few people get here.", name: "100 days" },
      365: { description: "A year of logging, every single day.", name: "1 year" },
    },
    title: "Streaks",
    toGo: (left) => `${p(left, "more day")} in a row with a meal logged.`,
  },
  tiers: { 7: "7 days", 30: "1 month", 365: "1 year" },
  protein: {
    context: "Protein goal",
    describe: (days) => `Your muscles noticed. ${p(days, "day")} you can be proud of.`,
    rule: (grams) =>
      grams ? `Eat at least ${grams} grams of protein in a day.` : "Set a protein goal, then reach it in a day.",
    title: "Protein goal",
    toGo: (left, grams) =>
      grams ? `${p(left, "more day")} with ${grams} grams of protein.` : "Set a protein goal to start this one.",
  },
  calories: {
    badgeTitle: "On target",
    context: "Calories on target",
    describe: (days) => `Within 10% of your goal, for ${p(days, "day")}. That’s balance.`,
    rule: (kcal) =>
      kcal
        ? `Stay within 10% of ${enNumber(kcal)} kcal for the day.`
        : "Set a calorie goal, then stay within 10% of it for the day.",
    title: "Calories on target",
    toGo: (left, kcal) =>
      kcal ? `${p(left, "more day")} within 10% of your calorie goal.` : "Set a calorie goal to start this one.",
  },
  weight: {
    context: "Weight",
    goalDescription: (kg) => `You reached your goal of ${kg} kg.`,
    goalName: "Goal",
    goalTitle: (kg) => `Goal weight · ${kg} kg`,
    rule: (from, to) => (from && to ? `Milestones on the way from ${from} to ${to} kg.` : "Milestones on the way to your goal weight."),
    steps: {
      "gain-1": { description: "You gained your first kilo. Keep going.", title: "First kilo up" },
      "gain-5": { description: "Five kilos heavier than where you started.", title: "Five kilos up" },
      "lose-1": { description: "You lost your first kilo. Keep going.", title: "First kilo down" },
      "lose-5": { description: "Five kilos lighter than where you started.", title: "Five kilos down" },
    },
    title: "Weight",
    toGo: (kg) => `${kg} kg to go.`,
  },
  firsts: {
    context: "First time",
    foods: {
      description: "Your diary knows you by now.",
      name: "100 foods",
      title: "100 foods logged",
      toGo: (left) => `${p(left, "more food")} to log.`,
    },
    once: {
      "first-barcode": { description: "Point, beep, logged. That’s all it takes.", name: "Barcode", title: "First barcode scan", toGo: "Scan the barcode on a product." },
      "first-group": { description: "It’s easier together.", name: "Group", title: "Joined a group", toGo: "Join a group with a code or a link." },
      "first-photo": { description: "Your diary looks tastier already.", name: "Photo", title: "First meal photo", toGo: "Add a photo to a meal." },
      "first-voice": { description: "No typing needed.", name: "Voice", title: "Describe by voice", toGo: "Say what you ate instead of typing it." },
    },
    rule: "Try every way to log and connect.",
    title: "Firsts",
    weighIns: {
      description: "The trend matters more than any one number.",
      name: "Weigh-ins",
      title: "10 weigh-ins",
      toGo: (left) => `${p(left, "more weigh-in")} to log.`,
    },
  },
  steps: {
    context: "Steps",
    inADay: (amount) => `${amount} in a day`,
    inOneDay: (amount) => `Walk ${amount} in one day.`,
    oftenEarned: ["That many times past 10,000. It’s becoming a habit.", "A month’s worth of days past 10,000. Strong legs."],
    oftenTitle: "10,000 steps",
    oftenToGo: (left, amount) => `${p(left, "more day")} walking ${amount} or more.`,
    rule: "Steps you walk in a day, from Apple Health.",
    targets: {
      5_000: "A proper walk. A great place to start.",
      10_000: "The classic, and you made it.",
      15_000: "That’s around eleven kilometres for most people.",
      20_000: "Feet up. You’ve earned it.",
    },
    title: "Steps",
  },
  burned: {
    context: "Calories burned",
    inADay: (amount) => `${amount} burned in a day`,
    inOneDay: (amount) => `Burn ${amount} by moving in one day.`,
    oftenEarned: ["That many active days. Your body notices.", "A month’s worth of active days. Impressive."],
    oftenTitle: "500 kcal burned",
    oftenToGo: (left, amount) => `${p(left, "more day")} burning ${amount} or more.`,
    rule: "Calories you burn by moving in a day, from Apple Health.",
    targets: {
      300: "A good, solid workout’s worth.",
      500: "You really moved. It shows.",
      750: "A big day. Drink some water.",
      1_000: "A huge day. Rest well and eat properly.",
    },
    title: "Calories burned",
  },
  assistant: {
    badges: {
      call: { description: "Good conversation. It remembers what you said.", name: "Call", title: "First call", toGo: () => "Talk live with your coach." },
      "calls-5": { description: "Some things are better said out loud.", name: "5 calls", title: "5 calls", toGo: (left) => `${p(left, "more call")} to go.` },
      chat: { description: "Ask anything, any time. It knows your diary.", name: "Hello", title: "First message", toGo: () => "Write to your coach." },
      "chats-50": { description: "You know each other well by now.", name: "50 messages", title: "50 messages", toGo: (left) => `${p(left, "more message")} to go.` },
      idea: { description: "Your coach suggested it, you ate it.", name: "Idea", title: "Good idea", toGo: () => "Add a meal your coach suggests." },
      "ideas-10": { description: "You two clearly have the same taste.", name: "10 ideas", title: "10 ideas eaten", toGo: (left) => `${p(left, "more idea")} to add.` },
      photo: { description: "A picture is worth a thousand words. Menus work too.", name: "Photo", title: "Show and ask", toGo: () => "Send your coach a photo, like a menu." },
      recipe: { description: "It’s waiting in Log food whenever you cook.", name: "Recipe", title: "First recipe", toGo: () => "Ask your coach for a recipe and save it." },
      reply: { description: "A quick tap on Today, and you’re talking.", name: "Reply", title: "Picked up the thread", toGo: () => "Tap your coach’s message on Today." },
      voice: { description: "Easier than typing with your hands full.", name: "Voice note", title: "First voice note", toGo: () => "Send your coach a voice note." },
    },
    context: "Assistant",
    minutes: (minutes) => ({
      description: minutes < 60 ? "Off to a good start, you and your coach." : minutes < 300 ? "Time well spent." : "Practically old friends.",
      name: minutes < 60 ? `${minutes} min` : p(minutes / 60, "hour"),
      title: `${minutes < 60 ? `${minutes} minutes` : p(minutes / 60, "hour")} together`,
      toGo: (left) => `${p(Math.ceil(left), "more minute")} with your coach.`,
    }),
    rule: "Get to know your coach: write, talk, show and cook.",
    title: "Assistant",
  },
};

const COPY: Record<Locale, AchievementCopy> = { de, en, es, fr, it, ru };

export function achievementCopy(locale: Locale): AchievementCopy {
  return COPY[locale];
}
