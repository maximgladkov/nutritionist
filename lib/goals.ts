import { GoalKind } from "../generated/prisma/client";
import {
  GOAL_KINDS,
  resolveCalorieGoalWrite,
  resolveGoalsPatch,
  toGoalsView,
  type GoalsPatch,
  type GoalsView,
} from "./goal-values.ts";
import { prisma } from "./prisma.ts";

export {
  CALORIE_GOAL_KIND,
  CALORIE_GOAL_MAX,
  CALORIE_GOAL_MIN,
  GOAL_FIELDS,
  GOAL_KINDS,
  GOAL_SPECS,
  GoalError,
  emptyGoalsView,
  goalRingsForToday,
  hasAnyGoal,
  planGoalMerge,
  resolveCalorieGoalWrite,
  resolveGoalWrite,
  resolveGoalsPatch,
  toGoalsView,
} from "./goal-values.ts";
export type {
  CalorieGoalWrite,
  GoalField,
  GoalRing,
  GoalWrite,
  GoalsPatch,
  GoalsView,
} from "./goal-values.ts";

export async function getGoals(userId: string): Promise<GoalsView> {
  const rows = await prisma.userGoal.findMany({
    where: { userId },
    select: { kind: true, value: true },
  });
  return toGoalsView(rows);
}

export async function saveGoals(userId: string, patch: GoalsPatch): Promise<GoalsView> {
  const writes = resolveGoalsPatch(patch);
  if (writes.length === 0) {
    return getGoals(userId);
  }
  await prisma.$transaction(async (tx) => {
    for (const { field, write } of writes) {
      const kind = GOAL_KINDS[field];
      if (write.op === "clear") {
        await tx.userGoal.deleteMany({ where: { userId, kind } });
        continue;
      }
      await tx.userGoal.upsert({
        where: { userId_kind: { userId, kind } },
        create: { userId, kind: kind as GoalKind, value: write.value },
        update: { value: write.value },
      });
    }
  });
  return getGoals(userId);
}

export async function saveCalorieGoal(userId: string, value: unknown): Promise<GoalsView> {
  const write = resolveCalorieGoalWrite(value);
  return saveGoals(userId, { caloriesPerDay: write.op === "clear" ? null : write.value });
}
