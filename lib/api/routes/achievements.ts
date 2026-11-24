import { achievementsView } from "../../achievements/view.ts";
import type { RouteDefinition } from "../router.ts";

export const achievementRoutes: RouteDefinition[] = [
  {
    handler: ({ user }) => achievementsView(user.id),
    method: "GET",
    path: "/me/achievements",
  },
];
