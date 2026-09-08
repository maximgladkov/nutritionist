import { z } from "zod";

export const TOOL_CATEGORY_VALUES = [
  "none",
  "meal",
  "meal_delete",
  "goals",
  "profile",
  "reminders",
  "summary",
  "memory",
] as const;

export type ToolCategory = (typeof TOOL_CATEGORY_VALUES)[number];

export const WRITE_TOOL_CATEGORIES = [
  "meal",
  "meal_delete",
  "goals",
  "profile",
  "reminders",
  "memory",
] as const;

export type WriteToolCategory = (typeof WRITE_TOOL_CATEGORIES)[number];

export const ASK_QUESTION_TOOL = "ask_question";

export type ToolIntent = {
  category: ToolCategory;
  text: string;
};

export const TOOL_CATEGORY_TOOLS: Record<ToolCategory, readonly string[]> = {
  none: [],
  meal: ["lookup_product", "search_products", "save_product", "log_meal", "add_meal_items"],
  meal_delete: ["delete_meal_item"],
  goals: ["save_my_goals", "get_my_goals"],
  profile: ["save_my_profile", "get_my_profile"],
  reminders: ["save_my_reminders", "get_my_reminders"],
  summary: ["get_nutrition_summary", "list_meals"],
  memory: ["profile__save_memory", "profile__remove_memory"],
};

export const TOOL_CATEGORIES_CONTEXT_PREFIX = "BTR_TOOL_CATEGORIES";

export const TOOL_INTENTS_CONTEXT_PREFIX = "BTR_INTENTS";

export const WRITE_TOOL_REQUIRED_STEP_SLACK = 2;

export const toolCategorySchema = z.enum(TOOL_CATEGORY_VALUES);

export const toolIntentSchema = z.object({
  category: toolCategorySchema,
  text: z.string().min(1),
});

export const toolCategoriesPreludeSchema = z.object({
  ack: z.string().min(1),
  intents: z.array(toolIntentSchema).min(1),
});

const TOOL_CATEGORIES_CONTEXT_PATTERN = new RegExp(
  `${TOOL_CATEGORIES_CONTEXT_PREFIX}\\s+([a-z_,]+)`,
  "u",
);

export function isToolCategory(value: string): value is ToolCategory {
  return (TOOL_CATEGORY_VALUES as readonly string[]).includes(value);
}

export function isWriteToolCategory(value: string): value is WriteToolCategory {
  return (WRITE_TOOL_CATEGORIES as readonly string[]).includes(value);
}

export function normalizeToolCategories(input: {
  categories: readonly string[];
}): ToolCategory[] {
  const seen = new Set<ToolCategory>();
  for (const value of input.categories) {
    if (isToolCategory(value)) {
      seen.add(value);
    }
  }
  const withoutNone = [...seen].filter((category) => category !== "none");
  return withoutNone.length > 0 ? withoutNone : ["none"];
}

export function normalizeIntents(input: {
  intents: readonly { category: string; text: string }[];
}): ToolIntent[] {
  const intents: ToolIntent[] = [];
  for (const intent of input.intents) {
    const text = intent.text.trim();
    if (!isToolCategory(intent.category) || text.length === 0) {
      continue;
    }
    intents.push({ category: intent.category, text });
  }
  const categories = normalizeToolCategories({
    categories: intents.map((intent) => intent.category),
  });
  const keepNone = categories.length === 1 && categories[0] === "none";
  const next = intents.filter((intent) =>
    keepNone ? intent.category === "none" : intent.category !== "none" && categories.includes(intent.category),
  );
  if (next.length === 0) {
    return keepNone ? [{ category: "none", text: "respond" }] : categories.map((category) => ({ category, text: category }));
  }
  return next;
}

export function writeToolCategories(categories: readonly ToolCategory[]): WriteToolCategory[] {
  return categories.filter(isWriteToolCategory);
}

export function toolsForCategories(categories: readonly ToolCategory[]): string[] {
  const names = new Set<string>();
  for (const category of categories) {
    for (const name of TOOL_CATEGORY_TOOLS[category]) {
      names.add(name);
    }
  }
  return [...names];
}

export function writeAllowlistForCategories(categories: readonly ToolCategory[]): string[] {
  return toolsForCategories(writeToolCategories(categories));
}

export function formatToolCategoriesContext(categories: readonly ToolCategory[]): string {
  return `${TOOL_CATEGORIES_CONTEXT_PREFIX} ${normalizeToolCategories({ categories }).join(",")}`;
}

export function formatIntentPlanContext(intents: readonly ToolIntent[]): string | null {
  if (intents.length === 0) {
    return null;
  }
  const lines = intents.map((intent, index) => `${String(index + 1)}. [${intent.category}] ${intent.text}`);
  return `${TOOL_INTENTS_CONTEXT_PREFIX}\n${lines.join("\n")}`;
}

export function parseToolCategoriesContext(text: string): ToolCategory[] | null {
  const match = TOOL_CATEGORIES_CONTEXT_PATTERN.exec(text);
  if (match?.[1] === undefined) {
    return null;
  }
  return normalizeToolCategories({ categories: match[1].split(",") });
}

export function categoryForTool(toolName: string): WriteToolCategory | null {
  for (const category of WRITE_TOOL_CATEGORIES) {
    if (TOOL_CATEGORY_TOOLS[category].includes(toolName)) {
      return category;
    }
  }
  return null;
}

export function remainingWriteCategories(input: {
  categories: readonly ToolCategory[];
  toolNames: readonly string[];
}): WriteToolCategory[] {
  if (input.toolNames.includes(ASK_QUESTION_TOOL)) {
    return [];
  }
  const seen = new Set<WriteToolCategory>();
  for (const name of input.toolNames) {
    const category = categoryForTool(name);
    if (category !== null) {
      seen.add(category);
    }
  }
  return writeToolCategories(input.categories).filter((category) => !seen.has(category));
}

export function remainingWriteAllowlist(input: {
  categories: readonly ToolCategory[];
  toolNames: readonly string[];
}): string[] {
  const remaining = remainingWriteCategories(input);
  if (remaining.length === 0) {
    return [];
  }
  return [...toolsForCategories(remaining), ASK_QUESTION_TOOL];
}

export function requiredWriteStepCap(categories: readonly ToolCategory[]): number {
  return writeToolCategories(categories).length + WRITE_TOOL_REQUIRED_STEP_SLACK;
}
