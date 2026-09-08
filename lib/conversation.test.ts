import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONVERSATION_SEARCH_DEFAULT_LIMIT,
  CONVERSATION_SEARCH_MAX_LIMIT,
  CONVERSATION_SESSION_GAP_MS,
  RECENT_CONVERSATION_HEADER,
  ConversationError,
  clampConversationSearchLimit,
  conversationMessageText,
  conversationSearchCreatedAt,
  conversationSearchHasMore,
  conversationSearchQuery,
  conversationTextWithoutMediaStubs,
  formatRecentConversation,
  isTelegramConversationChannel,
  sliceCurrentConversation,
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

describe("conversationSearchCreatedAt", () => {
  it("returns undefined when no bounds are passed", () => {
    assert.equal(conversationSearchCreatedAt({ timeZone: "UTC" }), undefined);
    assert.equal(conversationSearchCreatedAt({ after: "  ", before: "", timeZone: "UTC" }), undefined);
  });

  it("treats ISO before and after as exclusive instants", () => {
    assert.deepEqual(
      conversationSearchCreatedAt({
        after: "2026-09-01T12:00:00.000Z",
        before: "2026-09-07T08:00:00.000Z",
        timeZone: "UTC",
      }),
      {
        gt: new Date("2026-09-01T12:00:00.000Z"),
        lt: new Date("2026-09-07T08:00:00.000Z"),
      },
    );
  });

  it("treats YYYY-MM-DD before and after as exclusive local days", () => {
    assert.deepEqual(
      conversationSearchCreatedAt({
        after: "2026-09-07",
        before: "2026-09-10",
        timeZone: "Europe/Berlin",
      }),
      {
        gte: new Date("2026-09-07T22:00:00.000Z"),
        lt: new Date("2026-09-09T22:00:00.000Z"),
      },
    );
  });

  it("allows after or before alone", () => {
    assert.deepEqual(conversationSearchCreatedAt({ after: "2026-09-07", timeZone: "UTC" }), {
      gte: new Date("2026-09-08T00:00:00.000Z"),
    });
    assert.deepEqual(conversationSearchCreatedAt({ before: "2026-09-10", timeZone: "UTC" }), {
      lt: new Date("2026-09-10T00:00:00.000Z"),
    });
  });

  it("rejects invalid strings and inverted ranges", () => {
    assert.throws(() => conversationSearchCreatedAt({ after: "2026-02-30", timeZone: "UTC" }), ConversationError);
    assert.throws(() => conversationSearchCreatedAt({ before: "nope", timeZone: "UTC" }), ConversationError);
    assert.throws(
      () =>
        conversationSearchCreatedAt({
          after: "2026-09-08T00:00:00.000Z",
          before: "2026-09-07T00:00:00.000Z",
          timeZone: "UTC",
        }),
      ConversationError,
    );
  });
});

describe("conversationSearchHasMore", () => {
  it("is true only when the fetched page equals the limit", () => {
    assert.equal(conversationSearchHasMore(10, 10), true);
    assert.equal(conversationSearchHasMore(9, 10), false);
    assert.equal(conversationSearchHasMore(0, 10), false);
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

describe("sliceCurrentConversation", () => {
  it("keeps the last stretch after a long pause", () => {
    const first = new Date("2026-09-08T08:00:00.000Z");
    const second = new Date("2026-09-08T08:05:00.000Z");
    const later = new Date(second.getTime() + CONVERSATION_SESSION_GAP_MS + 60_000);
    const followUp = new Date(later.getTime() + 60_000);
    assert.deepEqual(
      sliceCurrentConversation([
        { at: first, text: "breakfast" },
        { at: second, text: "logged" },
        { at: later, text: "lunch" },
        { at: followUp, text: "and coffee" },
      ]).map((message) => message.text),
      ["lunch", "and coffee"],
    );
  });

  it("keeps a long stretch when gaps stay under the pause", () => {
    const start = new Date("2026-09-08T12:00:00.000Z").getTime();
    const messages = Array.from({ length: 12 }, (_, index) => ({
      at: new Date(start + index * 5 * 60 * 1000),
      text: String(index + 1),
    }));
    assert.deepEqual(
      sliceCurrentConversation(messages).map((message) => message.text),
      messages.map((message) => message.text),
    );
  });

  it("starts a new stretch when the gap is exactly the pause", () => {
    const first = new Date("2026-09-08T08:00:00.000Z");
    const next = new Date(first.getTime() + CONVERSATION_SESSION_GAP_MS);
    assert.deepEqual(
      sliceCurrentConversation([
        { at: first, text: "old" },
        { at: next, text: "new" },
      ]).map((message) => message.text),
      ["new"],
    );
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
        RECENT_CONVERSATION_HEADER,
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
      [RECENT_CONVERSATION_HEADER, "User: lunch"].join("\n"),
    );
  });

  it("drops messages from the previous conversation after a long pause", () => {
    const morning = new Date("2026-09-08T08:00:00.000Z");
    const lunch = new Date(morning.getTime() + CONVERSATION_SESSION_GAP_MS + 60_000);
    const formatted = formatRecentConversation([
      { at: morning, role: "user", text: "logged oatmeal" },
      { at: morning, role: "assistant", text: "ok breakfast" },
      { at: lunch, role: "user", text: "chicken bowl" },
      { at: lunch, role: "assistant", text: "ok lunch" },
    ]);
    assert.equal(
      formatted,
      [RECENT_CONVERSATION_HEADER, "User: chicken bowl", "Assistant: ok lunch"].join("\n"),
    );
  });

  it("keeps more than eight messages from the current conversation", () => {
    const start = new Date("2026-09-08T12:00:00.000Z").getTime();
    const formatted = formatRecentConversation(
      Array.from({ length: 10 }, (_, index) => ({
        at: new Date(start + index * 60 * 1000),
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        text: `m${String(index + 1)}`,
      })),
    );
    assert.match(formatted ?? "", /User: m1/u);
    assert.match(formatted ?? "", /Assistant: m10/u);
  });

  it("drops the oldest lines to stay under the character cap", () => {
    const formatted = formatRecentConversation(
      [
        { role: "user", text: "aaaaaaaaaa" },
        { role: "assistant", text: "bbbbbbbbbb" },
        { role: "user", text: "yes" },
      ],
      { maxChars: RECENT_CONVERSATION_HEADER.length + 40 },
    );
    assert.match(formatted ?? "", /User: yes$/u);
    assert.doesNotMatch(formatted ?? "", /aaaaaaaaaa/u);
  });
});
