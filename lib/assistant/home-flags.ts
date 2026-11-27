import type { GoalsView } from "../goal-values.ts";
import type { MainMeal } from "./home-day.ts";
import { MEAL_FOR, num, tenth, upperFirst, type Plain } from "./home-plain.ts";

// The things the coach must say before anything else, worked out from the day's figures alone so
// they can be tested without a database. Each one carries what to do about it, for what's left of
// the day.

export type FlagMood = "happy" | "idle" | "thinking";

export type DayFlag = {
  key: string;
  mood: FlagMood;
  plain: Plain;
  // Between 80 and 99: every flag outranks every other kind of fact, and these order the flags.
  score: number;
  text: string;
};

// A food they often log, at the amount they had last.
export type ServingFood = {
  fat: number | null;
  kcal: number | null;
  name: string;
  proteins: number | null;
  salt: number | null;
  saturatedFat: number | null;
  sugars: number | null;
};

export type DayFigures = {
  eaten: { energyKcal: number; fat: number; proteins: number; salt: number; saturatedFat: number; sugars: number };
  goals: Pick<GoalsView, "caloriesPerDay" | "fatGPerDay" | "proteinGPerDay">;
  // What they've already had today, lower-cased, so it isn't suggested again.
  had: ReadonlySet<string>;
  hour: number;
  next: MainMeal | null;
  // Their usual foods, most often first.
  usual: readonly ServingFood[];
  weight: WeightTrend | null;
  // Average calories a day over the last week, when enough days were logged.
  weekKcal: number | null;
};

export type WeightTrend = { earlierDate: string; earlierKg: number; goalKg: number; latestKg: number };

type Limit = "energyKcal" | "fat" | "salt" | "saturatedFat" | "sugars";

// Reference intakes where they set no goal of their own (EU/UK front-of-pack values, adult).
export const REFERENCE = { fat: 70, salt: 6, saturatedFat: 20, sugars: 90 } as const;
// How far over a limit counts, so a rounding crumb isn't announced.
const OVER_BY: Record<Limit, number> = { energyKcal: 100, fat: 3, salt: 0.5, saturatedFat: 2, sugars: 5 };
// Order among limits at the same overshoot: what they set themselves first.
const WEIGHT: Record<Limit, number> = { energyKcal: 0.4, fat: 0.3, saturatedFat: 0.2, sugars: 0.1, salt: 0 };

// The day's limit for each, from their goals where there is one.
export function dailyLimits(goals: DayFigures["goals"]): Record<Limit, number | null> {
  const kcal = goals.caloriesPerDay;
  return {
    energyKcal: kcal,
    fat: goals.fatGPerDay ?? (kcal ? Math.round((kcal * 0.35) / 9) : REFERENCE.fat),
    salt: REFERENCE.salt,
    saturatedFat: kcal ? Math.round((kcal * 0.1) / 9) : REFERENCE.saturatedFat,
    sugars: REFERENCE.sugars,
  };
}

const n = (value: number): string => Math.round(value).toLocaleString("en");
const one = (value: number): string => (Math.round(value * 10) / 10).toLocaleString("en");

const NAMES: Record<Limit, { name: string; unit: string; verb: string }> = {
  energyKcal: { name: "Calories", unit: "kcal", verb: "are" },
  fat: { name: "Fat", unit: "g", verb: "is" },
  salt: { name: "Salt", unit: "g", verb: "is" },
  saturatedFat: { name: "Saturated fat", unit: "g", verb: "is" },
  sugars: { name: "Sugar", unit: "g", verb: "is" },
};

// What to steer clear of and what to have instead, once a limit is passed.
const AVOID: Record<Limit, { avoid: string; instead: string }> = {
  energyKcal: { avoid: "snacks and second helpings", instead: "vegetables, a clear soup or a lean protein if hungry" },
  fat: { avoid: "fried food, cheese, cream, butter, nuts and fatty meat", instead: "lean chicken, fish or beans with vegetables" },
  salt: { avoid: "salty snacks, cured meat, cheese, soy sauce and ready meals", instead: "fresh food cooked without added salt, and water" },
  saturatedFat: { avoid: "butter, cheese, cream, fatty meat and pastries", instead: "fish, chicken, beans or vegetables" },
  sugars: { avoid: "sweets, desserts, juice and sweet drinks", instead: "something savoury like eggs, vegetables or plain yogurt" },
};

// The same, short enough for the home card when the model isn't there to word it.
const TIP: Record<Limit, string> = {
  energyKcal: "if you're hungry, keep it to vegetables or a clear soup",
  fat: "go lean: chicken or fish with vegetables, nothing fried or creamy",
  salt: "drink water and skip salty snacks and sauces",
  saturatedFat: "skip butter, cheese and fatty meat",
  sugars: "skip sweets and sweet drinks",
};
const TIP_RU: Record<Limit, string> = {
  energyKcal: "если хочется есть, ограничься овощами или лёгким супом",
  fat: "выбирай нежирное: курица или рыба с овощами, ничего жареного и сливочного",
  salt: "пей воду и обойдись без солёных закусок и соусов",
  saturatedFat: "обойдись без сливочного масла, сыра и жирного мяса",
  sugars: "обойдись без сладкого и сладких напитков",
};
const TIP_ES: Record<Limit, string> = {
  energyKcal: "si tienes hambre, que sean verduras o un caldo",
  fat: "ve a lo ligero: pollo o pescado con verduras, nada frito ni con nata",
  salt: "bebe agua y evita los snacks salados y las salsas",
  saturatedFat: "evita la mantequilla, el queso y la carne grasa",
  sugars: "evita los dulces y las bebidas azucaradas",
};
// Name (and, in Russian, "of" form for "осталось ..."), and unit, for the plain lines.
const NAMES_RU: Record<Limit, { name: string; of: string; unit: string }> = {
  energyKcal: { name: "калории", of: "калорий", unit: "ккал" },
  fat: { name: "жиры", of: "жиров", unit: "г" },
  salt: { name: "соль", of: "соли", unit: "г" },
  saturatedFat: { name: "насыщенные жиры", of: "насыщенных жиров", unit: "г" },
  sugars: { name: "сахар", of: "сахара", unit: "г" },
};
const TIP_DE: Record<Limit, string> = {
  energyKcal: "wenn du Hunger hast, dann Gemüse oder eine klare Suppe",
  fat: "bleib mager: Hähnchen oder Fisch mit Gemüse, nichts Frittiertes oder Sahniges",
  salt: "trink Wasser und lass salzige Snacks und Soßen weg",
  saturatedFat: "lass Butter, Käse und fettes Fleisch weg",
  sugars: "lass Süßes und süße Getränke weg",
};
const NAMES_DE: Record<Limit, string> = {
  energyKcal: "Kalorien",
  fat: "Fett",
  salt: "Salz",
  saturatedFat: "gesättigte Fettsäuren",
  sugars: "Zucker",
};
const TIP_FR: Record<Limit, string> = {
  energyKcal: "si tu as faim, mise sur des légumes ou un bouillon",
  fat: "reste léger\u202f: poulet ou poisson avec des légumes, rien de frit ni de crémeux",
  salt: "bois de l’eau et évite les snacks salés et les sauces",
  saturatedFat: "évite le beurre, le fromage et la viande grasse",
  sugars: "évite les sucreries et les boissons sucrées",
};
// The name, and how it reads after "il ne te reste que 10 g …".
const NAMES_FR: Record<Limit, { name: string; of: string }> = {
  energyKcal: { name: "calories", of: "de calories" },
  fat: { name: "lipides", of: "de lipides" },
  salt: { name: "sel", of: "de sel" },
  saturatedFat: { name: "acides gras saturés", of: "d’acides gras saturés" },
  sugars: { name: "sucres", of: "de sucres" },
};
const NAMES_ES: Record<Limit, string> = {
  energyKcal: "calorías",
  fat: "grasa",
  salt: "sal",
  saturatedFat: "grasa saturada",
  sugars: "azúcar",
};

const value = (food: ServingFood, key: Limit): number | null => (key === "energyKcal" ? food.kcal : food[key]);

// One of their usual foods that keeps every passed limit where it is and fits what's left.
function fitting(figures: DayFigures, over: readonly Limit[], kcalLeft: number | null, minProtein: number): ServingFood | null {
  const caps: Record<Limit, number> = { energyKcal: Infinity, fat: 5, salt: 0.3, saturatedFat: 1.5, sugars: 4 };
  return (
    figures.usual
      .filter((food) => !figures.had.has(food.name.trim().toLowerCase()))
      .filter((food) => (food.proteins ?? 0) >= minProtein && food.kcal !== null && food.kcal > 0)
      .filter((food) => kcalLeft === null || food.kcal! <= Math.max(kcalLeft, 0) + (over.length > 0 ? 0 : 50))
      // Unknown counts as too much: better nothing than a wrong idea.
      .filter((food) => over.every((key) => key === "energyKcal" || (value(food, key) !== null && value(food, key)! <= caps[key])))
      .sort((a, b) => (b.proteins ?? 0) / b.kcal! - (a.proteins ?? 0) / a.kcal!)[0] ?? null
  );
}

const forNext = (next: MainMeal | null): string => (next ? `For ${next}` : "For the rest of today");
const forNextRu = (next: MainMeal | null): string => (next ? `На ${MEAL_FOR.ru[next]}` : "До конца дня");
const forNextDe = (next: MainMeal | null): string => (next ? upperFirst(MEAL_FOR.de[next]) : "Für den Rest des Tages");
const forNextFr = (next: MainMeal | null): string => (next ? `Pour ${MEAL_FOR.fr[next]}` : "Pour le reste de la journée");
const forNextEs = (next: MainMeal | null): string => (next ? `Para ${MEAL_FOR.es[next]}` : "Para el resto del día");

// Everything worth flagging today, best first. Ranking: a limit passed (by how far), then
// nothing logged by evening, then protein far short late in the day, then weight moving away from
// the goal, then a limit nearly reached with a meal still ahead.
export function dayFlags(figures: DayFigures): DayFlag[] {
  const { eaten, hour, next } = figures;
  const flags: DayFlag[] = [];
  const limits = dailyLimits(figures.goals);
  const kcalGoal = figures.goals.caloriesPerDay;
  const kcalLeft = kcalGoal ? kcalGoal - eaten.energyKcal : null;
  const keys = Object.keys(limits) as Limit[];
  const over = keys.filter((key) => limits[key] !== null && eaten[key] - limits[key]! >= OVER_BY[key]);

  for (const key of over) {
    const limit = limits[key]!;
    const ratio = eaten[key] / limit;
    const { name, unit, verb } = NAMES[key];
    const { avoid, instead } = AVOID[key];
    const pick = fitting(figures, over, kcalLeft, key === "energyKcal" ? 15 : 10);
    const amount = key === "salt" ? one : n;
    const local = (locale: "de" | "es" | "fr" | "ru", value: number) => (key === "salt" ? tenth : num)(locale, value);
    const figure = `${amount(eaten[key])} ${unit} of a ${amount(limit)} ${unit} ${key === "energyKcal" ? "goal" : "limit"}`;
    const own = key === "energyKcal" || (key === "fat" && figures.goals.fatGPerDay !== null);
    const idea = pick ? ` Their usual ${pick.name} fits (${n(pick.kcal!)} kcal, ${n(pick.proteins ?? 0)} grams of protein).` : "";
    flags.push({
      key: `over:${key}`,
      mood: "thinking",
      plain: {
        en: `${name.toLowerCase()} ${verb} at ${figure} today. ${forNext(next)}, ${pick ? `your usual ${pick.name} fits` : TIP[key]}.`,
        es: `${NAMES_ES[key]} hoy: ${local("es", eaten[key])} ${unit} de ${key === "energyKcal" ? "una meta" : "un límite"} de ${local("es", limit)} ${unit}. ${forNextEs(next)}, ${pick ? `tu ${pick.name} de siempre encaja` : TIP_ES[key]}.`,
        de: `${NAMES_DE[key]} heute: ${local("de", eaten[key])} ${unit} bei ${key === "energyKcal" ? "einem Ziel" : "einer Grenze"} von ${local("de", limit)} ${unit}. ${forNextDe(next)}: ${pick ? `dein übliches ${pick.name} passt` : TIP_DE[key]}.`,
        fr: `${NAMES_FR[key].name} aujourd’hui : ${local("fr", eaten[key])} ${unit} pour ${key === "energyKcal" ? "un objectif" : "une limite"} de ${local("fr", limit)} ${unit}. ${forNextFr(next)}, ${pick ? `ton plat habituel « ${pick.name} » convient` : TIP_FR[key]}.`,
        ru: `${NAMES_RU[key].name} сегодня: ${local("ru", eaten[key])} ${NAMES_RU[key].unit} при ${key === "energyKcal" ? "цели" : "норме"} ${local("ru", limit)} ${NAMES_RU[key].unit}. ${forNextRu(next)} ${pick ? `подойдёт привычное: ${pick.name}` : `— ${TIP_RU[key]}`}.`,
      },
      // 95 to 99 by how far over, so the worst comes first.
      score: 95 + Math.min(4, Math.floor((ratio - 1) * 10) + WEIGHT[key]),
      text: `${name} today: ${figure}${own ? " they set" : " (a standard daily reference)"}, so it's over. Say so plainly and kindly, then what to do: ${forNext(next).toLowerCase()}, skip ${avoid}; have ${instead} instead.${idea} No guilt; one day is fixable.`,
    });
  }

  if (eaten.energyKcal === 0 && hour >= 18) {
    flags.push({
      key: "empty_evening",
      mood: "thinking",
      plain: {
        en: "it's evening and nothing's logged today. Tell me what you ate, or send a photo, and I'll add it.",
        es: "ya es de noche y hoy no hay nada registrado. Dime qué comiste o mándame una foto y lo añado.",
        de: "es ist Abend und heute ist noch nichts eingetragen. Sag mir, was du gegessen hast, oder schick ein Foto, und ich trag es ein.",
        fr: "c’est le soir et rien n’est noté aujourd’hui. Dis-moi ce que tu as mangé ou envoie une photo, et je l’ajoute.",
        ru: "уже вечер, а сегодня ничего не записано. Расскажи, что было на тарелке, или пришли фото — я добавлю.",
      },
      score: 94,
      text: "It's evening and nothing at all is logged today, so the day can't be judged. Ask what they ate; they can say it or send a photo and you log it. Don't praise or scold.",
    });
  } else if (kcalGoal && eaten.energyKcal > 0 && hour >= 20 && eaten.energyKcal < kcalGoal * 0.5) {
    flags.push({
      key: "sparse",
      mood: "thinking",
      plain: {
        en: `only ${n(eaten.energyKcal)} kcal is logged today. Is anything missing?`,
        es: `hoy solo hay ${num("es", eaten.energyKcal)} kcal registradas. ¿Falta algo?`,
        de: `heute sind erst ${num("de", eaten.energyKcal)} kcal eingetragen. Fehlt etwas?`,
        fr: `aujourd’hui, seulement ${num("fr", eaten.energyKcal)} kcal sont notées. Il manque quelque chose ?`,
        ru: `сегодня записано всего ${num("ru", eaten.energyKcal)} ккал. Может, что-то забыто?`,
      },
      score: 92,
      text: `Only ${n(eaten.energyKcal)} kcal is logged today and it's evening. Probably something is missing from the diary. Ask, don't praise.`,
    });
  }

  const proteinGoal = figures.goals.proteinGPerDay;
  if (proteinGoal && eaten.energyKcal > 0 && hour >= 17 && eaten.proteins < proteinGoal * 0.6 && proteinGoal - eaten.proteins >= 25) {
    const left = Math.round(proteinGoal - eaten.proteins);
    const pick = next ? fitting(figures, over, kcalLeft, 15) : null;
    const room = kcalLeft !== null && kcalLeft > 0 ? ` with ${n(kcalLeft)} kcal left` : "";
    flags.push({
      key: "protein_low",
      mood: "thinking",
      plain: {
        en: `${left} grams of protein still to go today. ${pick ? `Your ${pick.name} has ${n(pick.proteins ?? 0)}.` : "Pick a lean protein like chicken, fish, eggs or Greek yogurt."}`,
        es: `hoy aún faltan ${num("es", left)} gramos de proteína. ${pick ? `Tu ${pick.name} tiene ${num("es", pick.proteins ?? 0)}.` : "Elige una proteína magra como pollo, pescado, huevos o yogur griego."}`,
        de: `heute fehlen noch ${num("de", left)} Gramm Eiweiß. ${pick ? `${upperFirst(pick.name)} hat ${num("de", pick.proteins ?? 0)}.` : "Nimm mageres Eiweiß wie Hähnchen, Fisch, Eier oder griechischen Joghurt."}`,
        fr: `il te reste ${num("fr", left)} grammes de protéines à prendre aujourd’hui. ${pick ? `${upperFirst(pick.name)} en apporte ${num("fr", pick.proteins ?? 0)}.` : "Choisis une protéine maigre comme du poulet, du poisson, des œufs ou du yaourt grec."}`,
        ru: `сегодня ещё нужно ${num("ru", left)} г белка. ${pick ? `${upperFirst(pick.name)}: ${num("ru", pick.proteins ?? 0)} г.` : "Выбери нежирный белок: курицу, рыбу, яйца или греческий йогурт."}`,
      },
      score: 91,
      text: `Only ${n(eaten.proteins)} of ${n(proteinGoal)} grams of protein eaten so far and it's evening, so ${left} grams are left${room}. Suggest a lean, protein-rich ${next ?? "snack"}: ${pick ? `their usual ${pick.name} (${n(pick.proteins ?? 0)} grams of protein, ${n(pick.kcal!)} kcal)` : "chicken, fish, eggs, cottage cheese, Greek yogurt or tofu"}.`,
    });
  }

  const weight = figures.weight;
  if (weight) {
    const away = Math.abs(weight.latestKg - weight.goalKg) - Math.abs(weight.earlierKg - weight.goalKg);
    if (away >= 0.5) {
      const week = figures.weekKcal !== null && kcalGoal ? ` They averaged ${n(figures.weekKcal)} kcal a day this past week, against a goal of ${n(kcalGoal)}.` : "";
      const losing = weight.goalKg < weight.latestKg;
      flags.push({
        key: "weight_away",
        mood: "thinking",
        plain: {
          en: `your weight is ${one(away)} kg further from your goal than on ${weight.earlierDate}. Want a hand with the next few days?`,
          es: `tu peso está ${tenth("es", away)} kg más lejos de tu meta que el ${weight.earlierDate}. ¿Te echo una mano con los próximos días?`,
          de: `dein Gewicht ist ${tenth("de", away)} kg weiter von deinem Ziel entfernt als am ${weight.earlierDate}. Soll ich dir bei den nächsten Tagen helfen?`,
          fr: `ton poids est ${tenth("fr", away)} kg plus loin de ton objectif que le ${weight.earlierDate}. Je te donne un coup de main pour les prochains jours ?`,
          ru: `твой вес на ${tenth("ru", away)} кг дальше от цели, чем ${weight.earlierDate}. Помочь с ближайшими днями?`,
        },
        score: 86,
        text: `Weight is ${one(weight.latestKg)} kg, ${one(away)} kg further from the ${one(weight.goalKg)} kg goal than on ${weight.earlierDate} (${one(weight.earlierKg)} kg).${week} Gently point to one concrete step: ${losing ? "staying within the calorie goal on most days and logging everything" : "eating up to the calorie goal every day, with protein at each meal"}. Offer to plan the next meal. Weight moves day to day; no alarm.`,
      });
    }
  }

  if (next && hour < 20) {
    for (const key of keys) {
      const limit = limits[key];
      if (limit === null || over.includes(key)) continue;
      // Only what they set themselves, or what the day's food has nearly used up.
      const share = eaten[key] / limit;
      if (share < 0.9) continue;
      const { name, unit } = NAMES[key];
      const amount = key === "salt" ? one : n;
      const local = (locale: "de" | "es" | "fr" | "ru", value: number) => (key === "salt" ? tenth : num)(locale, value);
      const left = limit - eaten[key];
      flags.push({
        key: `near:${key}`,
        mood: "idle",
        plain: {
          en: `only ${amount(left)} ${unit} of ${name.toLowerCase()} left for today. For ${next}, ${TIP[key]}.`,
          es: `solo te quedan ${local("es", left)} ${unit} de ${NAMES_ES[key]} para hoy. ${forNextEs(next)}, ${TIP_ES[key]}.`,
          de: `für heute bleiben nur noch ${local("de", left)} ${unit} ${NAMES_DE[key]}. ${forNextDe(next)}: ${TIP_DE[key]}.`,
          fr: `il ne te reste que ${local("fr", left)} ${unit} ${NAMES_FR[key].of} pour aujourd’hui. ${forNextFr(next)}, ${TIP_FR[key]}.`,
          ru: `${NAMES_RU[key].of} на сегодня осталось всего ${local("ru", left)} ${NAMES_RU[key].unit}. ${forNextRu(next)} — ${TIP_RU[key]}.`,
        },
        score: 80 + Math.min(4, Math.floor((share - 0.9) * 40)) + WEIGHT[key],
        text: `${name} today: ${amount(eaten[key])} of ${amount(limit)} ${unit}, so only ${amount(left)} ${unit} are left and ${next} is still ahead. Suggest a ${next} that keeps it low: skip ${AVOID[key].avoid}; have ${AVOID[key].instead}.`,
      });
    }
  }

  return flags.sort((a, b) => b.score - a.score);
}

// What to say first. Flags come first, always: one said again still beats any tip. Among the rest,
// and among flags, the same thing again or something said lately comes after what hasn't been.
export function rank<T extends { flag?: boolean; key: string; score: number }>(facts: readonly T[], shownKeys: readonly string[]): T[] {
  const worth = (fact: T) => {
    const ago = shownKeys.indexOf(fact.key);
    return fact.score - (ago < 0 ? 0 : ago === 0 ? 60 : ago <= 2 ? 30 : 12);
  };
  return [...facts].sort((a, b) => Number(b.flag === true) - Number(a.flag === true) || worth(b) - worth(a));
}
