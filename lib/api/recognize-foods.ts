import { gateway, generateText, Output, type ModelMessage } from "ai";
import { z } from "zod";
import type { FoodRecognizer } from "./deps.ts";

// Defaults to the agent's model. Set FOOD_RECOGNITION_MODEL to use a different vision model.
const DEFAULT_MODEL_ID = "alibaba/qwen3.7-flash";

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
        brand: z.string().optional().describe("Brand, only when printed on the pack or named by the user."),
        name: z.string().min(1).describe("Short food name in the user's language."),
        nutrimentsPer100g: per100Schema.optional(),
        searchQueries: z
          .array(z.string().min(1))
          .min(1)
          .max(4)
          .describe("Catalog search terms: the food name, its English name, and a generic name."),
        unit: z.enum(["g", "ml", "serving"]),
      }),
    )
    .max(20),
  note: z.string().optional().describe("One short sentence when something was unclear."),
});

const INSTRUCTIONS: Record<"label" | "photo" | "text", string> = {
  label:
    "The image is a packaged food's nutrition table. Return exactly one food. Copy the per-100 g (or per-100 ml) values from the table into nutrimentsPer100g. Use the product name and brand from the pack when visible. Set amount to one serving in grams or ml when the label states it, otherwise 100.",
  photo:
    "The image shows a plated meal. List each distinct food with a realistic portion in grams (or ml for drinks). Always fill nutrimentsPer100g with typical values for that food.",
  text:
    "The user described what they ate. List each food with the amount they said, or a typical portion in grams when they didn't. Always fill nutrimentsPer100g with typical values for that food.",
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
    output: Output.object({ schema: resultSchema }),
    system: "You identify foods for a nutrition diary. Never invent barcodes.",
  });
  return result.output;
};
