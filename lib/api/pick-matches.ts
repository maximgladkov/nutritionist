import { gateway, generateText, Output } from "ai";
import { z } from "zod";
import type { MatchQuestion } from "./deps.ts";

// Chooses, for every food recognized in one analysis, which catalog product (if any) it is.
const DEFAULT_MODEL_ID = "anthropic/claude-haiku-5.5";
const PICK_TIMEOUT_MS = 12_000;


function round(value: number | undefined): string {
  return value === undefined ? "?" : String(Math.round(value * 10) / 10);
}

function per100Line(values: Record<string, number>): string {
  const kcal = values.energyKcal100g ?? values.energyKcal100ml;
  const protein = values.proteins100g ?? values.proteins100ml;
  const carbs = values.carbohydrates100g ?? values.carbohydrates100ml;
  const fat = values.fat100g ?? values.fat100ml;
  return `${round(kcal)} kcal, P ${round(protein)} C ${round(carbs)} F ${round(fat)} per 100`;
}

function describe(questions: readonly MatchQuestion[]): string {
  return questions
    .map((question, foodIndex) => {
      const options = question.candidates
        .map((candidate, index) => `  ${index}. ${candidate.name}${candidate.brand ? ` (${candidate.brand})` : ""}: ${per100Line(candidate.per100)}`)
        .join("\n");
      return `Food ${foodIndex}: ${question.name}, ${question.amount} ${question.unit}; estimate ${per100Line(question.estimate)}\n${options || "  (no products)"}`;
    })
    .join("\n\n");
}

const singleSchema = z.object({
  // A few words of reasoning before the answer makes the pick noticeably stricter.
  reason: z.string().describe("At most 12 words: why the chosen product is, or why none is, the same food."),
  candidate: z.number().int().nullable().describe("Index of the matching product, or null if none is the same food."),
});

const RULES = [
  "Pick the product that is the same food in the same form, so its nutrition can be used instead of the estimate.",
  "The product name must describe that food itself, not a dish, drink or snack that contains it or is flavoured like it.",
  "Prefer plain, generic versions over flavoured, light, sweetened or mixed ones unless the food says so.",
  "Examples: black coffee is not an iced mocha or latte; a toasted bread slice is not a rusk, crispbread or bread roll; butter is not a butter cookie; chicken breast is not nuggets.",
  "When unsure, return null: a wrong product is worse than the estimate.",
].join(" ");

// One small call per food, all at once: much faster than one long answer for the whole meal.
async function pickOne(question: MatchQuestion): Promise<number | null> {
  if (question.candidates.length === 0) return null;
  const result = await generateText({
    abortSignal: AbortSignal.timeout(PICK_TIMEOUT_MS),
    model: gateway(process.env.FOOD_MATCH_MODEL?.trim() || DEFAULT_MODEL_ID),
    output: Output.object({ schema: singleSchema }),
    // A quick judgement, not a puzzle: no extended thinking keeps each pick near a second.
    providerOptions: { anthropic: { thinking: { type: "disabled" } } },
    prompt: `${RULES}\n\n${describe([question]).replace(/^Food 0: /, "Food: ")}`,
    system: "You match foods to catalog products for a nutrition diary. Be strict: a wrong product is worse than none.",
  });
  if (process.env.FOOD_MATCH_DEBUG) console.info("[pick]", question.name, "→", result.output.candidate, result.output.reason);
  const index = result.output.candidate;
  return index !== null && index >= 0 && index < question.candidates.length ? index : null;
}

export async function pickMatchesWithModel(questions: readonly MatchQuestion[]): Promise<(number | null)[]> {
  return Promise.all(questions.map((question) => pickOne(question)));
}
