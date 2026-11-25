import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ACHIEVEMENT_FAMILIES } from "../achievements/catalog.ts";
import { prisma } from "../prisma.ts";
import { shiftYmd } from "../timezone.ts";
import { api, closeDatabase, flushBackground, installFakes, resetDatabase, seedOffProduct, signIn, uploadPng, type Session } from "./test/harness.ts";

const BREAD = "8480000123459";
let kira: Session;
let newcomer: Session;
let today: string;

type Badge = { description: string; earnedOn: string | null; id: string; progress: number; progressText: string; title: string; value: number };

// 10:00 UTC is the same calendar day in Madrid.
async function eat(userId: string, date: string, totals: { energyKcal?: number; proteins?: number } = {}) {
  return prisma.meal.create({
    data: {
      eatenAt: new Date(`${date}T10:00:00Z`),
      items: { create: [{ amount: 100, grams: 100, name: "Food", nutrimentsPer100g: {}, unit: "g", ...totals }] },
      label: "lunch",
      userId,
    },
  });
}

async function load(session: Session) {
  const result = await api("GET", "/me/achievements", { token: session.accessToken });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body;
}

function badge(view: any, id: string): Badge {
  const found = view.families.flatMap((family: any) => family.badges).find((entry: Badge) => entry.id === id);
  assert.ok(found, `badge ${id}`);
  return found;
}

function family(view: any, id: string): any {
  return view.families.find((entry: any) => entry.id === id);
}

before(async () => {
  installFakes();
  await resetDatabase();
  await seedOffProduct({ barcode: BREAD, name: "Pan", nutriments: { energyKcal100g: 265 } });
  kira = await signIn("kira@example.com");
  newcomer = await signIn("new@example.com");
  today = (await api("GET", "/diary", { token: kira.accessToken })).body.today;
});
after(closeDatabase);

describe("the catalogue", () => {
  it("uses each stored id once", () => {
    const context = { goals: {} as never, goalWeightKg: 55, loggedDates: new Set<string>(), startWeightKg: 65, today };
    const ids = ACHIEVEMENT_FAMILIES.flatMap((entry) => entry.badges(context, new Set()).map((item) => item.id));
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("achievements", () => {
  it("needs a sign-in", async () => {
    assert.equal((await api("GET", "/me/achievements")).status, 401);
  });

  it("starts empty, with the first badge of each family next", async () => {
    const view = await load(newcomer);
    assert.equal(view.earnedCount, 0);
    assert.deepEqual(view.latest, []);
    assert.equal(view.closest.length, 3);
    assert.equal(view.streak.days, 0);
    assert.equal(view.streak.message, "Log a meal today to start a streak.");
    assert.equal(view.streak.week.length, 7);
    assert.equal(family(view, "streaks").activeId, "streak-3");
    assert.equal(badge(view, "streak-3").progressText, "Not started");
    assert.equal(badge(view, "protein-7").description, "Set a protein goal to start this one.");
  });

  it("counts the streak and dates its badges by the day they were reached", async () => {
    for (let back = 7; back >= 1; back -= 1) await eat(kira.userId, shiftYmd(today, -back));
    const view = await load(kira);
    assert.equal(view.streak.days, 7);
    assert.equal(view.streak.best, 7);
    assert.equal(view.streak.message, "Your best so far. Log a meal today to keep it.");
    assert.deepEqual(view.streak.next, { label: "Next: 14-day streak", progress: 0.5, remaining: "7 days to go" });
    assert.equal(badge(view, "streak-3").earnedOn, shiftYmd(today, -5));
    assert.equal(badge(view, "streak-7").earnedOn, shiftYmd(today, -1));
    const streaks = family(view, "streaks");
    assert.equal(streaks.activeId, "streak-14");
    assert.equal(streaks.earned, 2);
    assert.equal(badge(view, "streak-14").progressText, "7 / 14 days");
    assert.equal(view.latest[0].id, "streak-7");
  });

  it("offers only the next badge of an ordered family among the closest", async () => {
    const view = await load(kira);
    const ids = view.closest.map((entry: Badge) => entry.id);
    assert.equal(ids[0], "streak-14");
    assert.ok(!ids.includes("streak-30"));
    assert.equal(ids.length, 3);
  });

  it("keeps earned badges when the diary changes", async () => {
    await prisma.meal.deleteMany({ where: { eatenAt: { gte: new Date(`${shiftYmd(today, -3)}T00:00:00Z`) }, userId: kira.userId } });
    const view = await load(kira);
    assert.equal(view.streak.days, 0);
    assert.equal(badge(view, "streak-7").earnedOn, shiftYmd(today, -1));
    assert.equal(badge(view, "streak-7").progress, 1);
    assert.equal(badge(view, "streak-14").value, 0);
  });

  it("counts days at the protein goal, today's included, and finished days on the calorie target", async () => {
    await prisma.meal.deleteMany({ where: { userId: kira.userId } });
    await api("PUT", "/me/goals", { body: { caloriesPerDay: 1600, proteinGPerDay: 120 }, token: kira.accessToken });
    await eat(kira.userId, shiftYmd(today, -4), { energyKcal: 1440, proteins: 120 });
    await eat(kira.userId, shiftYmd(today, -3), { energyKcal: 1430, proteins: 119 });
    await eat(kira.userId, shiftYmd(today, -2), { energyKcal: 1761, proteins: 60 });
    await eat(kira.userId, shiftYmd(today, -2), { proteins: 60 });
    await eat(kira.userId, today, { energyKcal: 1600, proteins: 130 });
    const view = await load(kira);
    assert.equal(badge(view, "protein-7").value, 3);
    assert.equal(badge(view, "protein-7").description, "4 more days with 120 grams of protein.");
    assert.equal(badge(view, "calories-7").value, 1);
    assert.equal(family(view, "calories").rule, "Stay within 10% of 1,600 kcal for the day.");
  });

  it("marks weight milestones on the way to the goal, and keeps a reached goal after a new one", async () => {
    await api("PUT", "/me/goals", { body: { goalWeightKg: 55 }, token: kira.accessToken });
    await api("PATCH", "/me/weights", { body: { startWeightKg: 65 }, token: kira.accessToken });
    await api("POST", "/me/weights", { body: { date: shiftYmd(today, -9), weightKg: 63.9 }, token: kira.accessToken });
    await api("POST", "/me/weights", { body: { date: shiftYmd(today, -2), weightKg: 59 }, token: kira.accessToken });
    let view = await load(kira);
    assert.equal(badge(view, "weight-lose-1").earnedOn, shiftYmd(today, -9));
    assert.equal(badge(view, "weight-lose-5").earnedOn, shiftYmd(today, -2));
    assert.equal(badge(view, "weight-goal-55").progressText, "6 / 10 kg");
    assert.equal(family(view, "weight").rule, "Milestones on the way from 65 to 55 kg.");
    assert.ok(!family(view, "weight").badges.some((entry: Badge) => entry.id.includes("gain")));

    await api("POST", "/me/weights", { body: { weightKg: 55 }, token: kira.accessToken });
    view = await load(kira);
    assert.equal(badge(view, "weight-goal-55").earnedOn, today);
    await api("PUT", "/me/goals", { body: { goalWeightKg: 53 }, token: kira.accessToken });
    view = await load(kira);
    assert.equal(badge(view, "weight-goal-55").earnedOn, today);
    assert.equal(badge(view, "weight-goal-53").earnedOn, null);
    assert.equal(family(view, "weight").activeId, "weight-goal-53");
  });

  it("follows someone gaining weight, and leaves out steps past their goal", async () => {
    await api("PUT", "/me/goals", { body: { goalWeightKg: 63 }, token: newcomer.accessToken });
    await api("PATCH", "/me/weights", { body: { startWeightKg: 60 }, token: newcomer.accessToken });
    await api("POST", "/me/weights", { body: { weightKg: 61.5 }, token: newcomer.accessToken });
    const view = await load(newcomer);
    assert.deepEqual(family(view, "weight").badges.map((entry: Badge) => entry.id), ["weight-gain-1", "weight-goal-63"]);
    assert.equal(badge(view, "weight-goal-63").progressText, "1.5 / 3 kg");
  });

  it("awards firsts when they happen, earned ones first in the list", async () => {
    const audio = new Uint8Array([...new TextEncoder().encode("RIFF0000WAVE"), ...new Uint8Array(32), ...new TextEncoder().encode("two eggs")]);
    assert.equal((await api("POST", "/log/transcribe", { raw: audio, token: kira.accessToken })).status, 200);
    assert.equal((await api("POST", "/log/analyze", { body: { barcode: BREAD, source: "barcode" }, token: newcomer.accessToken })).status, 200);
    assert.equal((await api("GET", `/foods/barcode/${BREAD}`, { token: newcomer.accessToken })).status, 200);
    await flushBackground();
    const meal = await eat(kira.userId, today);
    const uploadId = await uploadPng(kira.accessToken);
    assert.ok((await api("POST", `/meals/${meal.id}/photos`, { body: { uploadId }, token: kira.accessToken })).status < 300);
    const group = await api("POST", "/groups", { body: { name: "Lean by Spring" }, token: newcomer.accessToken });
    await api("POST", `/invites/${group.body.group.inviteToken}/join`, { body: { sharing: false }, token: kira.accessToken });

    const view = await load(kira);
    const firsts = family(view, "firsts");
    assert.deepEqual(firsts.badges.slice(0, 3).map((entry: Badge) => entry.id).sort(), ["first-group", "first-photo", "first-voice"]);
    assert.equal(badge(view, "first-barcode").earnedOn, null);
    assert.equal(badge(view, "first-barcode").progressText, "Not started");
    // Weigh-ins are furthest along of what's left.
    assert.equal(firsts.activeId, "weigh-ins-10");

    const other = await load(newcomer);
    assert.equal(badge(other, "first-barcode").earnedOn, today);
    // Running a group isn't joining one.
    assert.equal(badge(other, "first-group").earnedOn, null);
  });

  it("is safe to load twice at once", async () => {
    const [first, second] = await Promise.all([load(kira), load(kira)]);
    assert.equal(first.earnedCount, second.earnedCount);
  });

  it("has fewer than three closest badges when few are left, and none when all are earned", async () => {
    const ids = (await load(kira)).families.flatMap((entry: any) => entry.badges.map((item: Badge) => item.id));
    const left = new Set(["streak-365", "protein-365"]);
    await prisma.userAchievement.createMany({
      data: ids.filter((id: string) => !left.has(id)).map((achievementId: string) => ({ achievementId, earnedOn: today, userId: kira.userId })),
      skipDuplicates: true,
    });
    assert.deepEqual((await load(kira)).closest.map((entry: Badge) => entry.id).sort(), ["protein-365", "streak-365"]);
    await prisma.userAchievement.createMany({ data: [...left].map((achievementId) => ({ achievementId, earnedOn: today, userId: kira.userId })) });
    const view = await load(kira);
    assert.deepEqual(view.closest, []);
    assert.equal(view.streak.next, null);
    assert.ok(view.families.every((entry: any) => entry.activeId === null));
  });
});

describe("moving and the assistant", () => {
  let mover: Session;
  const at = (back: number) => new Date(`${shiftYmd(today, -back)}T10:00:00Z`);
  const turn = (back: number, id: string, messages: object = { items: [], steps: [] }, status: "completed" | "failed" = "completed") =>
    prisma.agentTurn.create({
      data: { channel: "app", durationMs: 90_000, messages, sessionId: "m", startedAt: at(back), status, turnId: id, turnSequence: 0, userId: mover.userId },
    });
  const action = (kind: string, back: number, payload: object, state = "open") =>
    prisma.assistantAction.create({ data: { callId: `${kind}:${back}`, createdAt: at(back), kind, payload, state, userId: mover.userId } });

  before(async () => {
    mover = await signIn("mover@example.com");
  });

  it("counts the best day and good days of steps and calories burned", async () => {
    for (let back = 7; back >= 1; back -= 1) {
      await prisma.dailyActivity.create({ data: { activeKcal: back === 3 ? 760.4 : 200, date: shiftYmd(today, -back), steps: back === 2 ? 15_200 : 10_000, userId: mover.userId } });
    }
    await prisma.dailyActivity.create({ data: { activeKcal: 5000, date: shiftYmd(today, 1), steps: 90_000, userId: mover.userId } });
    const view = await load(mover);
    assert.equal(badge(view, "steps-10000").earnedOn, shiftYmd(today, -7));
    assert.equal(badge(view, "steps-15000").earnedOn, shiftYmd(today, -2));
    assert.equal(badge(view, "steps-20000").earnedOn, null);
    assert.equal(badge(view, "steps-20000").progressText, "15,200 / 20,000 steps");
    assert.equal(badge(view, "steps-days-7").earnedOn, shiftYmd(today, -1));
    assert.equal(badge(view, "burned-750").earnedOn, shiftYmd(today, -3));
    assert.equal(badge(view, "burned-1000").earnedOn, null);
    assert.equal(badge(view, "burned-days-7").value, 1);
  });

  it("rewards trying the assistant in different ways, and time with it", async () => {
    await turn(5, "a");
    await turn(5, "failed", undefined, "failed");
    await turn(4, "b", { items: [{ parts: [{ type: "file", url: "https://btr.me/api/v1/uploads/x/content" }], text: "", type: "user" }], steps: [] });
    await action("voice", 4, { durationMs: 60_000 });
    await action("idea", 3, {}, "added");
    await action("home", 3, {}, "opened");
    await action("talk", 2, { endedAt: new Date(at(2).getTime() + 8 * 60_000).toISOString(), lines: [{ atMs: 0, speaker: "user", text: "Hi" }] });
    // Part of the call, so not another message or more time.
    await turn(2, "c");
    const view = await load(mover);
    assert.equal(badge(view, "assistant-chat").earnedOn, shiftYmd(today, -5));
    assert.equal(badge(view, "assistant-photo").earnedOn, shiftYmd(today, -4));
    assert.equal(badge(view, "assistant-voice").earnedOn, shiftYmd(today, -4));
    assert.equal(badge(view, "assistant-idea").earnedOn, shiftYmd(today, -3));
    assert.equal(badge(view, "assistant-reply").earnedOn, shiftYmd(today, -3));
    assert.equal(badge(view, "assistant-call").earnedOn, shiftYmd(today, -2));
    assert.equal(badge(view, "assistant-recipe").earnedOn, null);
    assert.equal(badge(view, "assistant-chats-50").value, 2);
    // 1.5 + 1.5 + 1 + 8.
    assert.equal(badge(view, "assistant-minutes-10").earnedOn, shiftYmd(today, -2));
    assert.equal(badge(view, "assistant-minutes-60").progressText, "12 / 60 minutes");
    assert.equal(badge(await load(newcomer), "assistant-chat").earnedOn, null);
  });
});
