import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { verifyTelegramWebAppInitData } from "./telegram-webapp.ts";

const BOT_TOKEN = "123456:TEST-token";

function signInitData(fields: Record<string, string>, botToken = BOT_TOKEN): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("verifyTelegramWebAppInitData", () => {
  it("accepts a signed payload and returns the Telegram user", () => {
    const authDate = 1_777_420_800;
    const initData = signInitData({
      auth_date: String(authDate),
      user: JSON.stringify({ id: 42, first_name: "Ada", last_name: "Lovelace", username: "ada" }),
    });
    const user = verifyTelegramWebAppInitData(initData, BOT_TOKEN, {
      now: new Date(authDate * 1000),
    });
    assert.deepEqual(user, {
      id: 42,
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
    });
  });

  it("rejects a tampered hash", () => {
    const authDate = 1_777_420_800;
    const initData = signInitData({
      auth_date: String(authDate),
      user: JSON.stringify({ id: 42, first_name: "Ada" }),
    });
    assert.throws(
      () =>
        verifyTelegramWebAppInitData(`${initData}x`, BOT_TOKEN, {
          now: new Date(authDate * 1000),
        }),
      { code: "hash" },
    );
  });

  it("rejects stale auth_date", () => {
    const authDate = 1_777_420_800;
    const initData = signInitData({
      auth_date: String(authDate),
      user: JSON.stringify({ id: 42, first_name: "Ada" }),
    });
    assert.throws(
      () =>
        verifyTelegramWebAppInitData(initData, BOT_TOKEN, {
          now: new Date(authDate * 1000 + 25 * 60 * 60 * 1000),
        }),
      { code: "expired" },
    );
  });
});
