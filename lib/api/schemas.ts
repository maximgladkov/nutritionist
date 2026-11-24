import { z } from "zod";
import { isBirthDate, isHeightCm, PROFILE_GENDERS } from "../profile.ts";
import { parseYmd } from "../timezone.ts";

const nutrient = z.number().min(0).max(10_000).optional();

export const nutrimentsInputSchema = z
  .object({
    carbohydrates100g: nutrient,
    carbohydrates100ml: nutrient,
    energyKcal100g: nutrient,
    energyKcal100ml: nutrient,
    fat100g: nutrient,
    fat100ml: nutrient,
    fiber100g: nutrient,
    fiber100ml: nutrient,
    proteins100g: nutrient,
    proteins100ml: nutrient,
    salt100g: nutrient,
    salt100ml: nutrient,
    saturatedFat100g: nutrient,
    saturatedFat100ml: nutrient,
    sugars100g: nutrient,
    sugars100ml: nutrient,
  })
  .strict();

export const mealLabelSchema = z.enum(["breakfast", "lunch", "dinner", "snack", "other"]);
export const unitSchema = z.enum(["g", "ml", "serving"]);
export const ymdSchema = z.string().refine((value) => parseYmd(value) !== null, "Use a YYYY-MM-DD date.");

export const birthDateSchema = z.string().refine((value) => isBirthDate(value), "Choose a valid date of birth.");
export const heightSchema = z.number().refine(isHeightCm, "Enter a height from 50 to 272 cm.");
export const genderSchema = z.enum(PROFILE_GENDERS);

export const servingSchema = z.object({
  grams: z.number().positive().max(10_000),
  label: z.string().trim().min(1).max(80),
});

export const mealItemInputSchema = z
  .object({
    amount: z.number().positive().max(10_000),
    barcode: z.string().trim().min(1).optional(),
    brand: z.string().trim().max(200).optional(),
    foodId: z.string().trim().min(1).optional(),
    // Lets an offline client create the item with its own id and retry safely.
    id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,64}$/, "Use 16-64 letters, digits, dashes or underscores for the id.")
      .optional(),
    name: z.string().trim().min(1).max(200).optional(),
    nutrimentsPer100g: nutrimentsInputSchema.optional(),
    // The serving picked when logging, so the food reopens in it; null or left out for grams/ml.
    serving: servingSchema.nullable().optional(),
    unit: unitSchema,
  })
  .refine((item) => item.barcode || item.foodId || item.name, "Each item needs a barcode, foodId, or name.");

export type MealItemInputBody = z.infer<typeof mealItemInputSchema>;
