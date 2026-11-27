import { achievementsViews } from "../achievements/view.ts";
import { parseTranscript } from "../agent-turn-model.ts";
import { conversationTextWithoutMediaStubs } from "../conversation-query.ts";
import { pluralForm } from "../i18n/locales.ts";
import { computeItemNutrition, sumNutrients } from "../nutrition.ts";
import { loadTodayNutritionProgress } from "../nutrition-progress.ts";
import type { ProductNutriments } from "../open-food-facts.ts";
import { prisma } from "../prisma.ts";
import { listRecipes } from "../recipes.ts";
import { loadNutritionDays, readSummaryContext } from "../summary.ts";
import { DAY_START_HOUR, formatDateInTimeZone, getZonedParts, localDayRange, shiftYmd } from "../timezone.ts";
import { listMeals } from "../meals.ts";
import { frequentFoods, type FrequentFood } from "./frequent-foods.ts";
import { coverage } from "./home-card.ts";
import { dayInWords, mealNamed, nextMeal, type MainMeal } from "./home-day.ts";
import { dayFlags, type ServingFood } from "./home-flags.ts";
import { coverageWords, dayCount, MEAL_FOR, num, ruDaysOf, ruWord, tenth, upperFirst, type Plain } from "./home-plain.ts";

export type HomeMood = "happy" | "idle" | "thinking";

// Something true right now that's worth saying. Every figure is worked out here; the model only
// chooses among these and words one.
export type HomeFact = {
  // What it's about, so the same thing isn't said twice in a row.
  key: string;
  mood: HomeMood;
  // Something they need to hear today, such as a limit passed: said before anything else.
  flag?: boolean;
  // Higher is better to say now.
  score: number;
  // What to say without the model, in the middle of a sentence after a name; null when only it can.
  // What to show when no model words it; null for facts only the model can use.
  plain: Plain | null;
  text: string;
};

export type HomeFacts = {
  // What they've had today and what comes next.
  day: string;
  facts: HomeFact[];
  // What they last wrote, to match its language; newest last.
  lastWords: string[];
  localTime: string;
  name: string | null;
  next: MainMeal | null;
  // Changes when what they logged or were told changes.
  stamp: string;
  today: string;
};

const DAY_MS = 86_400_000;
const USUAL_WINDOW_MIN = 90;

const n = (value: number): string => Math.round(value).toLocaleString("en");
const one = (value: number): string => (Math.round(value * 10) / 10).toLocaleString("en");
const days = (count: number): string => `${count} ${count === 1 ? "day" : "days"}`;

export function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

async function recentWords(userId: string, now: Date) {
  const turns = await prisma.agentTurn.findMany({
    orderBy: { startedAt: "desc" },
    select: { messages: true, startedAt: true },
    take: 3,
    where: { channel: "app", startedAt: { gt: new Date(now.getTime() - 30 * DAY_MS) }, userId },
  });
  return turns.reverse().flatMap((turn) => {
    const said = parseTranscript(turn.messages).items.flatMap((item) => (item.type === "user" ? [item.text] : [])).join(" ");
    const text = conversationTextWithoutMediaStubs(said).replace(/\s+/gu, " ").slice(0, 200);
    return text ? [{ at: turn.startedAt, text }] : [];
  });
}

// Something they keep and could make, that fits what's left.
async function dishes(userId: string) {
  const [recipes, meals] = await Promise.all([
    listRecipes(userId),
    prisma.savedMeal.findMany({ include: { items: true }, take: 20, where: { userId } }),
  ]);
  return [
    ...recipes.map((recipe) => ({ foods: recipe.items.map((item) => item.name), kcal: recipe.perServing.energyKcal, name: recipe.name, proteins: recipe.perServing.proteins, what: "saved recipe" })),
    ...meals.map((meal) => {
      const totals = sumNutrients(
        meal.items.map((item) => computeItemNutrition({ amount: item.amount, nutriments: item.nutrimentsPer100g as ProductNutriments, unit: item.unit }).metrics),
      );
      return { foods: meal.items.map((item) => item.name), kcal: totals.energyKcal, name: meal.name, proteins: totals.proteins, what: "saved meal" };
    }),
  ];
}

// The food they most often have around this time, and haven't had around it today.
async function usualNow(userId: string, now: Date, timezone: string, today: string): Promise<{ count: number; name: string } | null> {
  const rows = await prisma.mealItem.findMany({
    select: { meal: { select: { eatenAt: true } }, name: true },
    take: 600,
    where: { meal: { eatenAt: { gte: new Date(now.getTime() - 21 * DAY_MS), lte: now }, userId } },
  });
  const minuteOf = (at: Date) => {
    const parts = getZonedParts(at, timezone);
    return parts.hour * 60 + parts.minute;
  };
  const here = minuteOf(now);
  const seen = new Map<string, { dates: Set<string>; name: string }>();
  for (const row of rows) {
    const apart = Math.abs(minuteOf(row.meal.eatenAt) - here);
    if (Math.min(apart, 1440 - apart) > USUAL_WINDOW_MIN) continue;
    const date = formatDateInTimeZone(row.meal.eatenAt, timezone);
    // Already ate around now.
    if (date === today) return null;
    const key = row.name.trim().toLowerCase();
    const known = seen.get(key) ?? { dates: new Set<string>(), name: row.name };
    known.dates.add(date);
    seen.set(key, known);
  }
  const best = [...seen.values()].sort((a, b) => b.dates.size - a.dates.size)[0];
  return best && best.dates.size >= 4 ? { count: best.dates.size, name: best.name } : null;
}

function sinceDayStart({ hour, minute }: { hour: number; minute: number }): number {
  return ((hour - DAY_START_HOUR + 24) % 24) * 60 + minute;
}

// A usual food at the amount they had last; nothing when its amount can't be worked out.
function servingOf(food: FrequentFood): ServingFood[] {
  try {
    const { metrics } = computeItemNutrition({ amount: food.amount, nutriments: (food.nutrimentsPer100g ?? {}) as ProductNutriments, unit: food.unit });
    return [{ fat: metrics.fat, kcal: food.kcal ?? metrics.energyKcal, name: food.name, proteins: food.proteins ?? metrics.proteins, salt: metrics.salt, saturatedFat: metrics.saturatedFat, sugars: metrics.sugars }];
  } catch {
    return [];
  }
}

export async function loadHomeFacts(userId: string, now: Date): Promise<HomeFacts> {
  const { goals, timezone, today } = await readSummaryContext(userId, now);
  const clock = getZonedParts(now, timezone);
  const { hour } = clock;
  const [user, profile, progress, comments, history, foods, kept, usual, badgeViews, weights, activity, words, latestItem, logged] = await Promise.all([
    prisma.user.findUnique({ select: { name: true }, where: { id: userId } }),
    prisma.userProfile.findUnique({ select: { goalWeightKg: true }, where: { userId } }),
    loadTodayNutritionProgress(userId, now),
    prisma.groupMessage.findMany({
      orderBy: { createdAt: "desc" },
      select: { body: true, createdAt: true, fromUser: { select: { name: true } } },
      where: { draftFor: null, fromUserId: { not: userId }, group: { members: { some: { userId } } }, replyToId: null, targetDate: today, toUserId: userId },
    }),
    loadNutritionDays({ from: shiftYmd(today, -14), now, to: shiftYmd(today, -1), userId }),
    frequentFoods({ limit: 12, now, userId }),
    dishes(userId),
    usualNow(userId, now, timezone, today),
    achievementsViews(userId, ["de", "en", "es", "fr", "it", "nl", "pl", "pt", "ru"]),
    prisma.weightEntry.findMany({ orderBy: { date: "desc" }, take: 60, where: { userId } }),
    prisma.dailyActivity.findMany({ orderBy: { date: "desc" }, where: { date: { gte: shiftYmd(today, -8), lt: today }, userId } }),
    recentWords(userId, now),
    prisma.mealItem.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true }, where: { meal: { userId } } }),
    listMeals({ userId, ...localDayRange(now, timezone) }),
  ]);
  const todays = logged.meals
    .filter((meal) => meal.items.length > 0)
    .map((meal) => ({
      at: getZonedParts(new Date(meal.eatenAt), timezone),
      foods: meal.items.map((item) => item.name),
      label: meal.label,
    }))
    // The small hours are the end of the day.
    .sort((a, b) => sinceDayStart(a.at) - sinceDayStart(b.at));
  const next = nextMeal(hour, new Set<string>(todays.map((meal) => meal.label)));
  const had = new Set(todays.flatMap((meal) => meal.foods.map((food) => food.trim().toLowerCase())));
  // Not what they've already had, nor food for a day that's over.
  const isNew = (food: string) => !had.has(food.trim().toLowerCase());

  const facts: HomeFact[] = [];
  const add = (key: string, score: number, mood: HomeMood, text: string, plain: Plain | null) => facts.push({ key, mood, plain, score, text });

  const eaten = progress.current.energyKcal ?? 0;
  const protein = progress.current.proteins ?? 0;
  const kcalGoal = goals.caloriesPerDay;
  const proteinGoal = goals.proteinGPerDay;
  const kcalLeft = kcalGoal ? Math.round(kcalGoal - eaten) : null;
  const proteinLeft = proteinGoal ? Math.round(proteinGoal - protein) : null;

  const week = history.days.filter((day) => day.date >= shiftYmd(today, -7) && day.itemCount > 0);
  const before = history.days.filter((day) => day.date < shiftYmd(today, -7) && day.itemCount > 0);
  const mean = (rows: typeof week, key: "energyKcal" | "proteins") => rows.reduce((sum, day) => sum + (day.totals[key] ?? 0), 0) / Math.max(1, rows.length);
  const latest = weights[0];
  const goalWeight = profile?.goalWeightKg ?? null;
  const recentWeight = latest && goalWeight !== null && latest.date >= shiftYmd(today, -7) ? latest : null;
  const earlierWeight = recentWeight ? weights.find((entry) => entry.date <= shiftYmd(recentWeight.date, -14)) : undefined;

  // What must be said first: a limit passed, a day with nothing logged, protein far short, weight
  // going the wrong way.
  const flags = dayFlags({
    eaten: {
      energyKcal: eaten,
      fat: progress.current.fat ?? 0,
      proteins: protein,
      salt: progress.current.salt ?? 0,
      saturatedFat: progress.current.saturatedFat ?? 0,
      sugars: progress.current.sugars ?? 0,
    },
    goals,
    had,
    hour,
    next,
    usual: foods.flatMap(servingOf),
    weight: recentWeight && earlierWeight ? { earlierDate: earlierWeight.date, earlierKg: earlierWeight.weightKg, goalKg: goalWeight!, latestKg: recentWeight.weightKg } : null,
    weekKcal: week.length >= 3 ? mean(week, "energyKcal") : null,
  });
  for (const flag of flags) facts.push({ ...flag, flag: true });
  const flagged = new Set(flags.map((flag) => flag.key));

  // Late in the day with little logged is far more often a gap in the diary than a success.
  if (!flagged.has("sparse") && eaten > 0) {
    if (proteinLeft !== null && proteinLeft >= 15 && hour >= 10 && !flagged.has("protein_low")) {
      const best = (next ? foods : []).filter((food) => (food.proteins ?? 0) > 0 && isNew(food.name)).sort((a, b) => (b.proteins ?? 0) - (a.proteins ?? 0))[0];
      const share = best ? coverage(best.proteins ?? 0, proteinLeft) : null;
      const covers = (locale: "de" | "es" | "fr" | "it" | "nl" | "pl" | "pt" | "ru") => (best && share ? ` ${upperFirst(best.name)} ${coverageWords(locale, best.proteins ?? 0, proteinLeft)}.` : "");
      const idea = best && share ? ` ${best.name}, which they often log, ${share}.` : "";
      add(
        "protein_left",
        hour >= 17 ? 84 : 74,
        "happy",
        `${n(protein)} of ${n(proteinGoal!)} grams of protein eaten so far today, so ${n(proteinLeft)} grams are left to eat.${idea}`,
        {
          en: `you still need ${n(proteinLeft)} grams of protein.${best && share ? ` ${best.name} ${share}.` : ""}`,
          es: `aún te faltan ${num("es", proteinLeft)} gramos de proteína.${covers("es")}`,
          de: `du brauchst noch ${num("de", proteinLeft)} Gramm Eiweiß.${covers("de")}`,
          fr: `il te faut encore ${num("fr", proteinLeft)} grammes de protéines.${covers("fr")}`,
          it: `ti servono ancora ${num("it", proteinLeft)} grammi di proteine.${covers("it")}`,
          nl: `je hebt nog ${num("nl", proteinLeft)} gram eiwit nodig.${covers("nl")}`,
          pl: `potrzebujesz jeszcze ${num("pl", proteinLeft)} g białka.${covers("pl")}`,
          pt: `você ainda precisa de ${num("pt", proteinLeft)} gramas de proteínas.${covers("pt")}`,
          ru: `тебе ещё нужно ${num("ru", proteinLeft)} г белка.${covers("ru")}`,
        },
      );
    }
    if (kcalLeft !== null && kcalLeft >= 150 && hour >= 11 && ![...flagged].some((key) => key.startsWith("over:"))) {
      const dish = kept
        .filter((row) => {
          const meant = mealNamed(row.name);
          const repeated = row.foods.filter((food) => !isNew(food)).length * 2 > row.foods.length;
          // One sitting, at the right time, and not the day's food over again.
          return next !== null && (meant === null || meant === next) && !repeated && row.kcal !== null && row.kcal >= 100 && row.kcal <= Math.min(kcalLeft, kcalGoal! * 0.45);
        })
        .sort((a, b) => (b.proteins ?? 0) - (a.proteins ?? 0))[0];
      if (dish) {
        add(
          "dish",
          80,
          "happy",
          `${n(eaten)} of ${n(kcalGoal!)} kcal eaten so far today, so ${n(kcalLeft)} kcal are left. Their ${dish.what} "${dish.name}" (${dish.foods.slice(0, 4).join(", ")}) fits for ${next}: ${n(dish.kcal!)} kcal${dish.proteins ? ` and ${n(dish.proteins)} grams of protein` : ""} a serving.`,
          {
            en: `you have ${n(kcalLeft)} kcal left. Your ${dish.name} fits for ${next}.`,
            es: `te quedan ${num("es", kcalLeft)} kcal. Tu ${dish.name} encaja para ${MEAL_FOR.es[next!]}.`,
            de: `du hast noch ${num("de", kcalLeft)} kcal übrig. ${upperFirst(dish.name)} passt ${MEAL_FOR.de[next!]}.`,
            fr: `il te reste ${num("fr", kcalLeft)} kcal. ${upperFirst(dish.name)} convient pour ${MEAL_FOR.fr[next!]}.`,
            it: `ti restano ${num("it", kcalLeft)} kcal. Per ${MEAL_FOR.it[next!]} puoi scegliere: ${dish.name}.`,
            nl: `je hebt nog ${num("nl", kcalLeft)} kcal over. Een idee voor ${MEAL_FOR.nl[next!]}: ${dish.name}.`,
            pl: `masz jeszcze ${num("pl", kcalLeft)} kcal do zjedzenia. Pomysł ${MEAL_FOR.pl[next!]}: ${dish.name}.`,
            pt: `você ainda tem ${num("pt", kcalLeft)} kcal. Para ${MEAL_FOR.pt[next!]}, uma opção é: ${dish.name}.`,
            ru: `у тебя осталось ${num("ru", kcalLeft)} ккал. На ${MEAL_FOR.ru[next!]} подойдёт: ${dish.name}.`,
          },
        );
      } else {
        add("kcal_left", 60, "idle", `${n(eaten)} of ${n(kcalGoal!)} kcal eaten so far today, so ${n(kcalLeft)} kcal are left.`, {
          en: `you have ${n(kcalLeft)} kcal left today.`,
          es: `hoy te quedan ${num("es", kcalLeft)} kcal.`,
          de: `du hast heute noch ${num("de", kcalLeft)} kcal übrig.`,
          fr: `il te reste ${num("fr", kcalLeft)} kcal aujourd’hui.`,
          it: `oggi ti restano ${num("it", kcalLeft)} kcal.`,
          nl: `je hebt vandaag nog ${num("nl", kcalLeft)} kcal over.`,
          pl: `masz dziś jeszcze ${num("pl", kcalLeft)} kcal do zjedzenia.`,
          pt: `hoje você ainda tem ${num("pt", kcalLeft)} kcal.`,
          ru: `на сегодня у тебя осталось ${num("ru", kcalLeft)} ккал.`,
        });
      }
    }
    if (proteinLeft !== null && proteinLeft <= 0) {
      add("protein_done", 78, "happy", `Protein goal reached today: ${n(protein)} of ${n(proteinGoal!)} grams.`, {
        en: "your protein goal is done for today. Nice work.",
        es: "tu meta de proteína de hoy está cumplida. ¡Buen trabajo!",
        de: "dein Eiweißziel für heute ist erreicht. Gut gemacht!",
        fr: "ton objectif de protéines du jour est atteint. Bravo !",
        it: "obiettivo di proteine raggiunto per oggi. Ottimo lavoro!",
        nl: "je eiwitdoel voor vandaag is gehaald. Goed bezig!",
        pl: "cel białkowy na dziś osiągnięty. Dobra robota!",
        pt: "sua meta de proteínas de hoje foi alcançada. Ótimo trabalho!",
        ru: "цель по белку на сегодня выполнена. Отличная работа!",
      });
    }
  }

  if (week.length >= 3) {
    if (proteinGoal) {
      const hit = week.filter((day) => (day.totals.proteins ?? 0) >= proteinGoal).length;
      if (hit >= 2 && hit * 2 >= week.length) {
        add("protein_week", 66, "happy", `Protein goal reached on ${hit} of the ${days(week.length)} logged in the last 7 days.`, {
          en: `you hit your protein goal on ${hit} of ${days(week.length)} this past week.`,
          es: `esta semana cumpliste tu meta de proteína ${hit} de ${dayCount("es", week.length)}.`,
          de: `diese Woche hast du dein Eiweißziel an ${hit} von ${dayCount("de", week.length)} erreicht.`,
          fr: `cette semaine, tu as atteint ton objectif de protéines sur ${hit} des ${dayCount("fr", week.length)} notés.`,
          it: `questa settimana hai raggiunto l’obiettivo di proteine in ${hit} giorni su ${week.length} registrati.`,
          nl: `deze week heb je je eiwitdoel gehaald op ${hit} van de ${dayCount("nl", week.length)} die je hebt bijgehouden.`,
          pl: `w tym tygodniu cel białkowy osiągnięty w ${hit} z ${dayCount("pl", week.length)} z wpisami.`,
          pt: `esta semana você bateu sua meta de proteínas em ${hit} de ${dayCount("pt", week.length)} registrados.`,
          ru: `за неделю цель по белку выполнена в ${hit} из ${ruDaysOf(week.length)}.`,
        });
      }
    }
    if (kcalGoal) {
      const average = mean(week, "energyKcal");
      const ratio = average / kcalGoal;
      if (ratio < 0.75) {
        add("week", 50, "thinking", `Logged ${n(average)} kcal a day on average over the last 7 days, well under the goal of ${n(kcalGoal)}. Ask whether something isn't being logged; never praise it.`, {
          en: `you logged ${n(average)} kcal a day this past week, well under your goal. Is anything missing?`,
          es: `esta semana registraste una media de ${num("es", average)} kcal al día, muy por debajo de tu meta. ¿Falta algo?`,
          de: `diese Woche hast du im Schnitt ${num("de", average)} kcal am Tag eingetragen, deutlich unter deinem Ziel. Fehlt etwas?`,
          fr: `cette semaine, tu as noté en moyenne ${num("fr", average)} kcal par jour, bien en dessous de ton objectif. Il manque quelque chose ?`,
          it: `questa settimana hai registrato in media ${num("it", average)} kcal al giorno, molto sotto il tuo obiettivo. Manca qualcosa?`,
          nl: `deze week heb je gemiddeld ${num("nl", average)} kcal per dag bijgehouden, flink onder je doel. Mist er iets?`,
          pl: `w tym tygodniu zapisano średnio ${num("pl", average)} kcal dziennie, sporo poniżej celu. Czegoś brakuje?`,
          pt: `esta semana você registrou em média ${num("pt", average)} kcal por dia, bem abaixo da sua meta. Está faltando alguma coisa?`,
          ru: `за неделю в среднем записано ${num("ru", average)} ккал в день — заметно меньше цели. Может, что-то не записано?`,
        });
      } else if (ratio <= 1.05) {
        add("week", 58, "happy", `Averaged ${n(average)} kcal a day over the last 7 days, close to the goal of ${n(kcalGoal)}.`, {
          en: `you averaged ${n(average)} kcal a day this past week, close to your goal.`,
          es: `esta semana tuviste una media de ${num("es", average)} kcal al día, cerca de tu meta.`,
          de: `diese Woche waren es im Schnitt ${num("de", average)} kcal am Tag, nah an deinem Ziel.`,
          fr: `cette semaine, tu étais en moyenne à ${num("fr", average)} kcal par jour, proche de ton objectif.`,
          it: `questa settimana hai avuto una media di ${num("it", average)} kcal al giorno, vicina al tuo obiettivo.`,
          nl: `deze week zat je gemiddeld op ${num("nl", average)} kcal per dag, dicht bij je doel.`,
          pl: `w tym tygodniu średnio ${num("pl", average)} kcal dziennie, blisko celu.`,
          pt: `esta semana você teve uma média de ${num("pt", average)} kcal por dia, perto da sua meta.`,
          ru: `за неделю в среднем ${num("ru", average)} ккал в день — близко к цели.`,
        });
      } else {
        add("week", 46, "thinking", `Averaged ${n(average)} kcal a day over the last 7 days; the goal is ${n(kcalGoal)}. Be kind; offer help planning.`, {
          en: `you averaged ${n(average)} kcal a day this past week. Want a hand planning the next one?`,
          es: `esta semana tuviste una media de ${num("es", average)} kcal al día. ¿Te ayudo a planear la siguiente?`,
          de: `diese Woche waren es im Schnitt ${num("de", average)} kcal am Tag. Soll ich dir helfen, die nächste zu planen?`,
          fr: `cette semaine, tu étais en moyenne à ${num("fr", average)} kcal par jour. Je t’aide à planifier la prochaine ?`,
          it: `questa settimana hai avuto una media di ${num("it", average)} kcal al giorno. Ti aiuto a pianificare la prossima?`,
          nl: `deze week zat je gemiddeld op ${num("nl", average)} kcal per dag. Zal ik je helpen de volgende week te plannen?`,
          pl: `w tym tygodniu średnio ${num("pl", average)} kcal dziennie. Pomóc ci zaplanować następny?`,
          pt: `esta semana você teve uma média de ${num("pt", average)} kcal por dia. Quer ajuda para planejar a próxima?`,
          ru: `за неделю в среднем ${num("ru", average)} ккал в день. Помочь спланировать следующую?`,
        });
      }
    }
    if (before.length >= 3) {
      const [was, is] = [mean(before, "proteins"), mean(week, "proteins")];
      if (is >= was * 1.1 && is - was >= 5) {
        add("protein_up", 64, "happy", `Protein is up: ${n(is)} grams a day in the last 7 days, from ${n(was)} the 7 days before.`, {
          en: `your protein is up to ${n(is)} grams a day, from ${n(was)} the week before.`,
          es: `tu proteína subió a ${num("es", is)} gramos al día, desde ${num("es", was)} la semana anterior.`,
          de: `dein Eiweiß ist gestiegen: ${num("de", is)} Gramm am Tag statt ${num("de", was)} in der Woche davor.`,
          fr: `tes protéines sont en hausse : ${num("fr", is)} grammes par jour, contre ${num("fr", was)} la semaine d’avant.`,
          it: `le tue proteine sono in aumento: ${num("it", is)} grammi al giorno, contro ${num("it", was)} della settimana prima.`,
          nl: `je eet meer eiwit: ${num("nl", is)} gram per dag, tegen ${num("nl", was)} de week ervoor.`,
          pl: `więcej białka: ${num("pl", is)} g dziennie wobec ${num("pl", was)} tydzień wcześniej.`,
          pt: `suas proteínas subiram: ${num("pt", is)} gramas por dia, contra ${num("pt", was)} na semana anterior.`,
          ru: `белка стало больше: ${num("ru", is)} г в день против ${num("ru", was)} неделей раньше.`,
        });
      }
    }
  }

  const badges = badgeViews.en;
  const { streak } = badges;
  if (streak.days >= 2) {
    if (streak.loggedToday) add("streak", 52, "happy", `${days(streak.days)} in a row with something logged; today counts already.`, {
      en: `that's ${days(streak.days)} logged in a row. Keep it rolling.`,
      es: `ya llevas ${dayCount("es", streak.days)} seguidos registrando. ¡Sigue así!`,
      de: `schon ${dayCount("de", streak.days)} in Folge eingetragen. Weiter so!`,
      fr: `déjà ${dayCount("fr", streak.days)} d’affilée avec des repas notés. Continue comme ça !`,
      it: `già ${dayCount("it", streak.days)} di fila con qualcosa registrato. Continua così!`,
      nl: `al ${dayCount("nl", streak.days)} op rij bijgehouden. Ga zo door!`,
      pl: `już ${dayCount("pl", streak.days)} z rzędu z wpisami. Tak trzymaj!`,
      pt: `já são ${dayCount("pt", streak.days)} seguidos com registros. Continue assim!`,
      ru: `уже ${dayCount("ru", streak.days)} подряд с записями. Так держать!`,
    });
    else add("streak", hour >= 17 ? 88 : 56, "idle", `${days(streak.days)} in a row with something logged. Nothing logged yet today; logging keeps the streak.`, {
      en: `log something today to keep your ${streak.days}-day streak.`,
      es: `registra algo hoy para mantener tu racha de ${dayCount("es", streak.days)}.`,
      de: `trag heute etwas ein, damit deine Serie von ${dayCount("de", streak.days)} hält.`,
      fr: `note quelque chose aujourd’hui pour garder ta série de ${dayCount("fr", streak.days)}.`,
      it: `registra qualcosa oggi per non interrompere la tua serie di ${dayCount("it", streak.days)}.`,
      nl: `voeg vandaag iets toe, dan blijft je reeks van ${dayCount("nl", streak.days)} staan.`,
      pl: `dodaj dziś coś, żeby nie przerwać serii (${dayCount("pl", streak.days)} z rzędu).`,
      pt: `registre algo hoje para não perder sua sequência de ${dayCount("pt", streak.days)}.`,
      ru: `запиши что-нибудь сегодня, чтобы не прервать серию из ${ruDaysOf(streak.days)}.`,
    });
  }
  // A badge just earned has its own moment; the coach only mentions one that's close.
  const near = badges.closest[0];
  // The same badge in another language.
  const local = (locale: "de" | "es" | "fr" | "it" | "nl" | "pl" | "pt" | "ru") => {
    const found = badgeViews[locale].families.flatMap((family) => family.badges).find((badge) => badge.id === near?.id);
    return found ?? near!;
  };
  if (near && near.progress >= 0.7) add("next_badge", 54, "happy", `Closest badge: "${near.title}", ${near.progressText}. ${near.description}`, {
    en: `you're close to a badge: ${near.title}, ${near.progressText}.`,
    es: `estás cerca de una insignia: ${local("es").title}, ${local("es").progressText}.`,
    de: `du bist nah an einem Abzeichen: ${local("de").title}, ${local("de").progressText}.`,
    fr: `tu es tout près d’un badge : ${local("fr").title}, ${local("fr").progressText}.`,
    it: `manca poco a un nuovo badge: ${local("it").title}, ${local("it").progressText}.`,
    nl: `je hebt bijna een nieuwe badge: ${local("nl").title}, ${local("nl").progressText}.`,
    pl: `jesteś blisko nowej odznaki: „${local("pl").title}”, ${local("pl").progressText}.`,
    pt: `falta pouco para uma nova medalha: ${local("pt").title}, ${local("pt").progressText}.`,
    ru: `ты близко к новому значку: «${local("ru").title}», ${local("ru").progressText}.`,
  });

  if (recentWeight && earlierWeight) {
    const closer = Math.abs(earlierWeight.weightKg - goalWeight!) - Math.abs(recentWeight.weightKg - goalWeight!);
    // Going where they want; the other way is a flag.
    if (closer >= 0.3) {
      add("weight", 62, "happy", `Weight is ${one(closer)} kg closer to the goal than on ${earlierWeight.date}.`, {
        en: `you're ${one(closer)} kg closer to your goal weight than a few weeks ago.`,
        es: `estás ${tenth("es", closer)} kg más cerca de tu peso meta que hace unas semanas.`,
        de: `du bist ${tenth("de", closer)} kg näher an deinem Zielgewicht als vor ein paar Wochen.`,
        fr: `tu es ${tenth("fr", closer)} kg plus près de ton poids cible qu’il y a quelques semaines.`,
        it: `rispetto a qualche settimana fa, il tuo peso obiettivo è ${tenth("it", closer)} kg più vicino.`,
        nl: `je zit ${tenth("nl", closer)} kg dichter bij je streefgewicht dan een paar weken geleden.`,
        pl: `jesteś ${tenth("pl", closer)} kg bliżej wagi docelowej niż kilka tygodni temu.`,
        pt: `você está ${tenth("pt", closer)} kg mais perto da sua meta de peso do que há algumas semanas.`,
        ru: `ты на ${tenth("ru", closer)} кг ближе к целевому весу, чем несколько недель назад.`,
      });
    }
  }

  const steps = activity.find((row) => row.date === shiftYmd(today, -1))?.steps ?? null;
  const others = activity.filter((row) => row.date < shiftYmd(today, -1)).flatMap((row) => (row.steps ? [row.steps] : []));
  if (steps && others.length >= 4) {
    const usualSteps = others.reduce((sum, value) => sum + value, 0) / others.length;
    if (steps >= usualSteps * 1.15) add("steps", 48, "happy", `${n(steps)} steps yesterday, above the usual ${n(usualSteps)}.`, {
      en: `you walked ${n(steps)} steps yesterday, above your usual ${n(usualSteps)}.`,
      es: `ayer caminaste ${num("es", steps)} pasos, más que tus ${num("es", usualSteps)} habituales.`,
      de: `gestern bist du ${num("de", steps)} Schritte gegangen, mehr als deine üblichen ${num("de", usualSteps)}.`,
      fr: `hier, tu as fait ${num("fr", steps)} pas, plus que tes ${num("fr", usualSteps)} habituels.`,
      it: `ieri hai fatto ${num("it", steps)} passi, più dei tuoi soliti ${num("it", usualSteps)}.`,
      nl: `gisteren heb je ${num("nl", steps)} stappen gezet, meer dan de ${num("nl", usualSteps)} die je meestal zet.`,
      pl: `wczoraj ${num("pl", steps)} ${pluralForm("pl", Math.round(steps), { few: "kroki", many: "kroków", one: "krok", other: "kroku" })} – więcej niż zwykle (${num("pl", usualSteps)}).`,
      pt: `ontem você deu ${num("pt", steps)} passos, mais do que os seus ${num("pt", usualSteps)} de costume.`,
      ru: `вчера ${num("ru", steps)} ${ruWord(Math.round(steps), "шаг", "шага", "шагов")} — больше обычных ${num("ru", usualSteps)}.`,
    });
  }

  const comment = comments[0];
  if (comment) {
    const from = firstName(comment.fromUser.name) ?? "their coach";
    const count = comments.length === 1 ? "a comment" : `${comments.length} comments`;
    add(`comments:${comments.length}`, 90, "idle", `${from} (their human coach, a different person from you) left ${count} on today: "${comment.body.slice(0, 160)}"`, {
      en: `there's ${count} from ${from === "their coach" ? "your coach" : from} on your day.`,
      es: `hay ${comments.length === 1 ? "un comentario" : `${comments.length} comentarios`} de ${from === "their coach" ? "tu coach" : from} sobre tu día.`,
      de: `es gibt ${comments.length === 1 ? "einen Kommentar" : `${comments.length} Kommentare`} von ${from === "their coach" ? "deinem Coach" : from} zu deinem Tag.`,
      fr: `${from === "their coach" ? "ton coach" : from} a laissé ${comments.length === 1 ? "un commentaire" : `${comments.length} commentaires`} sur ta journée.`,
      it: `${from === "their coach" ? "il tuo coach" : from} ha lasciato ${comments.length === 1 ? "un commento" : `${comments.length} commenti`} sulla tua giornata.`,
      nl: `${from === "their coach" ? "je coach" : from} heeft ${comments.length === 1 ? "een opmerking" : `${comments.length} opmerkingen`} bij je dag achtergelaten.`,
      pl: `${from === "their coach" ? "trener" : from} komentuje twój dzień${comments.length === 1 ? "" : ` (${comments.length} ${pluralForm("pl", comments.length, { few: "komentarze", many: "komentarzy", one: "komentarz", other: "komentarza" })})`}.`,
      pt: `${from === "their coach" ? "seu coach" : from} deixou ${comments.length === 1 ? "um comentário" : `${comments.length} comentários`} no seu dia.`,
      ru: `к твоему дню ${comments.length === 1 ? "есть комментарий" : `есть ${comments.length} ${ruWord(comments.length, "комментарий", "комментария", "комментариев")}`} от ${from === "their coach" ? "твоего коуча" : from}.`,
    });
  }

  if (usual) add("usual", 70, "idle", `They usually have ${usual.name} around this time (${usual.count} of the last 21 days) and haven't logged it today.`, {
    en: `time for your usual ${usual.name}? Tell me and I'll log it.`,
    es: `¿toca tu ${usual.name} de siempre? Dímelo y lo registro.`,
    de: `Zeit für dein übliches ${usual.name}? Sag Bescheid, dann trag ich es ein.`,
    fr: `envie de ton classique (${usual.name}) ? Dis-le-moi et je le note.`,
    it: `ti va il solito (${usual.name})? Dimmelo e lo registro.`,
    nl: `tijd voor wat je meestal neemt (${usual.name})? Zeg het maar, dan voeg ik het toe.`,
    pl: `czas na to, co zwykle jesz (${usual.name})? Powiedz, a dodam.`,
    pt: `que tal o de sempre (${usual.name})? Me diga e eu registro.`,
    ru: `время для привычного: ${usual.name}? Скажи — и я запишу.`,
  });

  if (eaten === 0 && !flagged.has("empty_evening")) {
    if (hour >= 11) add("empty", 72, "idle", "Nothing logged yet today, and it's past 11. They can tell you what they ate, or send a photo, and you log it.", {
      en: "nothing's logged yet today. Tell me what you ate and I'll add it.",
      es: "hoy aún no hay nada registrado. Dime qué comiste y lo añado.",
      de: "heute ist noch nichts eingetragen. Sag mir, was du gegessen hast, und ich trag es ein.",
      fr: "rien n’est encore noté aujourd’hui. Dis-moi ce que tu as mangé et je l’ajoute.",
      it: "oggi non hai ancora registrato niente. Dimmi cosa hai mangiato e lo aggiungo.",
      nl: "je hebt vandaag nog niets toegevoegd. Vertel me wat je hebt gegeten, dan voeg ik het toe.",
      pl: "na razie nic dziś nie zapisano. Napisz, co było na talerzu, a dodam.",
      pt: "hoje ainda não há nada registrado. Me conte o que você comeu e eu adiciono.",
      ru: "сегодня пока ничего не записано. Расскажи, что было на тарелке, — я добавлю.",
    });
    else if (hour >= 4) add("morning", 44, "happy", "A new day with nothing logged yet. Ask what's for breakfast, or wish them a good start.", {
      en: "good morning! What's for breakfast?",
      es: "¡buenos días! ¿Qué hay de desayuno?",
      de: "guten Morgen! Was gibt es zum Frühstück?",
      fr: "bonjour ! Qu’est-ce que tu prends au petit-déjeuner ?",
      it: "buongiorno! Cosa mangi a colazione?",
      nl: "goedemorgen! Wat eet je als ontbijt?",
      pl: "dzień dobry! Co na śniadanie?",
      pt: "bom dia! O que tem para o café da manhã?",
      ru: "доброе утро! Что на завтрак?",
    });
  }

  const said = words.at(-1);
  // A bare "yes" or "why?" isn't anything to come back to.
  if (said && said.text.length >= 15 && now.getTime() - said.at.getTime() > 45 * 60_000 && now.getTime() - said.at.getTime() < 14 * 3_600_000) {
    const at = getZonedParts(said.at, timezone);
    add("chat", 68, "idle", `They wrote to you at ${at.hour}:${String(at.minute).padStart(2, "0")}: "${said.text}". Only worth following up if it was about something still ahead or that just happened.`, null);
  }

  // Only for want of anything else.
  if (facts.filter((fact) => fact.plain !== null).length < 3) add("hello", 5, "happy", "Nothing in particular to report. Offer help with a meal idea, or logging by text, voice or photo.", {
    en: "ask me for a meal idea, or send a photo of what you're eating.",
    es: "pídeme una idea de comida o mándame una foto de lo que comes.",
    de: "frag mich nach einer Essensidee oder schick mir ein Foto von dem, was du isst.",
    fr: "demande-moi une idée de repas ou envoie-moi une photo de ce que tu manges.",
    it: "chiedimi un’idea per un pasto o mandami una foto di quello che mangi.",
    nl: "vraag me om een idee voor een maaltijd, of stuur een foto van wat je eet.",
    pl: "poproś mnie o pomysł na posiłek albo wyślij zdjęcie tego, co jesz.",
    pt: "me peça uma ideia de refeição ou mande uma foto do que você está comendo.",
    ru: "попроси у меня идею, что поесть, или пришли фото того, что ешь.",
  });

  return {
    day: dayInWords(todays, next),
    facts: facts.sort((a, b) => b.score - a.score),
    lastWords: words.map((row) => row.text),
    localTime: `${new Intl.DateTimeFormat("en", { timeZone: timezone, weekday: "long" }).format(now)}, ${clock.hour}:${String(clock.minute).padStart(2, "0")}`,
    name: firstName(user?.name),
    next,
    stamp: [today, latestItem?.id ?? "", Math.round(eaten), comments.length].join("|"),
    today,
  };
}
