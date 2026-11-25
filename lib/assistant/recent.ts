import type { LanguageModelV4Message, LanguageModelV4Prompt } from "@ai-sdk/provider";
import type { LanguageModelMiddleware } from "ai";
import { TOOL_CATEGORIES_CONTEXT_PREFIX, TOOL_INTENTS_CONTEXT_PREFIX } from "../tool-categories.ts";
import { APP_INSTRUCTIONS_HEADING } from "./app-instructions.ts";

// The model reads the recent conversation, not all of it: most questions need nothing older, and
// search_past_chats finds what does. Dropped a few at a time, so in between the request begins the
// same and what was read last time needn't be read again.
export const KEEP_MESSAGES = 6;
const DROP_BY = 6;
// A look-up this old is out of date anyway. Short results stay, and those later words may refer to.
const FRESH_MESSAGES = 2;
const SHORT_RESULT = 600;
const REFERRED_TO = new Set(["save_suggested_recipe", "show_foods", "suggest_meal", "suggest_recipe"]);
export const OLD_RESULT = "[An older result, left out. Call the tool again for current data.]";
const MEMORIES = "# Persistent memories for";
const CLOCK = "Current local time:";
// What the app says about one message, which eve puts before the whole conversation.
const CLIENT_CONTEXT = "Client context:";

type UserMessage = Extract<LanguageModelV4Message, { role: "user" }>;
type ToolMessage = Extract<LanguageModelV4Message, { role: "tool" }>;

function says(message: LanguageModelV4Message, words: string): boolean {
  if (message.role === "system") return message.content.includes(words);
  return message.content.some((part) => part.type === "text" && part.text.includes(words));
}

function isClientContext(message: LanguageModelV4Message): boolean {
  const first = message.role === "user" && message.content.length === 1 ? message.content[0] : undefined;
  return first?.type === "text" && first.text.startsWith(CLIENT_CONTEXT);
}

function userIndexes(prompt: LanguageModelV4Prompt): number[] {
  return prompt.flatMap((message, index) => (message.role === "user" && !says(message, MEMORIES) && !isClientContext(message) ? [index] : []));
}

// System messages, what's remembered about them, and the last few exchanges.
export function keepRecent(prompt: LanguageModelV4Prompt): LanguageModelV4Prompt {
  const users = userIndexes(prompt);
  const drop = Math.floor(Math.max(0, users.length - KEEP_MESSAGES) / DROP_BY) * DROP_BY;
  if (drop === 0) {
    return prompt;
  }
  const from = users[drop]!;
  const older = prompt.slice(0, from);
  const memories = prompt.slice(from).some((message) => says(message, MEMORIES)) ? undefined : older.findLast((message) => message.role !== "system" && says(message, MEMORIES));
  return [...older.filter((message) => message.role === "system"), ...(memories ? [memories] : []), ...prompt.slice(from)];
}

function shorten(message: ToolMessage): ToolMessage {
  return {
    ...message,
    content: message.content.map((part) =>
      part.type === "tool-result" && !REFERRED_TO.has(part.toolName) && JSON.stringify(part.output).length > SHORT_RESULT
        ? { ...part, output: { type: "text", value: OLD_RESULT } }
        : part,
    ),
  };
}

export function shortenOldResults(prompt: LanguageModelV4Prompt): LanguageModelV4Prompt {
  const users = userIndexes(prompt);
  const fresh = users[Math.max(0, users.length - FRESH_MESSAGES)] ?? 0;
  return prompt.map((message, index) => (index < fresh && message.role === "tool" ? shorten(message) : message));
}

// The clock, the day's totals and what's wanted change every time. At the end they leave all that
// comes before them the same.
export function changingPartsLast(prompt: LanguageModelV4Prompt): LanguageModelV4Prompt {
  const moved: string[] = [];
  const said = prompt.filter((message) => {
    if (!isClientContext(message)) return true;
    moved.push(textOf(message));
    return false;
  });
  const kept = said.map((message): LanguageModelV4Message => {
    if (message.role !== "system") return message;
    const lines = message.content.split("\n");
    const rest: string[] = [];
    let intents = false;
    for (const line of lines) {
      // The plan is its heading and the numbered lines under it.
      intents = line.startsWith(TOOL_INTENTS_CONTEXT_PREFIX) || (intents && /^\d+\. \[/u.test(line));
      if (intents || line.startsWith(CLOCK) || line.startsWith(TOOL_CATEGORIES_CONTEXT_PREFIX)) moved.push(line);
      else rest.push(line);
    }
    return { ...message, content: rest.join("\n") };
  });
  const last = kept.findLastIndex((message) => message.role === "user");
  if (moved.length === 0 || last < 0) {
    return prompt;
  }
  const message = kept[last] as UserMessage;
  kept[last] = {
    ...message,
    content: [...message.content, { text: `[App note, not from the user:\n${moved.join("\n")}]`, type: "text" }],
  };
  return kept;
}

function textOf(message: LanguageModelV4Message): string {
  return message.role === "user" ? message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n") : "";
}

export function leaner(prompt: LanguageModelV4Prompt): LanguageModelV4Prompt {
  const inApp = prompt.some((message) => message.role === "system" && message.content.includes(APP_INSTRUCTIONS_HEADING));
  return inApp ? shortenOldResults(keepRecent(changingPartsLast(prompt))) : prompt;
}

// After what's wanted is worked out, so that goes last too.
export const leanMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v4",
  transformParams: async ({ params }) => ({ ...params, prompt: leaner(params.prompt) }),
};
