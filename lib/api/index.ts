import { createRouter, type RouteDefinition } from "./router.ts";
import { achievementRoutes } from "./routes/achievements.ts";
import { analyzeRoutes } from "./routes/analyze.ts";
import { assistantRoutes } from "./routes/assistant.ts";
import { authRoutes } from "./routes/auth.ts";
import { bodyRoutes } from "./routes/body.ts";
import { diaryRoutes } from "./routes/diary.ts";
import { foodRoutes } from "./routes/foods.ts";
import { groupRoutes } from "./routes/groups.ts";
import { integrationRoutes } from "./routes/integrations.ts";
import { mealRoutes } from "./routes/meals.ts";
import { meRoutes } from "./routes/me.ts";
import { notificationRoutes } from "./routes/notifications.ts";
import { planRoutes } from "./routes/plans.ts";
import { profileRoutes } from "./routes/profile.ts";
import { recipeRoutes } from "./routes/recipes.ts";
import { savedMealRoutes } from "./routes/saved-meals.ts";
import { mealShareRoutes } from "./routes/meal-shares.ts";
import { uploadRoutes } from "./routes/uploads.ts";
import { voiceRoutes } from "./routes/voice.ts";

export const apiRoutes: readonly RouteDefinition[] = [
  ...authRoutes,
  ...meRoutes,
  ...planRoutes,
  ...profileRoutes,
  ...bodyRoutes,
  ...achievementRoutes,
  ...diaryRoutes,
  // `/foods/search` and `/foods/barcode/:code` must come before `/foods/:id`.
  ...foodRoutes,
  ...mealRoutes,
  ...savedMealRoutes,
  ...recipeRoutes,
  ...mealShareRoutes,
  ...analyzeRoutes,
  ...uploadRoutes,
  ...voiceRoutes,
  ...assistantRoutes,
  ...groupRoutes,
  ...notificationRoutes,
  ...integrationRoutes,
];

export const handleApiRequest = createRouter(apiRoutes);
