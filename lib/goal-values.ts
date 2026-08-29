export const CALORIE_GOAL_KIND = "calories_per_day" as const;
export const CALORIE_GOAL_MIN = 500;
export const CALORIE_GOAL_MAX = 10000;

export type CalorieGoalKind = typeof CALORIE_GOAL_KIND;

export class GoalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalError";
  }
}

export type GoalsView = {
  caloriesPerDay: number | null;
};

export type CalorieGoalWrite = { op: "clear" } | { op: "set"; value: number };

export function resolveCalorieGoalWrite(value: unknown): CalorieGoalWrite {
  if (value === null || value === undefined || value === "") {
    return { op: "clear" };
  }
  const kcal = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isInteger(kcal) || kcal < CALORIE_GOAL_MIN || kcal > CALORIE_GOAL_MAX) {
    throw new GoalError(`Daily calories must be a whole number from ${CALORIE_GOAL_MIN} to ${CALORIE_GOAL_MAX}.`);
  }
  return { op: "set", value: kcal };
}

export function toGoalsView(rows: ReadonlyArray<{ kind: string; value: number }>): GoalsView {
  const calories = rows.find((row) => row.kind === CALORIE_GOAL_KIND);
  return { caloriesPerDay: calories?.value ?? null };
}

export function planGoalMerge(
  survivorKinds: ReadonlySet<string>,
  absorbed: ReadonlyArray<{ id: string; kind: string }>,
): { deleteIds: string[]; moveIds: string[] } {
  const deleteIds: string[] = [];
  const moveIds: string[] = [];
  for (const row of absorbed) {
    if (survivorKinds.has(row.kind)) {
      deleteIds.push(row.id);
    } else {
      moveIds.push(row.id);
    }
  }
  return { deleteIds, moveIds };
}
