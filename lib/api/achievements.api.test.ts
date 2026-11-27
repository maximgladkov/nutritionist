import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ACHIEVEMENT_FAMILIES, achievementFamilies } from "../achievements/catalog.ts";
import { de } from "../achievements/copy.de.ts";
import { fr } from "../achievements/copy.fr.ts";
// Not `it`: that is node:test's.
import { it as italian } from "../achievements/copy.it.ts";
import { pt } from "../achievements/copy.pt.ts";
import { ru } from "../achievements/copy.ru.ts";
import { prisma } from "../prisma.ts";
import { shiftYmd } from "../timezone.ts";
import { api, closeDatabase, flushBackground, installFakes, resetDatabase, seedOffProduct, signIn, uploadPng, type Session, givePlan } from "./test/harness.ts";

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

async function load(session: Session, language?: string) {
  const headers = language ? { "accept-language": language } : undefined;
  const result = await api("GET", "/me/achievements", { headers, token: session.accessToken });
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
  it("has the same badges in every language", () => {
    const context = { goals: { caloriesPerDay: 2000, proteinGPerDay: 120 } as never, goalWeightKg: 55.5, loggedDates: new Set<string>(), startWeightKg: 65, today };
    const ids = (locale: "de" | "en" | "es" | "fr" | "it" | "pt" | "ru") =>
      achievementFamilies(locale).flatMap((entry) => entry.badges(context, new Set(["weight-goal-60"])).map((item) => [item.id, item.tier, item.target]));
    assert.deepEqual(ids("ru"), ids("en"));
    assert.deepEqual(ids("es"), ids("en"));
    assert.deepEqual(ids("de"), ids("en"));
    assert.deepEqual(ids("fr"), ids("en"));
    assert.deepEqual(ids("it"), ids("en"));
    assert.deepEqual(ids("pt"), ids("en"));
  });

  it("puts Russian counts in the right form", () => {
    assert.deepEqual([1, 3, 5, 21].map(ru.streak.daysToGo), ["Остался 1 день", "Осталось 3 дня", "Осталось 5 дней", "Остался 21 день"]);
    // Russian groups thousands with a no-break space.
    assert.equal(ru.count(1000, "steps"), "1\u00a0000 шагов");
  });

  it("puts German counts in the right form", () => {
    assert.deepEqual([1, 3].map(de.streak.daysToGo), ["Noch 1 Tag", "Noch 3 Tage"]);
    assert.deepEqual([1, 7].map(de.streaks.badgeTitle), ["1 Tag in Folge", "7 Tage in Folge"]);
    // German groups thousands with a dot.
    assert.equal(de.count(10000, "steps"), "10.000 Schritte");
  });

  it("puts French counts in the right form", () => {
    // French says the singular below 2.
    assert.deepEqual([0, 1, 3].map(fr.streak.daysToGo), ["Encore 0 jour", "Encore 1 jour", "Encore 3 jours"]);
    assert.deepEqual([1, 7].map(fr.streaks.badgeTitle), ["1 jour d’affilée", "7 jours d’affilée"]);
    // French groups thousands with a narrow no-break space.
    assert.equal(fr.count(10000, "steps"), "10\u202f000 pas");
  });

  it("puts Italian counts in the right form", () => {
    // Italian says the singular for exactly 1 only.
    assert.deepEqual([0, 1, 3].map(italian.streak.daysToGo), ["Ancora 0 giorni", "Ancora 1 giorno", "Ancora 3 giorni"]);
    assert.deepEqual([1, 7].map(italian.streaks.badgeTitle), ["1 giorno di fila", "7 giorni di fila"]);
    assert.equal(italian.count(10000, "steps"), "10.000 passi");
  });

  it("puts Portuguese counts in the right form", () => {
    // Portuguese says the singular below 2, like French, and the verb agrees.
    assert.deepEqual([0, 1, 3].map(pt.streak.daysToGo), ["Falta 0 dia", "Falta 1 dia", "Faltam 3 dias"]);
    assert.deepEqual([1, 7].map(pt.streaks.badgeTitle), ["1 dia seguido", "7 dias seguidos"]);
    assert.equal(pt.count(10000, "steps"), "10.000 passos");
  });

  it("uses each stored id once", () => {
    const context = { goals: {} as never, goalWeightKg: 55, loggedDates: new Set<string>(), startWeightKg: 65, today };
    const ids = ACHIEVEMENT_FAMILIES.flatMap((entry) => entry.badges(context, new Set()).map((item) => item.id));
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("what's said once a badge is earned", () => {
  it("adds to the title instead of repeating it", () => {
    const context = { goals: {} as never, goalWeightKg: 55, loggedDates: new Set<string>(), startWeightKg: 65, today };
    const words = (text: string) => new Set((text.toLowerCase().match(/[a-z]{4,}/gu) ?? []).filter((word) => !["your", "with", "days", "that"].includes(word)));
    for (const family of ACHIEVEMENT_FAMILIES.filter((entry) => ["steps", "burned", "assistant", "firsts"].includes(entry.id))) {
      for (const item of family.badges(context, new Set())) {
        const title = words(item.title);
        const repeated = [...words(item.description)].filter((word) => title.has(word));
        assert.ok(repeated.length === 0, `${item.id}: ${repeated.join(", ")}`);
      }
    }
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

  it("writes in the language the app asks for", async () => {
    const russian = await load(kira, "ru");
    assert.equal(russian.streak.message, "Это ваш рекорд. Запишите приём пищи сегодня, чтобы её не прервать.");
    assert.deepEqual(russian.streak.next, { label: "Дальше: 14 дней подряд", progress: 0.5, remaining: "Осталось 7 дней" });
    assert.equal(badge(russian, "streak-14").progressText, "7 / 14 дней");
    assert.equal(family(russian, "streaks").title, "Серии");

    const spanish = await load(kira, "es-ES,es;q=0.9");
    assert.equal(spanish.streak.message, "Es tu mejor racha. Registra una comida hoy para no perderla.");
    assert.deepEqual(spanish.streak.next, { label: "La siguiente: Racha de 14 días", progress: 0.5, remaining: "Faltan 7 días" });
    assert.equal(badge(spanish, "streak-14").progressText, "7 / 14 días");

    const german = await load(kira, "de-DE,de;q=0.9");
    assert.equal(german.streak.message, "Deine bisher beste Serie. Trag heute eine Mahlzeit ein, damit sie hält.");
    assert.deepEqual(german.streak.next, { label: "Als Nächstes: 14 Tage in Folge", progress: 0.5, remaining: "Noch 7 Tage" });
    assert.equal(badge(german, "streak-14").progressText, "7 / 14 Tage");
    assert.equal(family(german, "streaks").title, "Serien");

    const french = await load(kira, "fr-FR,fr;q=0.9");
    assert.equal(french.streak.message, "Ta meilleure série jusqu’ici. Note un repas aujourd’hui pour la garder.");
    assert.deepEqual(french.streak.next, { label: "Prochain badge\u202f: 14 jours d’affilée", progress: 0.5, remaining: "Encore 7 jours" });
    assert.equal(badge(french, "streak-14").progressText, "7 / 14 jours");
    assert.equal(family(french, "streaks").title, "Séries");

    const inItalian = await load(kira, "it-IT,it;q=0.9");
    assert.equal(inItalian.streak.message, "La tua serie migliore finora. Registra un pasto oggi per non interromperla.");
    assert.deepEqual(inItalian.streak.next, { label: "Prossimo badge: 14 giorni di fila", progress: 0.5, remaining: "Ancora 7 giorni" });
    assert.equal(badge(inItalian, "streak-14").progressText, "7 / 14 giorni");
    assert.equal(family(inItalian, "streaks").title, "Serie");

    const portuguese = await load(kira, "pt-BR,pt;q=0.9");
    assert.equal(portuguese.streak.message, "Sua melhor sequência até agora. Registre uma refeição hoje para não perdê-la.");
    assert.deepEqual(portuguese.streak.next, { label: "Próxima medalha: 14 dias seguidos", progress: 0.5, remaining: "Faltam 7 dias" });
    assert.equal(badge(portuguese, "streak-14").progressText, "7 / 14 dias");
    assert.equal(family(portuguese, "streaks").title, "Sequências");

    // Same badges whatever the language; only the words change.
    const english = await load(kira, "en");
    assert.deepEqual(
      spanish.families.flatMap((entry: any) => entry.badges.map((item: Badge) => [item.id, item.earnedOn, item.progress])),
      english.families.flatMap((entry: any) => entry.badges.map((item: Badge) => [item.id, item.earnedOn, item.progress])),
    );
  });

  it("prefers the language chosen on the account to the app's", async () => {
    const chosen = await signIn("polyglot@example.com");
    await api("PATCH", "/me", { body: { locale: "ru" }, token: chosen.accessToken });
    const view = await load(chosen, "es");
    assert.equal(view.streak.message, "Запишите приём пищи сегодня, чтобы начать серию.");
    assert.equal(badge(view, "streak-3").progressText, "Не начато");
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
    await givePlan(newcomer.userId, "pro10");
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
    assert.equal(badge(view, "burned-1000").title, "1,000 kcal burned in a day");
    assert.equal(badge(view, "burned-1000").description, "Burn 1,000 kcal by moving in one day.");
    assert.equal(badge(view, "burned-days-7").description, "6 more days burning 500 kcal or more.");
    assert.equal(badge(view, "steps-20000").description, "Walk 20,000 steps in one day.");
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
