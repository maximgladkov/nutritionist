import { createHash } from "node:crypto";
import { prisma } from "./prisma.ts";

// What each plan allows. null means no limit.
export type PlanLimits = {
  // Minutes of AI each week: chat, voice notes, calls, photo and label reading.
  aiWeeklyMinutes: number | null;
  // Groups someone may own.
  groups: number | null;
  // Active clients across all of a coach's groups.
  members: number;
  // Owners review members' days: marking them reviewed and reacting.
  reviews: boolean;
  // Minutes of live talk each week; fair use on paid plans.
  talkWeeklyMinutes: number;
  themes: boolean;
};

export const PLAN_IDS = ["free", "plus", "pro10", "pro30", "pro100"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

const pro = (members: number): PlanLimits => ({
  aiWeeklyMinutes: null,
  groups: null,
  members,
  reviews: true,
  talkWeeklyMinutes: 120,
  themes: true,
});

export const PLANS: Record<PlanId, PlanLimits> = {
  free: { aiWeeklyMinutes: 30, groups: 0, members: 0, reviews: false, talkWeeklyMinutes: 15, themes: false },
  plus: { aiWeeklyMinutes: null, groups: 3, members: 0, reviews: false, talkWeeklyMinutes: 60, themes: true },
  pro10: pro(10),
  pro30: pro(30),
  pro100: pro(100),
};

export const PLAN_NAMES: Record<PlanId, string> = {
  free: "Free",
  plus: "Plus",
  pro10: "Pro 10",
  pro30: "Pro 30",
  pro100: "Pro 100",
};

export type BillingPeriod = "annual" | "monthly";

// App Store product ids, as set up in App Store Connect: me.btr.<plan>.<period>.
export function productId(plan: Exclude<PlanId, "free">, period: BillingPeriod): string {
  return `me.btr.${plan}.${period}`;
}

export function planForProduct(product: string): Exclude<PlanId, "free"> | null {
  const match = /^me\.btr\.(plus|pro10|pro30|pro100)\.(monthly|annual)$/.exec(product);
  return match ? (match[1] as Exclude<PlanId, "free">) : null;
}

export const PRODUCT_IDS = PLAN_IDS.filter((plan): plan is Exclude<PlanId, "free"> => plan !== "free").flatMap((plan) => [
  productId(plan, "monthly"),
  productId(plan, "annual"),
]);

const RANK: Record<PlanId, number> = { free: 0, plus: 1, pro10: 2, pro30: 3, pro100: 4 };

export function isPro(plan: PlanId): boolean {
  return RANK[plan] >= RANK.pro10;
}

// StoreKit wants a UUID to tie a purchase to an account; ours are cuids, so it's derived from the id.
export function appAccountToken(userId: string): string {
  const hex = createHash("sha256").update(`btrme-account:${userId}`).digest("hex");
  // Shaped as a version 4, variant 1 UUID so StoreKit accepts it.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export type PlanSource = "apple" | "free";

export type CurrentPlan = {
  expiresAt: string | null;
  id: PlanId;
  limits: PlanLimits;
  productId: string | null;
  source: PlanSource;
  willRenew: boolean;
};

const FREE: CurrentPlan = {
  expiresAt: null,
  id: "free",
  limits: PLANS.free,
  productId: null,
  source: "free",
  willRenew: false,
};

// The best subscription someone is paying for right now, if any.
async function paidPlan(userId: string, now: Date): Promise<CurrentPlan | null> {
  const subscriptions = await prisma.appleSubscription.findMany({
    where: { expiresAt: { gt: now }, revokedAt: null, userId },
  });
  let best: CurrentPlan | null = null;
  for (const subscription of subscriptions) {
    const id = planForProduct(subscription.productId);
    if (!id || (best && RANK[best.id] >= RANK[id])) continue;
    best = {
      expiresAt: subscription.expiresAt.toISOString(),
      id,
      limits: PLANS[id],
      productId: subscription.productId,
      source: "apple",
      willRenew: subscription.willRenew,
    };
  }
  return best;
}

// People in a coach's groups, earliest first, counted against the plan's active clients: the first
// `members` of them, so someone joining past the cap doesn't take a spot from anyone.
export async function activeClients(ownerId: string, members: number): Promise<string[]> {
  if (members <= 0) return [];
  const rows = await prisma.groupMember.findMany({
    orderBy: { joinedAt: "asc" },
    select: { userId: true },
    where: { group: { ownerId }, role: "member", userId: { not: ownerId } },
  });
  return [...new Set(rows.map((row) => row.userId))].slice(0, members);
}

export async function loadPlan(userId: string, now: Date): Promise<CurrentPlan> {
  return (await paidPlan(userId, now)) ?? FREE;
}
