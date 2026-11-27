export type MainMeal = "breakfast" | "dinner" | "lunch";

type LoggedMeal = { at: { hour: number; minute: number }; foods: readonly string[]; label: string };

// What someone calls a saved meal, in the languages the app's people write in.
const NAMES: Record<MainMeal, readonly string[]> = {
  breakfast: ["breakfast", "brunch", "porridge", "oatmeal", "завтрак", "сніданок", "каша", "овсян", "desayuno", "frühstück", "petit déjeuner", "petit-déjeuner", "colazione", "śniadanie", "kahvaltı", "朝食", "朝ごはん"],
  dinner: ["dinner", "supper", "ужин", "вечеря", "cena", "abendessen", "dîner", "kolacja", "夕食", "夕飯", "晩ごはん"],
  lunch: ["lunch", "обед", "обід", "almuerzo", "mittagessen", "déjeuner", "pranzo", "obiad", "昼食", "昼ごはん", "ランチ"],
};

// The meal a dish is for, when its name says so; null when it could be any.
export function mealNamed(name: string): MainMeal | null {
  const text = name.toLowerCase();
  return (["breakfast", "lunch", "dinner"] as const).find((meal) => NAMES[meal].some((word) => hasWord(text, word))) ?? null;
}

// From the start of a word, whatever its ending: "обеда", but not "победа".
function hasWord(text: string, word: string): boolean {
  return new RegExp(`(?<!\\p{L})${word}`, "u").test(text);
}

const MEALS = ["breakfast", "lunch", "dinner"] as const;
// Dishes, not the meal itself.
const DISHES = new Set(["porridge", "oatmeal", "каша", "овсян"]);

// Whether a message talks of a meal that isn't the one coming: had already, or past.
export function namesWrongMeal(text: string, next: MainMeal | null): boolean {
  const lower = text.toLowerCase().replaceAll(/petit[ -]déjeuner/gu, "breakfast");
  return MEALS.some((meal) => meal !== next && NAMES[meal].some((word) => !DISHES.has(word) && hasWord(lower, word)));
}

// The main meal they'd have next: one whose time has come or is coming, and that isn't logged. A
// later meal logged means an earlier one was skipped, not that it's still to come.
export function nextMeal(hour: number, logged: ReadonlySet<string>): MainMeal | null {
  if (logged.has("dinner") || hour >= 22 || hour < 4) return null;
  if (logged.has("lunch") || hour >= 16) return "dinner";
  if (logged.has("breakfast") || hour >= 11) return "lunch";
  return "breakfast";
}

// Their day in a line or two, for judging what's sensible to say now.
export function dayInWords(meals: readonly LoggedMeal[], next: MainMeal | null): string {
  const eaten = meals
    .filter((meal) => meal.foods.length > 0)
    .map((meal) => `${meal.label} at ${meal.at.hour}:${String(meal.at.minute).padStart(2, "0")} (${meal.foods.slice(0, 5).join(", ")})`);
  return [
    eaten.length > 0 ? `Already eaten and logged today: ${eaten.join("; ")}.` : "Nothing logged yet today.",
    next ? `Next main meal: ${next}.` : "The main meals of the day are over.",
  ].join(" ");
}
