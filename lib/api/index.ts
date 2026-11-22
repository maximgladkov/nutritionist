import { createRouter, type RouteDefinition } from "./router.ts";
import { analyzeRoutes } from "./routes/analyze.ts";
import { authRoutes } from "./routes/auth.ts";
import { bodyRoutes } from "./routes/body.ts";
import { diaryRoutes } from "./routes/diary.ts";
import { foodRoutes } from "./routes/foods.ts";
import { groupRoutes } from "./routes/groups.ts";
import { mealRoutes } from "./routes/meals.ts";
import { meRoutes } from "./routes/me.ts";
import { notificationRoutes } from "./routes/notifications.ts";
import { savedMealRoutes } from "./routes/saved-meals.ts";
import { uploadRoutes } from "./routes/uploads.ts";

export const apiRoutes: readonly RouteDefinition[] = [
  ...authRoutes,
  ...meRoutes,
  ...bodyRoutes,
  ...diaryRoutes,
  // `/foods/search` and `/foods/barcode/:code` must come before `/foods/:id`.
  ...foodRoutes,
  ...mealRoutes,
  ...savedMealRoutes,
  ...analyzeRoutes,
  ...uploadRoutes,
  ...groupRoutes,
  ...notificationRoutes,
];

export const handleApiRequest = createRouter(apiRoutes);
