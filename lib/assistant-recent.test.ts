import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LanguageModelV4Message, LanguageModelV4Prompt } from "@ai-sdk/provider";
import { APP_INSTRUCTIONS } from "./assistant/app-instructions.ts";
import { KEEP_MESSAGES, keepRecent, leaner, OLD_RESULT } from "./assistant/recent.ts";

const user = (text: string): LanguageModelV4Message => ({ content: [{ text, type: "text" }], role: "user" });
const coach = (text: string): LanguageModelV4Message => ({ content: [{ text, type: "text" }], role: "assistant" });
const call = (id: string, toolName: string): LanguageModelV4Message => ({ content: [{ input: {}, toolCallId: id, toolName, type: "tool-call" }], role: "assistant" });
const result = (id: string, toolName: string, value: string): LanguageModelV4Message => ({
  content: [{ output: { type: "text", value }, toolCallId: id, toolName, type: "tool-result" }],
  role: "tool",
});
const system = (extra = ""): LanguageModelV4Message => ({ content: `BTR_TOOL_CATEGORIES none\n${APP_INSTRUCTIONS}\n\nCurrent local time: Wednesday 19:00. Live snapshot: 702 kcal.${extra}`, role: "system" });
const exchanges = (count: number) => Array.from({ length: count }, (_, index) => [user(`q${index}`), coach(`a${index}`)]).flat();
const texts = (prompt: LanguageModelV4Prompt) =>
  prompt.flatMap((message) => (message.role === "system" ? [] : message.content.flatMap((part) => (part.type === "text" ? [part.text] : []))));

describe("what the model reads in the app", () => {
  it("is the recent conversation, beginning the same for a few messages at a time", () => {
    const starts = Array.from({ length: 16 }, (_, index) => texts(keepRecent([system(), ...exchanges(index + 1)]))[0]);
    assert.deepEqual([...new Set(starts)], ["q0", "q6"]);
    for (const count of [5, 11, 17, 40]) {
      const kept = keepRecent([system(), ...exchanges(count)]).filter((message) => message.role === "user").length;
      assert.ok(kept >= Math.min(count, KEEP_MESSAGES) && kept < KEEP_MESSAGES * 2, `${count}: ${kept}`);
    }
  });

  it("never starts in the middle of a look-up, and keeps what's remembered about them", () => {
    const prompt = [system(), user("# Persistent memories for profile\n\n0: vegetarian"), user("old"), call("c", "list_meals"), result("c", "list_meals", "x"), ...exchanges(14)];
    const kept = keepRecent(prompt);
    assert.match(texts(kept)[0]!, /vegetarian/);
    assert.ok(!kept.some((message) => message.role === "tool"));
    assert.equal(kept[0]!.role, "system");
  });

  it("leaves out long old results, but not those later words refer to, or fresh ones", () => {
    const long = "x".repeat(2000);
    const kept = JSON.stringify(
      leaner([
        system(), user("1"), call("a", "list_meals"), result("a", "list_meals", long), call("b", "suggest_meal"), result("b", "suggest_meal", `card-1 ${long}`),
        user("2"), call("d", "get_my_goals"), result("d", "get_my_goals", "short"), user("3"), call("e", "list_meals"), result("e", "list_meals", `fresh ${long}`),
      ]),
    );
    assert.equal(kept.split(OLD_RESULT).length - 1, 1);
    assert.ok(kept.includes("card-1") && kept.includes("short") && kept.includes("fresh"));
  });

  it("puts what changes last, so the rest begins the same each time", () => {
    const lean = leaner([system(" First."), ...exchanges(2), user("now")]);
    const again = leaner([system(" Second."), ...exchanges(2), user("now")]);
    assert.deepEqual(lean.slice(0, -1), again.slice(0, -1));
    const last = texts(lean.slice(-1));
    assert.equal(last[0], "now");
    assert.match(last[1]!, /^\[App note, not from the user:\nBTR_TOOL_CATEGORIES none\nCurrent local time: Wednesday 19:00.*702 kcal/);
    assert.ok((lean[0] as { content: string }).content.includes(APP_INSTRUCTIONS));
  });

  it("puts what the app says about a message last too, however long the conversation", () => {
    const lean = leaner([system(), user("Client context:\nSpoken aloud."), ...exchanges(20), user("now")]);
    assert.equal(texts(lean).filter((text) => text.includes("Spoken aloud.")).length, 1);
    assert.match(texts(lean.slice(-1))[1]!, /^\[App note, not from the user:\nClient context:\nSpoken aloud\./);
  });

  it("is untouched elsewhere", () => {
    const prompt = [{ content: "Telegram. Current local time: now", role: "system" as const }, ...exchanges(30)];
    assert.equal(leaner(prompt), prompt);
  });
});
