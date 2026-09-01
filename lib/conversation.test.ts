import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONVERSATION_SEARCH_DEFAULT_LIMIT,
  CONVERSATION_SEARCH_MAX_LIMIT,
  clampConversationSearchLimit,
  conversationSearchQuery,
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
