import { z } from "zod";

export const nutrimentsInputSchema = z.object({
  energyKcal100g: z.number().optional(),
  proteins100g: z.number().optional(),
  carbohydrates100g: z.number().optional(),
  sugars100g: z.number().optional(),
  fat100g: z.number().optional(),
  saturatedFat100g: z.number().optional(),
  fiber100g: z.number().optional(),
  salt100g: z.number().optional(),
  energyKcal100ml: z.number().optional(),
  proteins100ml: z.number().optional(),
  carbohydrates100ml: z.number().optional(),
  sugars100ml: z.number().optional(),
  fat100ml: z.number().optional(),
  saturatedFat100ml: z.number().optional(),
  fiber100ml: z.number().optional(),
  salt100ml: z.number().optional(),
});

export const mealItemInputSchema = z
  .object({
    barcode: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    amount: z.number().positive().max(10000),
    unit: z.enum(["g", "ml", "serving"]),
    nutrimentsPer100g: nutrimentsInputSchema.optional(),
  })
  .refine((value) => Boolean(value.barcode) || Boolean(value.name), {
    message: "Provide barcode and/or name",
  });

export const mealLabelSchema = z.enum(["breakfast", "lunch", "dinner", "snack", "other"]);
