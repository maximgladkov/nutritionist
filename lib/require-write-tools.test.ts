import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import {
  createRequireWriteToolsMiddleware,
  injectToolCategoriesContext,
  lastUserHasMedia,
  shouldRetryRequiredTools,
  toolNamesAfterLastUser,
  writeToolPolicy,
} from "./require-write-tools.ts";
import { formatToolCategoriesContext } from "./tool-categories.ts";

const usage = {
  inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: undefined, total: 10 },
  outputTokens: { reasoning: undefined, text: 4, total: 4 },
};

const finishStop = { raw: "stop", unified: "stop" as const };

function generateResult(text: string, toolName?: string): LanguageModelV4GenerateResult {
  return {
    content:
      toolName === undefined
        ? [{ text, type: "text" }]
        : [
            { text, type: "text" },
            { input: "{}", toolCallId: "call_1", toolName, type: "tool-call" },
          ],
    finishReason: toolName === undefined ? finishStop : { raw: "tool-calls", unified: "tool-calls" },
    usage,
  };
}

const tools: LanguageModelV4CallOptions["tools"] = [
  {
    description: "Log a meal",
    inputSchema: { type: "object" },
    name: "log_meal",
    type: "function",
  },
  {
    description: "Save goals",
    inputSchema: { type: "object" },
    name: "save_my_goals",
    type: "function",
  },
];

function userPrompt(text: string, withFile = false): LanguageModelV4Prompt {
  return [
    {
      content: withFile
        ? [
            { text, type: "text" as const },
            {
              data: { data: "abc", type: "data" as const },
              mediaType: "image/jpeg",
              type: "file" as const,
            },
          ]
        : [{ text, type: "text" as const }],
      role: "user",
    },
  ];
}

function taggedPrompt(categories: readonly string[], text = "Photo"): LanguageModelV4Prompt {
  return [
    { content: formatToolCategoriesContext(categories as never), role: "system" },
    ...userPrompt(text),
  ];
}

function params(prompt: LanguageModelV4Prompt): LanguageModelV4CallOptions {
  return { prompt, tools };
}

describe("writeToolPolicy", () => {
  it("requires a tool for a meal-tagged text turn with no tool results", () => {
    const policy = writeToolPolicy({
      categories: ["meal"],
      params: params(taggedPrompt(["meal"], "запиши молоко")),
    });
    assert.equal(policy.shouldRequire, true);
    assert.equal(policy.remainingAllowlist.includes("lookup_product"), true);
    assert.equal(policy.remainingAllowlist.includes("log_meal"), true);
    assert.equal(policy.remainingAllowlist.includes("copy_meal"), true);
    assert.equal(policy.remainingAllowlist.includes("ask_question"), true);
  });

  it("does not require tools for none", () => {
    const policy = writeToolPolicy({
      categories: ["none"],
      params: params(taggedPrompt(["none"], "how am I doing?")),
    });
    assert.equal(policy.shouldRequire, false);
    assert.deepEqual(policy.remainingAllowlist, []);
  });

  it("keeps required after only a meal tool when goals remain", () => {
    const prompt: LanguageModelV4Prompt = [
      { content: formatToolCategoriesContext(["meal", "goals"]), role: "system" },
      { content: [{ text: "log milk and set protein to 150", type: "text" }], role: "user" },
      {
        content: [{ input: "{}", toolCallId: "c1", toolName: "log_meal", type: "tool-call" }],
        role: "assistant",
      },
      {
        content: [
          {
            output: { type: "text", value: "ok" },
            toolCallId: "c1",
            toolName: "log_meal",
            type: "tool-result",
          },
        ],
        role: "tool",
      },
    ];
    const policy = writeToolPolicy({ categories: ["meal", "goals"], params: params(prompt) });
    assert.equal(policy.shouldRequire, true);
    assert.deepEqual(policy.remainingAllowlist, ["save_my_goals", "get_my_goals", "ask_question"]);
  });

  it("does not keep required for summary after a meal tool", () => {
    const prompt: LanguageModelV4Prompt = [
      { content: formatToolCategoriesContext(["meal", "summary"]), role: "system" },
      { content: [{ text: "log this and how am I doing?", type: "text" }], role: "user" },
      {
        content: [{ input: "{}", toolCallId: "c1", toolName: "log_meal", type: "tool-call" }],
        role: "assistant",
      },
    ];
    const policy = writeToolPolicy({ categories: ["meal", "summary"], params: params(prompt) });
    assert.equal(policy.shouldRequire, false);
  });
});

describe("shouldRetryRequiredTools", () => {
  it("retries a meal-tagged stop with no tools", () => {
    assert.equal(
      shouldRetryRequiredTools({
        remainingAllowlist: ["log_meal", "lookup_product"],
        shouldRequire: true,
        toolNames: [],
      }),
      true,
    );
  });

  it("does not retry when log_meal was requested", () => {
    assert.equal(
      shouldRetryRequiredTools({
        remainingAllowlist: ["log_meal", "lookup_product"],
        shouldRequire: true,
        toolNames: ["log_meal"],
      }),
      false,
    );
  });

  it("does not retry when ask_question was requested", () => {
    assert.equal(
      shouldRetryRequiredTools({
        remainingAllowlist: ["log_meal", "ask_question"],
        shouldRequire: true,
        toolNames: ["ask_question"],
      }),
      false,
    );
  });

  it("retries when the only tool is outside the allowlist", () => {
    assert.equal(
      shouldRetryRequiredTools({
        remainingAllowlist: ["log_meal"],
        shouldRequire: true,
        toolNames: ["bash"],
      }),
      true,
    );
  });
});

describe("prompt helpers", () => {
  it("detects a file part on the latest user message", () => {
    assert.equal(lastUserHasMedia(userPrompt("yogurt", true)), true);
    assert.equal(lastUserHasMedia(userPrompt("hi")), false);
  });

  it("reads tool names after the latest user message", () => {
    const prompt: LanguageModelV4Prompt = [
      { content: [{ text: "log milk", type: "text" }], role: "user" },
      {
        content: [{ input: "{}", toolCallId: "c1", toolName: "lookup_product", type: "tool-call" }],
        role: "assistant",
      },
    ];
    assert.deepEqual(toolNamesAfterLastUser(prompt), ["lookup_product"]);
  });

  it("injects an owned context line when missing", () => {
    const next = injectToolCategoriesContext(userPrompt("hi"), ["meal"]);
    assert.equal(next[0]?.role, "system");
    assert.match(String(next[0] && "content" in next[0] ? next[0].content : ""), /BTR_TOOL_CATEGORIES meal/);
  });

  it("injects an intent checklist when provided", () => {
    const next = injectToolCategoriesContext(userPrompt("hi"), ["meal"], [
      { category: "meal", text: "log milk" },
    ]);
    assert.match(String(next[0] && "content" in next[0] ? next[0].content : ""), /BTR_INTENTS/);
    assert.match(String(next[0] && "content" in next[0] ? next[0].content : ""), /\[meal\] log milk/);
  });
});

describe("createRequireWriteToolsMiddleware", () => {
  it("retries generate when a meal-tagged step stops without tools", async () => {
    const middleware = createRequireWriteToolsMiddleware();
    const calls: string[] = [];
    const model = {
      doGenerate: async () => {
        calls.push("retry");
        return generateResult("calling", "log_meal");
      },
    } as Pick<LanguageModelV4, "doGenerate">;
    const tagged = params(taggedPrompt(["meal"]));
    const transformed = await middleware.transformParams?.({
      model: model as LanguageModelV4,
      params: tagged,
      type: "generate",
    });
    assert.equal(transformed?.toolChoice?.type, "required");
    const result = await middleware.wrapGenerate?.({
      doGenerate: async () => {
        calls.push("first");
        return generateResult("yogurt macros");
      },
      doStream: async () => {
        throw new Error("unused");
      },
      model: model as LanguageModelV4,
      params: transformed ?? tagged,
    });
    assert.deepEqual(calls, ["first", "retry"]);
    assert.equal(result?.content.some((part) => part.type === "tool-call"), true);
  });

  it("does not require tools when the context is none", async () => {
    const middleware = createRequireWriteToolsMiddleware();
    const transformed = await middleware.transformParams?.({
      model: {} as LanguageModelV4,
      params: params(taggedPrompt(["none"], "hello")),
      type: "generate",
    });
    assert.notEqual(transformed?.toolChoice?.type, "required");
  });

  it("classifies an untagged image turn instead of assuming meal", async () => {
    const classified: string[] = [];
    const middleware = createRequireWriteToolsMiddleware({
      classify: async ({ text }) => {
        classified.push(text);
        return ["none"];
      },
    });
    const transformed = await middleware.transformParams?.({
      model: {} as LanguageModelV4,
      params: params(userPrompt("how much protein is in this", true)),
      type: "generate",
    });
    assert.deepEqual(classified, ["how much protein is in this"]);
    assert.notEqual(transformed?.toolChoice?.type, "required");
  });

  it("classifies an untagged text turn once", async () => {
    const classified: string[] = [];
    const middleware = createRequireWriteToolsMiddleware({
      classify: async ({ text }) => {
        classified.push(text);
        return ["meal"];
      },
    });
    const first = params(userPrompt("запиши молоко"));
    const transformed = await middleware.transformParams?.({
      model: {} as LanguageModelV4,
      params: first,
      type: "generate",
    });
    await middleware.transformParams?.({
      model: {} as LanguageModelV4,
      params: first,
      type: "generate",
    });
    assert.deepEqual(classified, ["запиши молоко"]);
    assert.equal(transformed?.toolChoice?.type, "required");
  });

  it("replays a stream that already called an allowlisted tool", async () => {
    const middleware = createRequireWriteToolsMiddleware();
    const parts: LanguageModelV4StreamPart[] = [
      {
        input: "{}",
        toolCallId: "call_1",
        toolName: "log_meal",
        type: "tool-call",
      },
      { finishReason: { raw: "tool-calls", unified: "tool-calls" }, type: "finish", usage },
    ];
    const tagged = await middleware.transformParams?.({
      model: {} as LanguageModelV4,
      params: params(taggedPrompt(["meal"])),
      type: "stream",
    });
    const result = await middleware.wrapStream?.({
      doGenerate: async () => {
        throw new Error("unused");
      },
      doStream: async () => ({ stream: readableOf(parts) }),
      model: {} as LanguageModelV4,
      params: tagged ?? params(taggedPrompt(["meal"])),
    });
    assert.ok(result);
    const collected: LanguageModelV4StreamPart[] = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      collected.push(value);
    }
    assert.deepEqual(collected, parts);
  });

  it("does not buffer a stream when tools are not required", async () => {
    const middleware = createRequireWriteToolsMiddleware();
    const parts: LanguageModelV4StreamPart[] = [
      { text: "Hello!", type: "text" },
      { finishReason: finishStop, type: "finish", usage },
    ];
    const original = readableOf(parts);
    const tagged = await middleware.transformParams?.({
      model: {} as LanguageModelV4,
      params: params(taggedPrompt(["none"], "hello")),
      type: "stream",
    });
    const result = await middleware.wrapStream?.({
      doGenerate: async () => {
        throw new Error("unused");
      },
      doStream: async () => ({ stream: original }),
      model: {} as LanguageModelV4,
      params: tagged ?? params(taggedPrompt(["none"], "hello")),
    });
    assert.equal(result?.stream, original);
  });
});

function readableOf(parts: readonly LanguageModelV4StreamPart[]): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
}
