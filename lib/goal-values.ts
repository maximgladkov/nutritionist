export const GOAL_FIELDS = [
  "caloriesPerDay",
  "proteinGPerDay",
  "carbsGPerDay",
  "fatGPerDay",
  "fiberGPerDay",
] as const;

export type GoalField = (typeof GOAL_FIELDS)[number];

export const GOAL_KINDS = {
  caloriesPerDay: "calories_per_day",
  proteinGPerDay: "protein_g_per_day",
  carbsGPerDay: "carbs_g_per_day",
  fatGPerDay: "fat_g_per_day",
  fiberGPerDay: "fiber_g_per_day",
} as const;

export type GoalKindValue = (typeof GOAL_KINDS)[GoalField];

export const CALORIE_GOAL_KIND = GOAL_KINDS.caloriesPerDay;
export const CALORIE_GOAL_MIN = 500;
export const CALORIE_GOAL_MAX = 10000;

export const GOAL_SPECS: Record<
  GoalField,
  { kind: GoalKindValue; label: string; max: number; min: number; step: number; unit: "g" | "kcal" }
> = {
  caloriesPerDay: {
    kind: GOAL_KINDS.caloriesPerDay,
    label: "Calories",
    max: CALORIE_GOAL_MAX,
    min: CALORIE_GOAL_MIN,
    step: 100,
    unit: "kcal",
  },
  proteinGPerDay: {
    kind: GOAL_KINDS.proteinGPerDay,
    label: "Protein",
    max: 400,
    min: 0,
    step: 5,
    unit: "g",
  },
  carbsGPerDay: {
    kind: GOAL_KINDS.carbsGPerDay,
    label: "Carbs",
    max: 800,
    min: 0,
    step: 5,
    unit: "g",
  },
  fatGPerDay: {
    kind: GOAL_KINDS.fatGPerDay,
    label: "Fat",
    max: 300,
    min: 0,
    step: 5,
    unit: "g",
  },
  fiberGPerDay: {
    kind: GOAL_KINDS.fiberGPerDay,
    label: "Fiber",
    max: 150,
    min: 1,
    step: 1,
    unit: "g",
  },
};

export type CalorieGoalKind = typeof CALORIE_GOAL_KIND;

export class GoalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalError";
  }
}

export type GoalsView = Record<GoalField, number | null>;

export type GoalsPatch = Partial<Record<GoalField, number | null>>;

export type GoalWrite = { op: "clear" } | { op: "set"; value: number };

export type CalorieGoalWrite = GoalWrite;

export type GoalRingId = "calories" | "carbs" | "fat" | "fiber" | "protein";

export type GoalRing = {
  consumed: number;
  fill: string;
  goal: number;
  id: GoalRingId;
  name: string;
  unit: "g" | "kcal";
  value: number;
};

const RING_ORDER: readonly GoalRingId[] = ["fiber", "fat", "carbs", "protein", "calories"];

const RING_META: Record<
  GoalRingId,
  { field: GoalField; fill: string; nutrient: "carbohydrates" | "energyKcal" | "fat" | "fiber" | "proteins" }
> = {
  calories: { field: "caloriesPerDay", fill: "var(--goal-calories)", nutrient: "energyKcal" },
  carbs: { field: "carbsGPerDay", fill: "var(--goal-carbs)", nutrient: "carbohydrates" },
  fat: { field: "fatGPerDay", fill: "var(--goal-fat)", nutrient: "fat" },
  fiber: { field: "fiberGPerDay", fill: "var(--goal-fiber)", nutrient: "fiber" },
  protein: { field: "proteinGPerDay", fill: "var(--goal-protein)", nutrient: "proteins" },
};

export function emptyGoalsView(): GoalsView {
  return {
    caloriesPerDay: null,
    carbsGPerDay: null,
    fatGPerDay: null,
    fiberGPerDay: null,
    proteinGPerDay: null,
  };
}

export function hasAnyGoal(goals: GoalsView): boolean {
  return GOAL_FIELDS.some((field) => goals[field] !== null);
}

export function resolveGoalWrite(field: GoalField, value: unknown): GoalWrite {
  if (value === null || value === undefined || value === "") {
    return { op: "clear" };
  }
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  const spec = GOAL_SPECS[field];
  if (!Number.isInteger(amount) || amount < spec.min || amount > spec.max) {
    const unit = spec.unit === "kcal" ? "kcal" : "grams";
    throw new GoalError(`Daily ${spec.label.toLowerCase()} must be a whole number from ${spec.min} to ${spec.max} ${unit}.`);
  }
  return { op: "set", value: amount };
}

export function resolveCalorieGoalWrite(value: unknown): CalorieGoalWrite {
  return resolveGoalWrite("caloriesPerDay", value);
}

export function resolveGoalsPatch(patch: GoalsPatch): Array<{ field: GoalField; write: GoalWrite }> {
  const writes: Array<{ field: GoalField; write: GoalWrite }> = [];
  for (const field of GOAL_FIELDS) {
    if (!Object.hasOwn(patch, field) || patch[field] === undefined) {
      continue;
    }
    writes.push({ field, write: resolveGoalWrite(field, patch[field]) });
  }
  return writes;
}

export function toGoalsView(rows: ReadonlyArray<{ kind: string; value: number }>): GoalsView {
  const goals = emptyGoalsView();
  for (const field of GOAL_FIELDS) {
    const row = rows.find((item) => item.kind === GOAL_KINDS[field]);
    if (row) {
      goals[field] = row.value;
    }
  }
  return goals;
}

export function goalRingsForToday(
  goals: GoalsView,
  totals: Readonly<Record<(typeof RING_META)[GoalRingId]["nutrient"], number | null>>,
): GoalRing[] {
  const rings: GoalRing[] = [];
  for (const id of RING_ORDER) {
    const meta = RING_META[id];
    const spec = GOAL_SPECS[meta.field];
    const goal = goals[meta.field];
    if (goal === null) {
      continue;
    }
    const consumed = Math.round(totals[meta.nutrient] ?? 0);
    rings.push({
      consumed,
      fill: meta.fill,
      goal,
      id,
      name: spec.label,
      unit: spec.unit,
      value: Math.min(100, Math.round((consumed / goal) * 100)),
    });
  }
  return rings;
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
