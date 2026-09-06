import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSendGroupMessage, canViewMemberNutrition, leaveGroupDecision } from "./groups-core.ts";
import {
  generateInviteToken,
  INVITE_TOKEN_LENGTH,
  isInviteToken,
  parseInviteStartParam,
  parseTelegramStartInvite,
  planMembershipMerge,
  telegramStartInvitePayload,
} from "./groups-invite.ts";

describe("invite tokens", () => {
  it("generates alphanumeric tokens of the start-payload length", () => {
    const token = generateInviteToken();
    assert.equal(token.length, INVITE_TOKEN_LENGTH);
    assert.equal(isInviteToken(token), true);
    assert.equal(parseInviteStartParam(telegramStartInvitePayload(token)), token);
  });

  it("rejects malformed tokens", () => {
    assert.equal(isInviteToken(""), false);
    assert.equal(isInviteToken("short"), false);
    assert.equal(isInviteToken(`${"a".repeat(INVITE_TOKEN_LENGTH)}!`), false);
    assert.equal(parseInviteStartParam("g_short"), null);
    assert.equal(parseInviteStartParam(null), null);
  });

  it("parses /start invite payloads", () => {
    const token = "AbCdEfGh12345678";
    assert.equal(parseTelegramStartInvite(`/start g_${token}`), token);
    assert.equal(parseTelegramStartInvite(`/start@nutritionist_bot g_${token}`), token);
    assert.equal(parseTelegramStartInvite("/start"), null);
    assert.equal(parseTelegramStartInvite("/summary"), null);
  });
});

describe("membership merge", () => {
  it("moves unique memberships and drops duplicates", () => {
    assert.deepEqual(
      planMembershipMerge(
        [{ groupId: "g1", id: "s1", role: "member" }],
        [
          { groupId: "g1", id: "a1", role: "member" },
          { groupId: "g2", id: "a2", role: "owner" },
        ],
      ),
      { deleteIds: ["a1"], moveIds: ["a2"], promoteIds: [] },
    );
  });

  it("promotes the survivor when the absorbed user owned the group", () => {
    assert.deepEqual(
      planMembershipMerge(
        [{ groupId: "g1", id: "s1", role: "member" }],
        [{ groupId: "g1", id: "a1", role: "owner" }],
      ),
      { deleteIds: ["a1"], moveIds: [], promoteIds: ["s1"] },
    );
  });
});

describe("group authz", () => {
  it("lets only the owner view a member diary", () => {
    assert.equal(
      canViewMemberNutrition({
        callerId: "owner",
        groupOwnerId: "owner",
        memberId: "member",
        memberRole: "member",
      }),
      true,
    );
    assert.equal(
      canViewMemberNutrition({
        callerId: "member",
        groupOwnerId: "owner",
        memberId: "other",
        memberRole: "member",
      }),
      false,
    );
    assert.equal(
      canViewMemberNutrition({
        callerId: "owner",
        groupOwnerId: "owner",
        memberId: "owner",
        memberRole: "owner",
      }),
      false,
    );
    assert.equal(
      canViewMemberNutrition({
        callerId: "owner",
        groupOwnerId: "owner",
        memberId: "outsider",
        memberRole: null,
      }),
      false,
    );
  });

  it("requires a non-empty body to send a message to a member", () => {
    assert.equal(
      canSendGroupMessage({
        body: "  eat more protein  ",
        callerId: "owner",
        groupOwnerId: "owner",
        memberId: "member",
        memberRole: "member",
      }),
      true,
    );
    assert.equal(
      canSendGroupMessage({
        body: "   ",
        callerId: "owner",
        groupOwnerId: "owner",
        memberId: "member",
        memberRole: "member",
      }),
      false,
    );
  });

  it("blocks owners from leaving", () => {
    assert.equal(leaveGroupDecision({ callerId: "owner", groupOwnerId: "owner", isMember: true }), "owner");
    assert.equal(leaveGroupDecision({ callerId: "member", groupOwnerId: "owner", isMember: true }), "leave");
    assert.equal(leaveGroupDecision({ callerId: "x", groupOwnerId: "owner", isMember: false }), "not-member");
  });
});
