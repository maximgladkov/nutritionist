import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dailyLimits, dayFlags, rank, type DayFigures, type ServingFood } from "./assistant/home-flags.ts";
import { dayCount } from "./assistant/home-plain.ts";

const NONE = { energyKcal: 0, fat: 0, proteins: 0, salt: 0, saturatedFat: 0, sugars: 0 };
const GOALS = { caloriesPerDay: 1800, fatGPerDay: 60, proteinGPerDay: 120 };
const COD: ServingFood = { fat: 1, kcal: 180, name: "Baked cod", proteins: 35, salt: 0.2, saturatedFat: 0.2, sugars: 0 };
const BURGER: ServingFood = { fat: 30, kcal: 650, name: "Burger", proteins: 30, salt: 2.4, saturatedFat: 12, sugars: 8 };
const MYSTERY: ServingFood = { fat: null, kcal: 200, name: "Mystery bowl", proteins: 40, salt: null, saturatedFat: null, sugars: null };

function day(change: Partial<DayFigures> & { eaten?: Partial<DayFigures["eaten"]> } = {}): DayFigures {
  return {
    goals: GOALS,
    had: new Set(),
    hour: 15,
    next: "dinner",
    usual: [],
    weekKcal: null,
    weight: null,
    ...change,
    eaten: { ...NONE, energyKcal: 1000, proteins: 80, ...change.eaten },
  };
}

const keys = (figures: DayFigures) => dayFlags(figures).map((flag) => flag.key);

describe("day flags", () => {
  it("uses their own fat goal, else a share of calories, and reference values for the rest", () => {
    assert.deepEqual(dailyLimits(GOALS), { energyKcal: 1800, fat: 60, salt: 6, saturatedFat: 20, sugars: 90 });
    assert.deepEqual(dailyLimits({ caloriesPerDay: 2000, fatGPerDay: null, proteinGPerDay: null }), { energyKcal: 2000, fat: 78, salt: 6, saturatedFat: 22, sugars: 90 });
    assert.deepEqual(dailyLimits({ caloriesPerDay: null, fatGPerDay: null, proteinGPerDay: null }), { energyKcal: null, fat: 70, salt: 6, saturatedFat: 20, sugars: 90 });
  });

  it("flags fat over the limit, with what to skip and what to have for the next meal", () => {
    const [flag] = dayFlags(day({ eaten: { fat: 75 } }));
    assert.equal(flag!.key, "over:fat");
    assert.match(flag!.plain.en, /^fat is at 75 g of a 60 g limit today\. For dinner, go lean: chicken or fish with vegetables, nothing fried or creamy\.$/);
    assert.match(flag!.text, /they set/);
    assert.ok(flag!.score >= 95 && flag!.score < 100);
  });

  it("says the same in the other languages when no model words it", () => {
    const [flag] = dayFlags(day({ eaten: { fat: 75 } }));
    assert.equal(flag!.plain.es, "grasa hoy: 75 g de un límite de 60 g. Para la cena, ve a lo ligero: pollo o pescado con verduras, nada frito ni con nata.");
    assert.equal(flag!.plain.de, "Fett heute: 75 g bei einer Grenze von 60 g. Zum Abendessen: bleib mager: Hähnchen oder Fisch mit Gemüse, nichts Frittiertes oder Sahniges.");
    assert.equal(flag!.plain.fr, "lipides aujourd’hui\u202f: 75 g pour une limite de 60 g. Pour le dîner, reste léger\u202f: poulet ou poisson avec des légumes, rien de frit ni de crémeux.");
    assert.equal(flag!.plain.it, "grassi oggi: 75 g su un limite di 60 g. Per cena, scegli qualcosa di leggero: pollo o pesce con verdure, niente di fritto o cremoso.");
    assert.equal(flag!.plain.nl, "je zit vandaag op 75 g vet, bij een limiet van 60 g. Voor het avondeten: neem iets lichts, zoals kip of vis met groente, niets gefrituurds of romigs.");
    assert.equal(flag!.plain.pl, "tłuszcz dziś: 75 g przy limicie 60 g. Na kolację: postaw na coś chudego, jak kurczak albo ryba z warzywami – nic smażonego ani śmietanowego.");
    assert.equal(flag!.plain.pt, "gorduras hoje: 75 g para um limite de 60 g. Para o jantar, escolha algo leve: frango ou peixe com legumes, nada frito ou cremoso.");
    assert.equal(flag!.plain.uk, "жири сьогодні: 75 г, а ліміт — 60 г. На вечерю — обирай нежирне: курка або риба з овочами, нічого смаженого й вершкового.");
    assert.equal(flag!.plain.tr, "bugün 75 g yağ aldın, limitin 60 g. Akşam yemeği için hafif bir şey seç: sebzeli tavuk ya da balık; kızartma ya da kremalı bir şey olmasın.");
    assert.equal(flag!.plain.ru, "жиры сегодня: 75 г при норме 60 г. На ужин — выбирай нежирное: курица или рыба с овощами, ничего жареного и сливочного.");
  });

  it("names a usual food only when it's lean, known and not already had", () => {
    assert.match(dayFlags(day({ eaten: { fat: 75 }, usual: [BURGER, MYSTERY, COD] }))[0]!.plain.en, /your usual Baked cod fits\.$/);
    assert.match(dayFlags(day({ eaten: { fat: 75 }, usual: [BURGER, MYSTERY] }))[0]!.plain.en, /go lean: chicken or fish/);
    assert.match(dayFlags(day({ eaten: { fat: 75 }, had: new Set(["baked cod"]), usual: [COD] }))[0]!.plain.en, /go lean/);
  });

  it("puts the limit passed furthest first, and ignores a crumb over", () => {
    assert.deepEqual(keys(day({ eaten: { fat: 66, salt: 9 } })), ["over:salt", "over:fat"]);
    assert.deepEqual(keys(day({ eaten: { fat: 61 } })).filter((key) => key.startsWith("over:")), []);
  });

  it("flags every limit: calories, saturated fat, sugar and salt", () => {
    const flags = keys(day({ eaten: { energyKcal: 2100, salt: 7, saturatedFat: 24, sugars: 110 } }));
    for (const key of ["over:energyKcal", "over:saturatedFat", "over:sugars", "over:salt"]) assert.ok(flags.includes(key), key);
    assert.match(dayFlags(day({ eaten: { energyKcal: 2100 } }))[0]!.plain.en, /^calories are at 2,100 kcal of a 1,800 kcal goal today/);
  });

  it("flags an empty diary by evening, but not in the afternoon", () => {
    assert.deepEqual(keys(day({ eaten: { energyKcal: 0, proteins: 0 }, hour: 19 })), ["empty_evening"]);
    assert.deepEqual(keys(day({ eaten: { energyKcal: 0, proteins: 0 }, hour: 14 })), []);
  });

  it("flags protein far short late in the day, with a lean idea that fits what's left", () => {
    const [flag] = dayFlags(day({ eaten: { energyKcal: 1100, proteins: 50 }, hour: 18, usual: [BURGER, COD] }));
    assert.equal(flag!.key, "protein_low");
    assert.match(flag!.plain.en, /^70 grams of protein still to go today\. Your Baked cod has 35\.$/);
    assert.match(flag!.text, /with 700 kcal left/);
    assert.deepEqual(keys(day({ eaten: { energyKcal: 1100, proteins: 50 }, hour: 13 })), []);
  });

  it("flags weight moving away from the goal, not towards it", () => {
    const away = dayFlags(day({ weekKcal: 2300, weight: { earlierDate: "2026-11-01", earlierKg: 80, goalKg: 75, latestKg: 81 } }))[0]!;
    assert.equal(away.key, "weight_away");
    assert.match(away.text, /averaged 2,300 kcal a day this past week, against a goal of 1,800/);
    assert.deepEqual(keys(day({ weight: { earlierDate: "2026-11-01", earlierKg: 80, goalKg: 75, latestKg: 79 } })), []);
  });

  it("warns of a limit nearly reached only while a meal is ahead", () => {
    assert.deepEqual(keys(day({ eaten: { fat: 56 } })), ["near:fat"]);
    assert.deepEqual(keys(day({ eaten: { fat: 56 }, next: null })), []);
  });

  it("ranks a limit passed over protein, over weight, over a near limit", () => {
    const flags = dayFlags(
      day({
        eaten: { energyKcal: 1700, fat: 64, proteins: 40, salt: 7 },
        hour: 18,
        weight: { earlierDate: "2026-11-01", earlierKg: 80, goalKg: 75, latestKg: 81 },
      }),
    );
    assert.deepEqual(flags.map((flag) => flag.key), ["over:salt", "over:fat", "protein_low", "weight_away", "near:energyKcal"]);
  });
});

describe("ranking what to say", () => {
  const fact = (key: string, score: number, flag?: boolean) => ({ flag, key, score });

  it("says a flag before any tip, however good the tip", () => {
    assert.deepEqual(rank([fact("streak", 88), fact("comments:1", 90), fact("over:fat", 95, true)], []).map((row) => row.key), ["over:fat", "comments:1", "streak"]);
  });

  it("keeps a flag first even right after it was said, but rotates between flags", () => {
    assert.equal(rank([fact("streak", 88), fact("over:fat", 95, true)], ["over:fat"])[0]!.key, "over:fat");
    assert.equal(rank([fact("over:salt", 96, true), fact("over:fat", 95, true)], ["over:salt"])[0]!.key, "over:fat");
  });

  it("moves on from a tip just said", () => {
    assert.equal(rank([fact("streak", 88), fact("week", 58)], ["streak"])[0]!.key, "week");
  });
});

describe("day counts", () => {
  it("puts Polish days in the right form, with 21 like 5 (not like 1, as in Russian)", () => {
    assert.deepEqual([1, 2, 5, 12, 21, 22].map((count) => dayCount("pl", count)), ["1 dzień", "2 dni", "5 dni", "12 dni", "21 dni", "22 dni"]);
  });

  it("keeps the Turkish noun singular after any number", () => {
    assert.deepEqual([1, 2, 5, 21].map((count) => dayCount("tr", count)), ["1 gün", "2 gün", "5 gün", "21 gün"]);
  });

  it("puts Ukrainian days in the right form, with 21 like 1 (as in Russian)", () => {
    assert.deepEqual([1, 2, 5, 12, 21, 22].map((count) => dayCount("uk", count)), ["1 день", "2 дні", "5 днів", "12 днів", "21 день", "22 дні"]);
  });
});
