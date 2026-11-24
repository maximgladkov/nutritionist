import { prisma } from "../prisma.ts";
import { shiftYmd } from "../timezone.ts";
import { ACHIEVEMENT_FAMILIES, type Achievement, type AchievementFamily } from "./catalog.ts";
import { computeMetrics, earnedDate, type AchievementContext, type Metrics } from "./metrics.ts";

const CLOSEST = 3;
const LATEST = 3;

export type BadgeView = {
  color: string;
  // What it was for once earned, what's left to do until then.
  description: string;
  // The day it was earned (YYYY-MM-DD), or null.
  earnedOn: string | null;
  familyContext: string;
  icon: string;
  id: string;
  name: string;
  // 0 to 1; 1 exactly when earned.
  progress: number;
  // "5 / 7 days"; "Not started" when there's nothing yet.
  progressText: string;
  target: number;
  tier: string;
  title: string;
  value: number;
};

function badgeView(badge: Achievement, family: AchievementFamily, metrics: Metrics, earnedOn: string | null): BadgeView {
  const value = earnedOn ? badge.target : Math.max(0, metrics[badge.metric].value);
  const left = Math.max(0, Math.round((badge.target - value) * 10) / 10);
  const progressText = badge.unit
    ? value > 0
      ? `${value.toLocaleString("en-US")} / ${badge.target.toLocaleString("en-US")} ${badge.unit}`
      : "Not started"
    : "Not started";
  return {
    color: badge.color,
    description: earnedOn ? badge.description : (badge.toGo?.(left) ?? `${left} ${badge.unit || "more"} to go.`),
    earnedOn,
    familyContext: family.context,
    icon: badge.icon,
    id: badge.id,
    name: badge.name,
    // Passed before but not now (a streak that has since broken) shows where it stands now.
    progress: earnedOn ? 1 : Math.min(0.99, value / badge.target),
    progressText: earnedOn ? (badge.unit ? `${badge.target.toLocaleString("en-US")} ${badge.unit}` : "Done") : progressText,
    target: badge.target,
    tier: badge.tier,
    title: badge.title,
    value,
  };
}

function byCloseness(a: BadgeView, b: BadgeView): number {
  return b.progress - a.progress;
}

function streakView(context: AchievementContext, metrics: Metrics, streaks: readonly BadgeView[]) {
  const { loggedDates, today } = context;
  const days = metrics.logging_streak.value;
  const best = Math.max(days, ...metrics.logging_streak.history.map((point) => point.value));
  const loggedToday = loggedDates.has(today);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = shiftYmd(today, -((weekday + 6) % 7));
  const standing = days === best ? "Your best so far." : `Your best is ${best} ${best === 1 ? "day" : "days"}.`;
  const next = streaks.find((badge) => badge.earnedOn === null);
  const left = next ? next.target - days : 0;
  return {
    best,
    days,
    loggedToday,
    message:
      days === 0
        ? "Log a meal today to start a streak."
        : loggedToday
          ? `${standing} You’ve logged today.`
          : `${standing} Log a meal today to keep it.`,
    next: next
      ? { label: `Next: ${next.title}`, progress: next.progress, remaining: `${left} ${left === 1 ? "day" : "days"} to go` }
      : null,
    week: Array.from({ length: 7 }, (_, index) => {
      const date = shiftYmd(monday, index);
      return { date, future: date > today, logged: loggedDates.has(date) };
    }),
  };
}

// Where the person stands on every badge. Badges reached since the last look are stored on the way,
// so they stay earned whatever changes afterwards.
export async function achievementsView(userId: string) {
  const [{ context, metrics }, stored] = await Promise.all([
    computeMetrics(userId),
    prisma.userAchievement.findMany({ select: { achievementId: true, earnedOn: true }, where: { userId } }),
  ]);
  const earned = new Map(stored.map((row) => [row.achievementId, row.earnedOn]));
  const earnedIds = new Set(earned.keys());
  const families = ACHIEVEMENT_FAMILIES.map((family) => ({ badges: family.badges(context, earnedIds), family }));

  const reached: { achievementId: string; earnedOn: string; userId: string }[] = [];
  for (const badge of families.flatMap(({ badges }) => badges)) {
    if (earned.has(badge.id)) continue;
    const earnedOn = earnedDate(metrics[badge.metric], badge.target);
    if (earnedOn === null) continue;
    earned.set(badge.id, earnedOn);
    reached.push({ achievementId: badge.id, earnedOn, userId });
  }
  if (reached.length > 0) {
    await prisma.userAchievement.createMany({ data: reached, skipDuplicates: true });
  }

  const shown = families.map(({ badges, family }) => {
    const views = badges.map((badge) => badgeView(badge, family, metrics, earned.get(badge.id) ?? null));
    const done = views.filter((badge) => badge.earnedOn !== null);
    const open = views.filter((badge) => badge.earnedOn === null);
    // Earned first, so what's behind is always to the left of what's next.
    const items = family.ordered
      ? [...done, ...open]
      : [...done.sort((a, b) => a.earnedOn!.localeCompare(b.earnedOn!)), ...open.sort(byCloseness)];
    return {
      // The badge being worked on; null once the whole family is earned.
      activeId: open[0]?.id ?? null,
      badges: items,
      earned: done.length,
      id: family.id,
      ordered: family.ordered,
      rule: family.rule(context),
      title: family.title,
    };
  });

  // The next one of each ordered family and any of the unordered ones; later ones only fill in
  // when there's nothing nearer left.
  const within: BadgeView[] = [];
  const beyond: BadgeView[] = [];
  for (const family of shown) {
    const open = family.badges.filter((badge) => badge.earnedOn === null);
    within.push(...(family.ordered ? open.slice(0, 1) : open));
    if (family.ordered) beyond.push(...open.slice(1));
  }
  const closest = [...within.sort(byCloseness), ...beyond.sort(byCloseness)].slice(0, CLOSEST);
  const all = shown.flatMap((family) => family.badges);
  const latest = all
    .filter((badge) => badge.earnedOn !== null)
    .sort((a, b) => b.earnedOn!.localeCompare(a.earnedOn!))
    .slice(0, LATEST);

  return {
    closest,
    earnedCount: all.filter((badge) => badge.earnedOn !== null).length,
    families: shown.map(({ ordered: _ordered, ...family }) => family),
    latest,
    streak: streakView(context, metrics, shown.find((family) => family.id === "streaks")?.badges ?? []),
    totalCount: all.length,
  };
}
