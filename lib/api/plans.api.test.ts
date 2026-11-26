import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import type { AppleNotification, AppleRenewalInfo, AppleTransaction } from "../apple-storekit.ts";
import { StoreKitError } from "../apple-storekit.ts";
import { appAccountToken } from "../plans.ts";
import { prisma } from "../prisma.ts";
import { setApiDeps } from "./deps.ts";
import { api, closeDatabase, givePlan, installFakes, resetDatabase, signIn, type Session } from "./test/harness.ts";

const NOW = new Date("2026-03-11T14:00:00Z");
const DAY = 86_400_000;

// Signed payloads in tests are `<kind>:<json>`; anything else fails verification, as a forgery would.
function read<T>(kind: string, jws: string): T {
  if (!jws.startsWith(`${kind}:`)) throw new StoreKitError("Not signed by Apple.");
  return JSON.parse(jws.slice(kind.length + 1)) as T;
}
const fakeApple = {
  notification: async (jws: string) => read<AppleNotification>("note", jws),
  renewalInfo: async (jws: string) => read<AppleRenewalInfo>("renewal", jws),
  transaction: async (jws: string) => read<AppleTransaction>("tx", jws),
};

let me: Session;

function transaction(overrides: Partial<AppleTransaction> = {}, owner: Session = me): string {
  const value: AppleTransaction = {
    appAccountToken: appAccountToken(owner.userId),
    bundleId: "me.btr.app",
    environment: "Sandbox",
    expiresDate: NOW.getTime() + 30 * DAY,
    originalTransactionId: "1000",
    productId: "me.btr.plus.monthly",
    transactionId: "1000",
    ...overrides,
  };
  return `tx:${JSON.stringify(value)}`;
}

const buy = (signed: string, session: Session = me) =>
  api("POST", "/plan/apple", { body: { signedTransactions: [signed] }, token: session.accessToken });
const plan = async (session: Session = me) => (await api("GET", "/plan", { token: session.accessToken })).body;

beforeEach(async () => {
  installFakes();
  await resetDatabase();
  me = await signIn("plans@example.com");
  setApiDeps({ apple: fakeApple, now: () => NOW });
});
after(closeDatabase);

describe("plans", () => {
  it("starts everyone on Free, with an account token for StoreKit", async () => {
    const view = await plan();
    assert.equal(view.plan.id, "free");
    assert.equal(view.plan.source, "free");
    assert.equal(view.plan.limits.groups, 0);
    assert.match(view.appAccountToken, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(view.appAccountToken, appAccountToken(me.userId));
    assert.deepEqual(view.plans.map((row: { id: string }) => row.id), ["free", "plus", "pro10", "pro30", "pro100"]);
    assert.ok(view.productIds.includes("me.btr.pro30.annual"));
    assert.equal(view.usage.ai.limit, 30 * 60);
    assert.equal(view.usage.talk.limit, 15 * 60);
  });

  it("unlocks Plus after a purchase, everywhere the plan shows", async () => {
    const bought = await buy(transaction());
    assert.equal(bought.status, 201, JSON.stringify(bought.body));
    assert.equal(bought.body.plan.id, "plus");
    assert.equal(bought.body.plan.source, "apple");
    assert.equal(bought.body.usage.ai.limit, null);
    assert.equal((await api("GET", "/me", { token: me.accessToken })).body.plan, "plus");
    const usage = (await api("GET", "/assistant/usage", { token: me.accessToken })).body;
    assert.equal(usage.plan, "plus");
    assert.equal(usage.limit, null);
    assert.equal(usage.asleep, false);
    assert.equal(usage.talkLimit, 60 * 60);
  });

  it("keeps the best plan when there are several", async () => {
    await buy(transaction());
    await buy(transaction({ originalTransactionId: "2000", productId: "me.btr.pro30.annual", transactionId: "2000" }));
    assert.equal((await plan()).plan.id, "pro30");
  });

  it("ignores subscriptions that have run out", async () => {
    await buy(transaction({ expiresDate: NOW.getTime() - DAY }));
    assert.equal((await plan()).plan.id, "free");
  });

  it("refuses purchases made for another account, another app or another product", async () => {
    const other = await signIn("other@example.com");
    const theirs = await buy(transaction({}, other));
    assert.equal(theirs.status, 409);
    assert.equal(theirs.body.error.code, "subscription_other_account");

    assert.equal((await buy(transaction({}, other), other)).status, 201);
    // The same subscription, sent again from someone else's phone without a token.
    const restored = await buy(transaction({ appAccountToken: undefined }));
    assert.equal(restored.status, 409);

    assert.equal((await buy(transaction({ bundleId: "com.example.app", originalTransactionId: "3000" }))).body.error.code, "subscription_wrong_app");
    assert.equal((await buy(transaction({ originalTransactionId: "3001", productId: "me.btr.gold" }))).body.error.code, "subscription_unknown_product");
    assert.equal((await buy("forged")).body.error.code, "invalid_purchase");
    assert.equal((await plan()).plan.id, "free");
  });
});

describe("App Store notifications", () => {
  const notify = (transactionValue: string, renewal?: AppleRenewalInfo) =>
    api("POST", "/plan/apple/notifications", {
      body: {
        signedPayload: `note:${JSON.stringify({
          data: {
            bundleId: "me.btr.app",
            signedRenewalInfo: renewal ? `renewal:${JSON.stringify(renewal)}` : undefined,
            signedTransactionInfo: transactionValue,
          },
          notificationType: "DID_RENEW",
          notificationUUID: "n1",
        })}`,
      },
    });

  it("follows renewals, cancelled auto-renew and refunds", async () => {
    await buy(transaction());
    const renewed = await notify(transaction({ expiresDate: NOW.getTime() + 60 * DAY, transactionId: "1001" }), {
      autoRenewStatus: 0,
      originalTransactionId: "1000",
    });
    assert.equal(renewed.status, 200);
    let view = await plan();
    assert.equal(view.plan.expiresAt, new Date(NOW.getTime() + 60 * DAY).toISOString());
    assert.equal(view.plan.willRenew, false);

    await notify(transaction({ revocationDate: NOW.getTime() - 1000, transactionId: "1001" }));
    view = await plan();
    assert.equal(view.plan.id, "free");
  });

  it("counts a billing grace period as paid", async () => {
    await buy(transaction());
    await notify(transaction({ expiresDate: NOW.getTime() - DAY }), {
      autoRenewStatus: 1,
      gracePeriodExpiresDate: NOW.getTime() + 3 * DAY,
      originalTransactionId: "1000",
    });
    assert.equal((await plan()).plan.id, "plus");
  });

  it("needs no sign-in, but refuses what Apple didn't sign", async () => {
    assert.equal((await api("POST", "/plan/apple/notifications", { body: { signedPayload: "forged" } })).status, 400);
    // A subscription nobody told us about stays unknown.
    assert.equal((await notify(transaction({ originalTransactionId: "9999" }))).status, 200);
    assert.equal(await prisma.appleSubscription.count(), 0);
  });
});

describe("what plans allow", () => {
  const createGroup = (name: string, session: Session = me) =>
    api("POST", "/groups", { body: { name }, token: session.accessToken });

  it("lets Plus own three groups and Free none", async () => {
    const free = await createGroup("Runners");
    assert.equal(free.status, 403);
    assert.equal(free.body.error.code, "plan_limit");
    assert.deepEqual(free.body.error.details, { feature: "groups", plan: "free", planName: "Free" });

    await givePlan(me.userId, "plus");
    for (const name of ["One", "Two", "Three"]) {
      assert.equal((await createGroup(name)).status, 201);
    }
    const fourth = await createGroup("Four");
    assert.equal(fourth.status, 403);
    assert.equal(fourth.body.error.details.feature, "groups");
    assert.equal((await plan()).usage.groups.used, 3);
  });

  it("keeps reviewing members' days for Pro", async () => {
    await givePlan(me.userId, "plus");
    const group = (await createGroup("Clients")).body.group;
    const board = await api("GET", `/groups/${group.id}/reviews`, { token: me.accessToken });
    assert.equal(board.status, 403);
    assert.equal(board.body.error.details.feature, "reviews");

    await givePlan(me.userId, "pro10");
    assert.equal((await api("GET", `/groups/${group.id}/reviews`, { token: me.accessToken })).status, 200);
  });

  it("counts a Pro coach's active clients, who keep their own plan", async () => {
    await givePlan(me.userId, "pro10");
    const group = (await createGroup("Clients")).body.group;
    const members: Session[] = [];
    for (let index = 0; index < 11; index += 1) {
      const member = await signIn(`member${index}@example.com`);
      assert.equal((await api("POST", `/invites/${group.joinCode}/join`, { token: member.accessToken })).status, 201);
      members.push(member);
    }
    const first = await plan(members[0]);
    assert.equal(first.plan.id, "free");
    assert.equal(first.plan.source, "free");
    assert.equal(first.usage.ai.limit, 30 * 60);

    const coach = await plan();
    assert.deepEqual(coach.usage.members, { covered: 10, limit: 10, total: 11 });
  });

  it("caps live talk each week by plan, inside the AI minutes", async () => {
    const call = (minutes: number) =>
      prisma.assistantAction.create({
        data: {
          callId: `talk:${minutes}`,
          createdAt: new Date(NOW.getTime() - (minutes + 1) * 60_000),
          kind: "talk",
          payload: { endedAt: new Date(NOW.getTime() - 60_000).toISOString(), lines: [] },
          userId: me.userId,
        },
      });
    await call(10);
    await call(6);
    // 16 minutes of talk: past Free's 15, though 14 of the 30 AI minutes are left.
    const free = await api("POST", "/assistant/talk", { token: me.accessToken });
    assert.equal(free.status, 403);
    assert.equal(free.body.error.code, "plan_limit");
    assert.equal(free.body.error.details.feature, "talk");

    await givePlan(me.userId, "plus");
    const plus = await api("POST", "/assistant/talk", { token: me.accessToken });
    assert.equal(plus.status, 200, JSON.stringify(plus.body));
    assert.equal(plus.body.maxSeconds, 600);
  });
});
