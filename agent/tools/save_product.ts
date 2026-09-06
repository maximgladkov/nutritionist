import { defineTool } from "eve/tools";
import { z } from "zod";
import { saveCatalogProduct } from "../../lib/catalog-product";
import { nutrimentsInputSchema } from "../lib/meal-item-schema";
import { requireUser } from "../lib/require-user";

const catalogPhotoKindSchema = z.enum(["front", "nutrition", "other"]);

export default defineTool({
  description:
    "Save a packaged food to the custom catalog when lookup missed it or Open Food Facts has no nutrition. Pass name and nutrition from a label photo or the user. Nutrition must be per 100g or 100ml. Pass barcode only when you can clearly read a GTIN from the pack or the user typed it. Never invent, guess, or fabricate a barcode. If no barcode is clearly readable, omit barcode and save by name. When the user sent product photos this turn, pass photos with index (0-based among this turn's images) and kind front, nutrition, or other. Custom catalog entries take precedence over Open Food Facts. Call lookup_product first only when you have a real barcode. Do not save when lookup already returned hasNutrition true, unless you are adding photos to an existing custom catalog product.",
  inputSchema: z.object({
    barcode: z.string().optional(),
    name: z.string().min(1),
    brands: z.string().optional(),
    quantity: z.string().optional(),
    servingSize: z.string().optional(),
    nutriments: nutrimentsInputSchema,
    photos: z
      .array(
        z.object({
          index: z.number().int().min(0),
          kind: catalogPhotoKindSchema,
        }),
      )
      .optional(),
  }),
  async execute({ barcode, name, brands, quantity, servingSize, nutriments, photos }, ctx) {
    const { userId } = await requireUser(ctx);
    return saveCatalogProduct({
      barcode,
      brands,
      createdByUserId: userId,
      name,
      nutriments,
      photos,
      quantity,
      servingSize,
      sessionId: ctx.session.id,
      turnId: ctx.session.turn.id,
    });
  },
});
