import { gateway, generateText, Output, type ModelMessage } from "ai";
import { z } from "zod";
import type { FoodRecognizer } from "./deps.ts";

// Benchmarked 2026-11-22 on text, nutrition-label and meal-photo inputs: Haiku 5.5 read labels
// exactly in about 1.5 s and meals in about 3 s; GPT-6 Luna was as accurate but about twice as slow,
// so it is the fallback. Override with FOOD_RECOGNITION_MODEL / FOOD_RECOGNITION_FALLBACK_MODELS.
const DEFAULT_MODEL_ID = "anthropic/claude-haiku-5.5";
const DEFAULT_FALLBACK_MODEL_IDS = ["openai/gpt-6-luna"];
const RECOGNITION_TIMEOUT_MS = 30_000;

function fallbackModels(): string[] {
  const raw = process.env.FOOD_RECOGNITION_FALLBACK_MODELS;
  if (raw === undefined) return DEFAULT_FALLBACK_MODEL_IDS;
  return raw.split(",").map((id) => id.trim()).filter(Boolean);
}

const per100Schema = z
  .object({
    carbohydrates100g: z.number().min(0).optional(),
    energyKcal100g: z.number().min(0).optional(),
    fat100g: z.number().min(0).optional(),
    fiber100g: z.number().min(0).optional(),
    proteins100g: z.number().min(0).optional(),
    salt100g: z.number().min(0).optional(),
    saturatedFat100g: z.number().min(0).optional(),
    sugars100g: z.number().min(0).optional(),
  })
  .describe("Nutrition per 100 g (or per 100 ml for drinks).");

const resultSchema = z.object({
  foods: z
    .array(
      z.object({
        amount: z.number().positive().describe("Estimated amount eaten, in `unit`."),
        brand: z.string().nullable().optional().describe("Brand, only when printed on the pack or named by the user; null otherwise."),
        name: z.string().min(1).describe("Short food name in the user's language."),
        nutrimentsPer100g: per100Schema.optional(),
        position: z
          .object({
            x: z.number().min(0).max(1).describe("From the left edge: 0 is left, 1 is right."),
            y: z.number().min(0).max(1).describe("From the top edge: 0 is top, 1 is bottom."),
          })
          .nullable()
          .describe("Meal photos only: the centre of this food in the image, as fractions of its width and height; null otherwise."),
        searchQueries: z
          .array(z.string().min(1))
          .min(1)
          .max(4)
          .describe("Catalog search terms: the food name, its English name, and a generic name."),
        servingSize: z
          .string()
          .nullable()
          .describe("The serving size printed on a nutrition label, such as '40 g' or '250 ml'; null when there is none or the source is not a label."),
        unit: z.enum(["g", "ml", "serving"]),
      }),
    )
    .max(20),
  note: z.string().nullable().optional().describe("One short sentence when something was unclear; null otherwise."),
});

const INSTRUCTIONS: Record<"label" | "photo" | "text", string> = {
  label:
    "The image is a packaged food's nutrition table. Return exactly one food. Copy the per-100 g (or per-100 ml) values from the table into nutrimentsPer100g. Use the product name and brand from the pack when visible. Set servingSize to the serving the label states (for example '40 g'), and amount to that serving in grams or ml; when there is no serving, leave servingSize out and use 100.",
  photo: [
    "The image shows a meal. Break every prepared or combined dish into its basic ingredients and list each one as its own food: a sandwich becomes bread, butter, ham, cheese and lettuce; a salad becomes each vegetable, the cheese and the dressing; pasta becomes the pasta, the sauce's main parts and the grated cheese.",
    "Include fats, oils, dressings and sauces that are visible or that the dish normally contains (butter on toast, oil on a salad, mayonnaise in a sandwich), with a realistic amount.",
    "Keep a food whole only when it is a single ingredient (an apple, a boiled egg, a glass of milk) or a packaged product whose brand or label is visible.",
    "List each ingredient once: two slices of toast are one bread entry with their combined weight. Name it plainly as a product you could buy (Olive oil, not 'oil used for frying the egg').",
    "Leave out garnishes and seasonings with almost no calories (herbs, spices, a lettuce leaf used as decoration); keep drinks even when they have few calories.",
    "Estimate each ingredient's own weight from the plate size and typical recipes, so the parts add up to a realistic portion. Use unit g, or ml for drinks; never serving.",
    "Always fill nutrimentsPer100g with typical values for that ingredient as eaten (cooked pasta, not dry).",
    "Set position to the centre of each ingredient in the photo; for parts hidden inside one dish, use points on that dish spread a little apart so they don't overlap.",
  ].join(" "),
  text:
    "The user described what they ate. List each food with the amount they said, converted to grams (or ml for drinks): 2 eggs is about 100 g, a slice of bread about 35 g. Use a typical portion when they gave no amount. Use unit g or ml; never serving. Always fill nutrimentsPer100g with typical values for that food as eaten.",
};

export const recognizeFoodsWithModel: FoodRecognizer = async (input) => {
  const content: Exclude<ModelMessage["content"], string> = [
    {
      text: [
        INSTRUCTIONS[input.source],
        `Answer in the language with code "${input.locale}".`,
        input.text ? `User's description: ${input.text}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      type: "text",
    },
    ...input.images.map((image) => ({ data: image.bytes, mediaType: image.mediaType, type: "file" as const })),
  ];
  const result = await generateText({
    messages: [{ content, role: "user" }] as ModelMessage[],
    model: gateway(process.env.FOOD_RECOGNITION_MODEL?.trim() || DEFAULT_MODEL_ID),
    abortSignal: AbortSignal.timeout(RECOGNITION_TIMEOUT_MS),
    output: Output.object({ schema: resultSchema }),
    providerOptions: { gateway: { models: fallbackModels() } },
    system: "You identify foods for a nutrition diary. Never invent barcodes.",
  });
  // Models often send null for "not there"; the rest of the app expects the field left out.
  return {
    foods: result.output.foods.map(({ brand, position, servingSize, ...food }) => ({
      ...food,
      brand: brand ?? undefined,
      position: position ?? undefined,
      servingSize: servingSize ?? undefined,
    })),
    note: result.output.note ?? undefined,
  };
};
