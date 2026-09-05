import { defineTool } from "eve/tools";
import { z } from "zod";
import { deleteMealItem } from "../../lib/meals";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Delete one food item from a meal the caller owns. Use to correct a mistaken log. The meal is removed when its last item is deleted.",
  inputSchema: z.object({
    itemId: z.string().min(1),
  }),
  async execute({ itemId }, ctx) {
    const { userId } = await requireUser(ctx);
    return deleteMealItem({ userId, itemId });
  },
});
