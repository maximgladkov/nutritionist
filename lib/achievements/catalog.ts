import type { Locale } from "../i18n/locales.ts";
import { achievementCopy, type AchievementCopy, type AssistantId, type OnceId, type StreakDays, type TierDays, type Unit } from "./copy.ts";
import { BURNED_DAY_KCAL, STEPS_DAY } from "./metrics.ts";
import type { AchievementContext, MetricName } from "./metrics.ts";

// Every badge there is. Adding one is adding an entry here: the app draws whatever families and
// badges the API returns, so a badge on an existing metric and icon needs no app release. An icon
// or colour the app doesn't know yet shows as a plain star on champagne.
//
// Ids are stored with the day a badge was earned, so never change or reuse one.

// The words are in lib/achievements/copy*.ts, one file per language.
//
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
  unit: Unit | "";
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

// Tenths of a kilo, as stored in a goal badge's id ("55.5"); never localized.
function kilos(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function families(copy: AchievementCopy): readonly AchievementFamily[] {
  const kg = (value: number) => copy.number(Math.round(value * 10) / 10);

  // A badge per length of time, all counting the same kind of day.
  function dayTiers(input: {
    idPrefix: string;
    color: BadgeColor;
    describe: (days: number) => string;
    icon: BadgeIcon;
    metric: MetricName;
    title: string;
    toGo: (left: number) => string;
  }): Achievement[] {
    const tiers: { days: TierDays; tier: string }[] = [
      { days: 7, tier: "7D" },
      { days: 30, tier: "1M" },
      { days: 365, tier: "1Y" },
    ];
    return tiers.map(({ days, tier }) => ({
      color: input.color,
      description: input.describe(days),
      icon: input.icon,
      id: `${input.idPrefix}-${days}`,
      metric: input.metric,
      name: copy.tiers[days],
      target: days,
      tier,
      title: `${input.title} · ${copy.tiers[days]}`,
      toGo: input.toGo,
      unit: "days",
    }));
  }

  const STREAKS: AchievementFamily = {
    badges: () =>
      ([
        { days: 3, tier: "3" },
        { days: 7, tier: "7" },
        { days: 14, tier: "14" },
        { days: 30, tier: "30" },
        { days: 100, tier: "100" },
        { days: 365, tier: "1Y" },
      ] as const satisfies readonly { days: StreakDays; tier: string }[]).map(({ days, tier }) => ({
        color: "champagne" as const,
        description: copy.streaks.tiers[days].description,
        icon: "flame" as const,
        id: `streak-${days}`,
        metric: "logging_streak" as const,
        name: copy.streaks.tiers[days].name,
        target: days,
        tier,
        title: copy.streaks.badgeTitle(days),
        toGo: copy.streaks.toGo,
        unit: "days" as const,
      })),
    context: copy.streaks.context,
    id: "streaks",
    ordered: true,
    rule: () => copy.streaks.rule,
    title: copy.streaks.title,
  };

  const PROTEIN: AchievementFamily = {
    badges: ({ goals }) =>
      dayTiers({
        color: "protein",
        describe: copy.protein.describe,
        icon: "protein",
        idPrefix: "protein",
        metric: "protein_days",
        title: copy.protein.title,
        toGo: (left) => copy.protein.toGo(left, goals.proteinGPerDay ?? null),
      }),
    context: copy.protein.context,
    id: "protein",
    ordered: true,
    rule: ({ goals }) => copy.protein.rule(goals.proteinGPerDay ?? null),
    title: copy.protein.title,
  };

  const CALORIES: AchievementFamily = {
    badges: ({ goals }) =>
      dayTiers({
        color: "champagne",
        describe: copy.calories.describe,
        icon: "target",
        idPrefix: "calories",
        metric: "calorie_days",
        title: copy.calories.badgeTitle,
        toGo: (left) => copy.calories.toGo(left, goals.caloriesPerDay ?? null),
      }),
    context: copy.calories.context,
    id: "calories",
    ordered: true,
    rule: ({ goals }) => copy.calories.rule(goals.caloriesPerDay ?? null),
    title: copy.calories.title,
  };

  const WEIGHT: AchievementFamily = {
    badges(context, earnedIds) {
      const direction = weightDirection(context);
      const { goalWeightKg, startWeightKg } = context;
      const goalDistance = goalWeightKg !== null && startWeightKg !== null ? Math.abs(goalWeightKg - startWeightKg) : null;
      const step = (amount: 1 | 5, way: "gain" | "lose"): Achievement => ({
        color: "fat",
        description: copy.weight.steps[`${way}-${amount}`].description,
        icon: way === "lose" ? "down" : "up",
        id: `weight-${way}-${amount}`,
        metric: way === "lose" ? "weight_lost_kg" : "weight_gained_kg",
        name: `${way === "lose" ? "−" : "+"}${copy.count(amount, "kg")}`,
        target: amount,
        tier: `${way === "lose" ? "−" : "+"}${amount}`,
        title: copy.weight.steps[`${way}-${amount}`].title,
        toGo: (left) => copy.weight.toGo(kg(left)),
        unit: "kg",
      });
      const steps = [
        { badge: step(1, "lose"), way: "lose" },
        { badge: step(5, "lose"), way: "lose" },
        { badge: step(1, "gain"), way: "gain" },
        { badge: step(5, "gain"), way: "gain" },
      ]
        // Only the way this person is headed, and no further than their goal; earned ones stay.
        .filter(
          ({ badge, way }) =>
            earnedIds.has(badge.id) || (way === direction && (goalDistance === null || goalDistance === 0 || badge.target <= goalDistance)),
        )
        .map(({ badge }) => badge);

      // A goal weight's badge is that weight's own: a new goal is a new badge.
      const goalBadge = (stored: string, target: number): Achievement => {
        const shown = kg(Number(stored));
        return {
          color: "fat",
          description: copy.weight.goalDescription(shown),
          icon: "flag",
          id: `${GOAL_WEIGHT_PREFIX}${stored}`,
          metric: direction === "lose" ? "weight_lost_kg" : "weight_gained_kg",
          name: copy.weight.goalName,
          target,
          tier: stored,
          title: copy.weight.goalTitle(shown),
          toGo: (left) => copy.weight.toGo(kg(left)),
          unit: "kg",
        };
      };
      const current = goalWeightKg !== null && goalDistance !== null && goalDistance > 0 ? kilos(goalWeightKg) : null;
      const earlier = [...earnedIds]
        .filter((id) => id.startsWith(GOAL_WEIGHT_PREFIX))
        .map((id) => id.slice(GOAL_WEIGHT_PREFIX.length))
        .filter((stored) => stored !== current);
      return [
        ...steps,
        ...earlier.map((stored) => ({ ...goalBadge(stored, 1), unit: "" as const })),
        ...(current !== null ? [goalBadge(current, Math.round((goalDistance ?? 0) * 10) / 10)] : []),
      ];
    },
    context: copy.weight.context,
    id: "weight",
    ordered: true,
    rule: ({ goalWeightKg, startWeightKg }) =>
      goalWeightKg !== null && startWeightKg !== null && goalWeightKg !== startWeightKg
        ? copy.weight.rule(kg(startWeightKg), kg(goalWeightKg))
        : copy.weight.rule(null, null),
    title: copy.weight.title,
  };

  const FIRSTS: AchievementFamily = {
    badges: () => {
      const once = (id: OnceId, icon: BadgeIcon, metric: MetricName): Achievement => {
        const { description, name, title, toGo } = copy.firsts.once[id];
        return { color: "ink", description, icon, id, metric, name, target: 1, tier: "", title, toGo: () => toGo, unit: "" };
      };
      return [
        once("first-barcode", "barcode", "event:barcode_scan"),
        once("first-photo", "camera", "meal_photos"),
        once("first-voice", "mic", "event:voice_note"),
        once("first-group", "group", "groups_joined"),
        { ...copy.firsts.foods, color: "ink", icon: "food", id: "foods-100", metric: "foods_logged", target: 100, tier: "100", unit: "foods" },
        { ...copy.firsts.weighIns, color: "ink", icon: "scale", id: "weigh-ins-10", metric: "weigh_ins", target: 10, tier: "10", unit: "weigh-ins" },
      ];
    },
    context: copy.firsts.context,
    id: "firsts",
    ordered: false,
    rule: () => copy.firsts.rule,
    title: copy.firsts.title,
  };

  // So much in one day, then a good day that often.
  function dayBest(input: {
    id: "burned" | "steps";
    color: BadgeColor;
    icon: BadgeIcon;
    best: MetricName;
    days: MetricName;
    goodDay: number;
    targets: readonly number[];
    tier: (target: number) => string;
    unit: "kcal" | "steps";
  }): Achievement[] {
    const { best, color, days, goodDay, icon, id, targets, tier, unit } = input;
    const words = copy[id];
    const amount = (value: number) => copy.count(value, unit);
    return [
      ...targets.map((target): Achievement => ({
        color, description: words.targets[target] ?? "", icon, id: `${id}-${target}`, metric: best, name: copy.number(target),
        target, tier: tier(target), title: words.inADay(amount(target)), toGo: () => words.inOneDay(amount(target)), unit,
      })),
      ...([[7, words.oftenEarned[0]], [30, words.oftenEarned[1]]] as const).map(([count, earned]): Achievement => ({
        color, description: earned, icon, id: `${id}-days-${count}`, metric: days, name: copy.count(count, "days"),
        target: count, tier: `${count}D`, title: `${words.oftenTitle} · ${copy.count(count, "days")}`,
        toGo: (left) => words.oftenToGo(left, amount(goodDay)), unit: "days",
      })),
    ];
  }

  const thousands = (value: number) => (value >= 1000 ? `${value / 1000}K` : String(value));

  const STEPS: AchievementFamily = {
    badges: () =>
      dayBest({
        best: "steps_best", color: "carbs", days: "steps_days", goodDay: STEPS_DAY, icon: "steps", id: "steps",
        targets: [5_000, 10_000, 15_000, 20_000], tier: thousands, unit: "steps",
      }),
    context: copy.steps.context,
    id: "steps",
    ordered: false,
    rule: () => copy.steps.rule,
    title: copy.steps.title,
  };

  const BURNED: AchievementFamily = {
    badges: () =>
      dayBest({
        best: "burned_best", color: "protein", days: "burned_days", goodDay: BURNED_DAY_KCAL, icon: "burn", id: "burned",
        targets: [300, 500, 750, 1_000], tier: thousands, unit: "kcal",
      }),
    context: copy.burned.context,
    id: "burned",
    ordered: false,
    rule: () => copy.burned.rule,
    title: copy.burned.title,
  };

  const ASSISTANT: AchievementFamily = {
    badges: () => {
      const badge = (id: AssistantId, icon: BadgeIcon, metric: MetricName, target: number, unit: Unit | "" = "", tier = ""): Achievement => ({
        ...copy.assistant.badges[id], color: "champagne", icon, id: `assistant-${id}`, metric, target, tier, unit,
      });
      return [
        badge("chat", "chat", "assistant_chats", 1),
        badge("voice", "mic", "assistant_voice_notes", 1),
        badge("call", "phone", "assistant_calls", 1),
        badge("photo", "camera", "assistant_photos", 1),
        badge("reply", "sparkles", "assistant_openers", 1),
        badge("idea", "food", "assistant_ideas", 1),
        badge("recipe", "food", "recipes_saved", 1),
        badge("ideas-10", "food", "assistant_ideas", 10, "ideas", "10"),
        badge("chats-50", "chat", "assistant_chats", 50, "messages", "50"),
        badge("calls-5", "phone", "assistant_calls", 5, "calls", "5"),
        ...[10, 60, 300].map((minutes): Achievement => ({
          ...copy.assistant.minutes(minutes), color: "champagne", icon: "clock", id: `assistant-minutes-${minutes}`,
          metric: "assistant_minutes", target: minutes, tier: minutes < 60 ? `${minutes}M` : `${minutes / 60}H`, unit: "minutes",
        })),
      ];
    },
    context: copy.assistant.context,
    id: "assistant",
    ordered: false,
    rule: () => copy.assistant.rule,
    title: copy.assistant.title,
  };

  // In the order the app shows them.
  return [STREAKS, PROTEIN, CALORIES, STEPS, BURNED, ASSISTANT, WEIGHT, FIRSTS];
}

const GOAL_WEIGHT_PREFIX = "weight-goal-";

function weightDirection({ goalWeightKg, startWeightKg }: AchievementContext): "gain" | "lose" {
  return goalWeightKg !== null && startWeightKg !== null && goalWeightKg > startWeightKg ? "gain" : "lose";
}

const FAMILIES = new Map<Locale, readonly AchievementFamily[]>();

export function achievementFamilies(locale: Locale = "en"): readonly AchievementFamily[] {
  let found = FAMILIES.get(locale);
  if (!found) {
    found = families(achievementCopy(locale));
    FAMILIES.set(locale, found);
  }
  return found;
}

export const ACHIEVEMENT_FAMILIES: readonly AchievementFamily[] = achievementFamilies("en");
