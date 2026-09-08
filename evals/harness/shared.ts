import type { EveEvalStreamEvent, EveEvalTurn } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import {
  ASK_QUESTION_TOOL,
  TOOL_CATEGORY_TOOLS,
  WRITE_TOOL_CATEGORIES,
  formatToolCategoriesContext,
  type ToolCategory,
} from "../../lib/tool-categories.ts";

export { ASK_QUESTION_TOOL };

export const MEAL_TOOLS = TOOL_CATEGORY_TOOLS.meal;
export const MEAL_DELETE_TOOLS = TOOL_CATEGORY_TOOLS.meal_delete;
export const GOALS_TOOLS = TOOL_CATEGORY_TOOLS.goals;
export const WRITE_TOOLS = WRITE_TOOL_CATEGORIES.flatMap((category) => TOOL_CATEGORY_TOOLS[category]);
export const MEAL_FORCE_TOOLS = [...MEAL_TOOLS, ASK_QUESTION_TOOL];
export const GOALS_FORCE_TOOLS = [...GOALS_TOOLS, ASK_QUESTION_TOOL];
export const MEAL_DELETE_FORCE_TOOLS = [...MEAL_DELETE_TOOLS, ASK_QUESTION_TOOL];

export function toolCategoryContext(categories: readonly ToolCategory[]) {
  return { clientContext: formatToolCategoriesContext(categories) };
}

export const mealContext = toolCategoryContext(["meal"]);
export const mealAndGoalsContext = toolCategoryContext(["meal", "goals"]);
export const mealDeleteContext = toolCategoryContext(["meal_delete"]);
export const noneContext = toolCategoryContext(["none"]);

export function requestedToolNames(turn: Pick<EveEvalTurn, "events" | "toolCalls">): string[] {
  const names = new Set<string>();
  for (const call of turn.toolCalls) {
    names.add(call.name);
  }
  for (const event of turn.events) {
    for (const name of toolNamesFromEvent(event)) {
      names.add(name);
    }
  }
  return [...names];
}

export function calledAnyTool(names: readonly string[], label: string) {
  return satisfies((requested: readonly string[]) => requested.some((name) => names.includes(name)), label);
}

export function calledNoToolsIn(names: readonly string[], label: string) {
  return satisfies((requested: readonly string[]) => !requested.some((name) => names.includes(name)), label);
}

function toolNamesFromEvent(event: EveEvalStreamEvent): string[] {
  if (event.type === "action.input.appended") {
    return event.data.toolName ? [event.data.toolName] : [];
  }
  if (event.type !== "actions.requested") {
    return [];
  }
  return event.data.actions.flatMap((action) => {
    if (action.kind === "tool-call" && typeof action.toolName === "string") {
      return [action.toolName];
    }
    return [];
  });
}
