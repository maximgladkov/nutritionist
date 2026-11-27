import { achievementsView } from "../../achievements/view.ts";
import type { RouteDefinition } from "../router.ts";

export const achievementRoutes: RouteDefinition[] = [
  {
    handler: async ({ locale, user }) => achievementsView(user.id, await locale()),
    method: "GET",
    path: "/me/achievements",
  },
];
