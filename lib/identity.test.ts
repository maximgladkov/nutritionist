import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickSurvivor, selectLiveUserId } from "./identity-core.ts";
import { parseLinkCommand } from "./link-command.ts";
import { mergeMemoryFiles, parseMemoryFile } from "./memory-format.ts";

describe("parseLinkCommand", () => {
  it("parses /link without a code", () => {
    assert.deepEqual(parseLinkCommand("/link"), { kind: "generate" });
    assert.deepEqual(parseLinkCommand("/link@nutritionist_bot"), { kind: "generate" });
  });

  it("parses /link with a code", () => {
    assert.deepEqual(parseLinkCommand("/link abcd1234"), {
      kind: "consume",
      code: "ABCD1234",
    });
  });

  it("ignores ordinary messages", () => {
    assert.equal(parseLinkCommand("hello"), null);
    assert.equal(parseLinkCommand("/help"), null);
  });
});

describe("pickSurvivor", () => {
  it("keeps the same user", () => {
    const user = { id: "a", email: "a@x.com", name: null };
    assert.deepEqual(pickSurvivor(user, user), { kind: "same", user });
  });

  it("lets the Auth.js email user survive", () => {
    const emailUser = { id: "web", email: "a@x.com", name: "A" };
    const telegramUser = { id: "tg", email: null, name: "Bot" };
    assert.deepEqual(pickSurvivor(telegramUser, emailUser), {
      kind: "merge",
      survivor: emailUser,
      absorbed: telegramUser,
    });
    assert.deepEqual(pickSurvivor(emailUser, telegramUser), {
      kind: "merge",
      survivor: emailUser,
      absorbed: telegramUser,
    });
  });

  it("refuses to merge two email accounts", () => {
    const a = { id: "a", email: "a@x.com", name: null };
    const b = { id: "b", email: "b@x.com", name: null };
    assert.equal(pickSurvivor(a, b).kind, "both-have-email");
  });
});

describe("selectLiveUserId", () => {
  it("prefers the mapped agent session after a merge", () => {
    assert.equal(
      selectLiveUserId({
        sessionUserId: "survivor",
        principalId: "absorbed",
        principalExists: false,
      }),
      "survivor",
    );
  });

  it("uses the session principal when no agent session exists yet", () => {
    assert.equal(
      selectLiveUserId({
        sessionUserId: undefined,
        principalId: "web",
        principalExists: true,
      }),
      "web",
    );
  });

  it("does not keep a deleted principal", () => {
    assert.equal(
      selectLiveUserId({
        sessionUserId: undefined,
        principalId: "absorbed",
        principalExists: false,
      }),
      undefined,
    );
  });
});

describe("mergeMemoryFiles", () => {
  it("appends unique absorbed entries", () => {
    const merged = mergeMemoryFiles(
      parseMemoryFile(
        JSON.stringify({
          lastAllocatedIndex: 0,
          entries: [{ index: 0, text: "prefers vegetarian" }],
        }),
      ),
      parseMemoryFile(
        JSON.stringify({
          lastAllocatedIndex: 1,
          entries: [
            { index: 0, text: "prefers vegetarian" },
            { index: 1, text: "allergic to peanuts" },
          ],
        }),
      ),
    );
    assert.equal(merged.entries.length, 2);
    assert.equal(merged.entries[1]?.text, "allergic to peanuts");
    assert.equal(merged.lastAllocatedIndex, 1);
  });
});
