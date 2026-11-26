import { z } from "zod";
import { loadUsage, usageLeft } from "../../assistant/usage.ts";
import {
  appAccountToken,
  isPro,
  loadPlan,
  PLAN_IDS,
  PLAN_NAMES,
  PLANS,
  PRODUCT_IDS,
  sponsoredMembers,
} from "../../plans.ts";
import { prisma } from "../../prisma.ts";
import { applyAppleNotification, saveAppleTransaction } from "../../subscriptions.ts";
import { apiDeps } from "../deps.ts";
import { json, readJson } from "../http.ts";
import type { RouteDefinition } from "../router.ts";

// What someone's plan gives them and how much of it they've used, for the Me tab and the plans screen.
export async function planView(userId: string, now: Date) {
  const [plan, usage, groupsOwned] = await Promise.all([
    loadPlan(userId, now),
    loadUsage(userId, now),
    prisma.group.count({ where: { ownerId: userId } }),
  ]);
  const members = isPro(plan.id)
    ? await prisma.groupMember
        .findMany({ distinct: ["userId"], select: { userId: true }, where: { group: { ownerId: userId }, role: "member" } })
        .then((rows) => rows.length)
    : 0;
  const covered = isPro(plan.id) ? (await sponsoredMembers(userId, plan.limits.members)).length : 0;
  const left = usageLeft(usage);
  return {
    appAccountToken: appAccountToken(userId),
    plan,
    plans: PLAN_IDS.map((id) => ({ id, limits: PLANS[id], name: PLAN_NAMES[id] })),
    productIds: PRODUCT_IDS,
    usage: {
      ai: { left: Number.isFinite(left.ai) ? left.ai : null, limit: usage.limit, used: usage.used },
      groups: { limit: plan.limits.groups, used: groupsOwned },
      members: { covered, limit: plan.limits.members, total: members },
      resetsAt: usage.resetsAt,
      talk: { limit: usage.talkLimit, used: usage.split.talk },
    },
  };
}

export const planRoutes: RouteDefinition[] = [
  {
    handler: ({ user }) => planView(user.id, apiDeps().now()),
    method: "GET",
    path: "/plan",
  },
  {
    // After a purchase or a restore: Apple's signed transaction (StoreKit 2 jwsRepresentation).
    async handler({ request, user }) {
      const body = await readJson(request, z.object({ signedTransactions: z.array(z.string().min(1).max(20_000)).min(1).max(20) }));
      for (const signedTransaction of body.signedTransactions) {
        await saveAppleTransaction({ signedTransaction, userId: user.id, verifier: apiDeps().apple });
      }
      return planView(user.id, apiDeps().now());
    },
    method: "POST",
    path: "/plan/apple",
  },
  {
    // App Store Server Notifications V2; the URL is set in App Store Connect.
    async handler({ request }) {
      const body = await readJson(request, z.object({ signedPayload: z.string().min(1).max(100_000) }));
      await applyAppleNotification(body.signedPayload, apiDeps().apple);
      // Apple retries anything but a 200.
      return json({ received: true });
    },
    auth: false,
    method: "POST",
    path: "/plan/apple/notifications",
  },
];
