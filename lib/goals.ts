import { GoalKind } from "../generated/prisma/client";
import {
  CALORIE_GOAL_KIND,
  resolveCalorieGoalWrite,
  toGoalsView,
  type GoalsView,
} from "./goal-values.ts";
import { prisma } from "./prisma.ts";

export {
  CALORIE_GOAL_KIND,
  CALORIE_GOAL_MAX,
  CALORIE_GOAL_MIN,
  GoalError,
  planGoalMerge,
  resolveCalorieGoalWrite,
  toGoalsView,
} from "./goal-values.ts";
export type { CalorieGoalWrite, GoalsView } from "./goal-values.ts";

export async function getGoals(userId: string): Promise<GoalsView> {
  const rows = await prisma.userGoal.findMany({
    where: { userId },
    select: { kind: true, value: true },
  });
  return toGoalsView(rows);
}

export async function saveCalorieGoal(userId: string, value: unknown): Promise<GoalsView> {
  const write = resolveCalorieGoalWrite(value);
  if (write.op === "clear") {
    await prisma.userGoal.deleteMany({
      where: { userId, kind: CALORIE_GOAL_KIND },
    });
    return getGoals(userId);
  }
  await prisma.userGoal.upsert({
    where: { userId_kind: { userId, kind: CALORIE_GOAL_KIND } },
    create: { userId, kind: GoalKind.calories_per_day, value: write.value },
    update: { value: write.value },
  });
  return getGoals(userId);
}
