import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4Message,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import type { LanguageModelMiddleware } from "ai";
import {
  TOOL_INTENTS_CONTEXT_PREFIX,
  formatIntentPlanContext,
  formatToolCategoriesContext,
  parseToolCategoriesContext,
  remainingWriteAllowlist,
  remainingWriteCategories,
  requiredWriteStepCap,
  type ToolCategory,
  type ToolIntent,
} from "./tool-categories.ts";

export type ClassifyToolPlan = {
  categories: readonly ToolCategory[];
  intents?: readonly ToolIntent[];
};

export type ClassifyToolCategories = (input: {
  text: string;
}) => Promise<readonly ToolCategory[] | ClassifyToolPlan>;

export function promptText(prompt: LanguageModelV4Prompt): string {
  const parts: string[] = [];
  for (const message of prompt) {
    if (message.role === "system") {
      parts.push(message.content);
      continue;
    }
    for (const part of message.content) {
      if ("text" in part && typeof part.text === "string") {
        parts.push(part.text);
      }
    }
  }
  return parts.join("\n");
}

export function lastUserMessage(prompt: LanguageModelV4Prompt): LanguageModelV4Message | undefined {
  for (let index = prompt.length - 1; index >= 0; index -= 1) {
    const message = prompt[index];
    if (message?.role === "user") {
      return message;
    }
  }
  return undefined;
}

export function lastUserText(prompt: LanguageModelV4Prompt): string {
  const message = lastUserMessage(prompt);
  if (message === undefined || message.role !== "user") {
    return "";
  }
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function lastUserHasMedia(prompt: LanguageModelV4Prompt): boolean {
  const message = lastUserMessage(prompt);
  if (message === undefined || message.role !== "user") {
    return false;
  }
  return message.content.some((part) => part.type === "file");
}

export function lastUserIndex(prompt: LanguageModelV4Prompt): number {
  for (let index = prompt.length - 1; index >= 0; index -= 1) {
    if (prompt[index]?.role === "user") {
      return index;
    }
  }
  return -1;
}

export function toolNamesAfterLastUser(prompt: LanguageModelV4Prompt): string[] {
  const start = lastUserIndex(prompt);
  if (start < 0) {
    return [];
  }
  const names: string[] = [];
  for (const message of prompt.slice(start + 1)) {
    if (message.role === "system") {
      continue;
    }
    for (const part of message.content) {
      if (part.type === "tool-call" || part.type === "tool-result") {
        names.push(part.toolName);
      }
    }
  }
  return names;
}

export function toolCallRoundsAfterLastUser(prompt: LanguageModelV4Prompt): number {
  const start = lastUserIndex(prompt);
  if (start < 0) {
    return 0;
  }
  let rounds = 0;
  for (const message of prompt.slice(start + 1)) {
    if (message.role !== "assistant") {
      continue;
    }
    if (message.content.some((part) => part.type === "tool-call")) {
      rounds += 1;
    }
  }
  return rounds;
}

export function toolNamesFromModelContent(content: readonly LanguageModelV4Content[]): string[] {
  return content.filter((part) => part.type === "tool-call").map((part) => part.toolName);
}

export function toolNamesFromStreamParts(parts: readonly LanguageModelV4StreamPart[]): string[] {
  return parts.filter((part) => part.type === "tool-call").map((part) => part.toolName);
}

export function paramsHaveCallableTools(params: LanguageModelV4CallOptions): boolean {
  return params.tools?.some((tool) => tool.type === "function") === true;
}

export function categoriesFromPrompt(prompt: LanguageModelV4Prompt): ToolCategory[] | null {
  return parseToolCategoriesContext(promptText(prompt));
}

export function prependSystemLine(prompt: LanguageModelV4Prompt, line: string): LanguageModelV4Prompt {
  const first = prompt[0];
  if (first?.role === "system") {
    return [{ ...first, content: `${line}\n${first.content}` }, ...prompt.slice(1)];
  }
  return [{ content: line, role: "system" }, ...prompt];
}

export function injectToolCategoriesContext(
  prompt: LanguageModelV4Prompt,
  categories: readonly ToolCategory[],
  intents: readonly ToolIntent[] = [],
): LanguageModelV4Prompt {
  let next = prompt;
  if (categoriesFromPrompt(prompt) === null) {
    next = prependSystemLine(next, formatToolCategoriesContext(categories));
  }
  const plan = formatIntentPlanContext(intents);
  if (plan !== null && !promptText(next).includes(TOOL_INTENTS_CONTEXT_PREFIX)) {
    next = prependSystemLine(next, plan);
  }
  return next;
}

export function writeToolPolicy(input: {
  categories: readonly ToolCategory[];
  params: LanguageModelV4CallOptions;
}): {
  remainingAllowlist: string[];
  shouldRequire: boolean;
} {
  const remainingAllowlist = remainingWriteAllowlist({
    categories: input.categories,
    toolNames: toolNamesAfterLastUser(input.params.prompt),
  });
  const remaining = remainingWriteCategories({
    categories: input.categories,
    toolNames: toolNamesAfterLastUser(input.params.prompt),
  });
  const shouldRequire =
    remainingAllowlist.length > 0 &&
    paramsHaveCallableTools(input.params) &&
    toolCallRoundsAfterLastUser(input.params.prompt) < requiredWriteStepCap(input.categories) &&
    remaining.length > 0;
  return { remainingAllowlist, shouldRequire };
}

export function shouldRetryRequiredTools(input: {
  remainingAllowlist: readonly string[];
  shouldRequire: boolean;
  toolNames: readonly string[];
}): boolean {
  if (!input.shouldRequire || input.remainingAllowlist.length === 0) {
    return false;
  }
  return !input.toolNames.some((name) => input.remainingAllowlist.includes(name));
}

export function createRequireWriteToolsMiddleware(options?: {
  classify?: ClassifyToolCategories;
}): LanguageModelMiddleware {
  const classify = options?.classify;
  const classified = new Map<string, ClassifyToolPlan>();
  return {
    specificationVersion: "v4",
    async transformParams({ params }) {
      const resolved = await resolveCategories(params.prompt, classify, classified);
      const prompt = injectToolCategoriesContext(params.prompt, resolved.categories, resolved.intents);
      const policy = writeToolPolicy({ categories: resolved.categories, params: { ...params, prompt } });
      if (!policy.shouldRequire) {
        return { ...params, prompt };
      }
      return { ...params, prompt, toolChoice: { type: "required" } };
    },
    async wrapGenerate({ doGenerate, params, model }) {
      const result = await doGenerate();
      const policy = policyFromParams(params);
      if (
        !shouldRetryRequiredTools({
          remainingAllowlist: policy.remainingAllowlist,
          shouldRequire: policy.shouldRequire,
          toolNames: toolNamesFromModelContent(result.content),
        })
      ) {
        return result;
      }
      return model.doGenerate({ ...params, toolChoice: { type: "required" } });
    },
    async wrapStream({ doStream, params, model }) {
      const policy = policyFromParams(params);
      if (!policy.shouldRequire) {
        return doStream();
      }
      const first = await doStream();
      const parts = await collectStreamParts(first.stream);
      if (
        !shouldRetryRequiredTools({
          remainingAllowlist: policy.remainingAllowlist,
          shouldRequire: policy.shouldRequire,
          toolNames: toolNamesFromStreamParts(parts),
        })
      ) {
        return replayStreamResult(first, parts);
      }
      return model.doStream({ ...params, toolChoice: { type: "required" } });
    },
  };
}

export const requireWriteToolsMiddleware = createRequireWriteToolsMiddleware();

function policyFromParams(params: LanguageModelV4CallOptions) {
  const categories = categoriesFromPrompt(params.prompt) ?? ["none"];
  return writeToolPolicy({ categories, params });
}

function asClassifyPlan(value: readonly ToolCategory[] | ClassifyToolPlan): ClassifyToolPlan {
  if ("categories" in value) {
    return value;
  }
  return { categories: value };
}

async function resolveCategories(
  prompt: LanguageModelV4Prompt,
  classify: ClassifyToolCategories | undefined,
  classified: Map<string, ClassifyToolPlan>,
): Promise<ClassifyToolPlan> {
  const tagged = categoriesFromPrompt(prompt);
  if (tagged !== null) {
    return { categories: tagged };
  }
  const key = lastUserText(prompt);
  const cached = classified.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let next: ClassifyToolPlan;
  if (classify === undefined) {
    next = { categories: ["none"] };
  } else {
    try {
      next = asClassifyPlan(await classify({ text: lastUserText(prompt) }));
    } catch {
      next = { categories: ["none"] };
    }
  }
  if (classified.size >= 64) {
    const oldest = classified.keys().next().value;
    if (oldest !== undefined) {
      classified.delete(oldest);
    }
  }
  classified.set(key, next);
  return next;
}

async function collectStreamParts(
  stream: ReadableStream<LanguageModelV4StreamPart>,
): Promise<LanguageModelV4StreamPart[]> {
  const parts: LanguageModelV4StreamPart[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return parts;
}

function replayStreamResult(
  first: LanguageModelV4StreamResult,
  parts: readonly LanguageModelV4StreamPart[],
): LanguageModelV4StreamResult {
  return {
    ...first,
    stream: new ReadableStream({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(part);
        }
        controller.close();
      },
    }),
  };
}
