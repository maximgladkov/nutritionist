import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONVERSATION_SEARCH_DEFAULT_LIMIT,
  CONVERSATION_SEARCH_MAX_LIMIT,
  clampConversationSearchLimit,
  conversationMessageText,
  conversationSearchQuery,
  conversationTextWithoutMediaStubs,
  formatRecentConversation,
  isTelegramConversationChannel,
} from "./conversation-query.ts";

describe("clampConversationSearchLimit", () => {
  it("defaults and caps the page size", () => {
    assert.equal(clampConversationSearchLimit(undefined), CONVERSATION_SEARCH_DEFAULT_LIMIT);
    assert.equal(clampConversationSearchLimit(3), 3);
    assert.equal(clampConversationSearchLimit(100), CONVERSATION_SEARCH_MAX_LIMIT);
    assert.equal(clampConversationSearchLimit(0), 1);
    assert.equal(clampConversationSearchLimit(1.9), 1);
  });
});

describe("conversationSearchQuery", () => {
  it("treats blank queries as recent-turn listings", () => {
    assert.equal(conversationSearchQuery(undefined), undefined);
    assert.equal(conversationSearchQuery("   "), undefined);
    assert.equal(conversationSearchQuery("yogurt"), "yogurt");
  });
});

describe("isTelegramConversationChannel", () => {
  it("accepts eve adapter and instrumentation kinds", () => {
    assert.equal(isTelegramConversationChannel("telegram"), true);
    assert.equal(isTelegramConversationChannel("channel:telegram"), true);
    assert.equal(isTelegramConversationChannel("web"), false);
    assert.equal(isTelegramConversationChannel(undefined), false);
  });
});

describe("conversationMessageText", () => {
  it("flattens text and file parts", () => {
    assert.equal(conversationMessageText("  yogurt  "), "yogurt");
    assert.equal(
      conversationMessageText([
        { type: "text", text: "label" },
        { type: "file", filename: "meal.jpg", mediaType: "image/jpeg" },
      ]),
      "label\n[file: meal.jpg (image/jpeg)]",
    );
  });
});

describe("conversationTextWithoutMediaStubs", () => {
  it("strips image and file placeholders", () => {
    assert.equal(conversationTextWithoutMediaStubs("label\n[file: meal.jpg (image/jpeg)]"), "label");
    assert.equal(conversationTextWithoutMediaStubs("[image: image/jpeg]"), "");
  });
});

describe("formatRecentConversation", () => {
  it("returns undefined for empty input", () => {
    assert.equal(formatRecentConversation([]), undefined);
  });

  it("drops photo-only user lines and keeps the assistant description", () => {
    const formatted = formatRecentConversation([
      { role: "user", text: "[image: image/jpeg]" },
      { role: "assistant", text: "That looks like yogurt, 150g." },
      { role: "user", text: "yes" },
    ]);
    assert.equal(
      formatted,
      [
        "Recent Telegram turns. The current user message follows separately.",
        "Assistant: That looks like yogurt, 150g.",
        "User: yes",
      ].join("\n"),
    );
  });

  it("keeps caption text when a photo stub is present", () => {
    const formatted = formatRecentConversation([
      { role: "user", text: "lunch\n[file: meal.jpg (image/jpeg)]" },
    ]);
    assert.equal(
      formatted,
      ["Recent Telegram turns. The current user message follows separately.", "User: lunch"].join("\n"),
    );
  });

  it("keeps the newest messages within the count limit", () => {
    const formatted = formatRecentConversation(
      [
        { role: "user", text: "one" },
        { role: "assistant", text: "ok one" },
        { role: "user", text: "two" },
        { role: "assistant", text: "ok two" },
        { role: "user", text: "three" },
      ],
      { limit: 2 },
    );
    assert.equal(
      formatted,
      ["Recent Telegram turns. The current user message follows separately.", "Assistant: ok two", "User: three"].join(
        "\n",
      ),
    );
  });

  it("drops the oldest lines to stay under the character cap", () => {
    const formatted = formatRecentConversation(
      [
        { role: "user", text: "aaaaaaaaaa" },
        { role: "assistant", text: "bbbbbbbbbb" },
        { role: "user", text: "yes" },
      ],
      { maxChars: 90 },
    );
    assert.match(formatted ?? "", /User: yes$/u);
    assert.doesNotMatch(formatted ?? "", /aaaaaaaaaa/u);
  });
});
