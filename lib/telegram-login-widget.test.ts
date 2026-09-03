import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { verifyTelegramLoginWidget } from "./telegram-login-widget.ts";

const BOT_TOKEN = "123456:TEST-token";

function signWidget(fields: Record<string, string>, botToken = BOT_TOKEN): Record<string, string> {
  const dataCheckString = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return { ...fields, hash };
}

describe("verifyTelegramLoginWidget", () => {
  it("accepts a signed payload and returns the Telegram user", () => {
    const authDate = 1_777_420_800;
    const fields = signWidget({
      auth_date: String(authDate),
      first_name: "Ada",
      id: "42",
      last_name: "Lovelace",
      photo_url: "https://t.me/i/userpic/320/ada.jpg",
      username: "ada",
    });
    const user = verifyTelegramLoginWidget(fields, BOT_TOKEN, {
      now: new Date(authDate * 1000),
    });
    assert.deepEqual(user, {
      id: 42,
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      photoUrl: "https://t.me/i/userpic/320/ada.jpg",
    });
  });

  it("ignores empty optional fields that were not part of the signed payload", () => {
    const authDate = 1_777_420_800;
    const fields = signWidget({
      auth_date: String(authDate),
      first_name: "Ada",
      id: "42",
    });
    const user = verifyTelegramLoginWidget(
      { ...fields, last_name: "", username: "", photo_url: "" },
      BOT_TOKEN,
      { now: new Date(authDate * 1000) },
    );
    assert.deepEqual(user, {
      id: 42,
      firstName: "Ada",
      lastName: undefined,
      username: undefined,
      photoUrl: undefined,
    });
  });

  it("rejects a tampered hash", () => {
    const authDate = 1_777_420_800;
    const fields = signWidget({
      auth_date: String(authDate),
      first_name: "Ada",
      id: "42",
    });
    assert.throws(
      () =>
        verifyTelegramLoginWidget(
          { ...fields, hash: `${fields.hash.slice(0, -1)}0` },
          BOT_TOKEN,
          { now: new Date(authDate * 1000) },
        ),
      { code: "hash" },
    );
  });

  it("rejects stale auth_date", () => {
    const authDate = 1_777_420_800;
    const fields = signWidget({
      auth_date: String(authDate),
      first_name: "Ada",
      id: "42",
    });
    assert.throws(
      () =>
        verifyTelegramLoginWidget(fields, BOT_TOKEN, {
          now: new Date(authDate * 1000 + 25 * 60 * 60 * 1000),
        }),
      { code: "expired" },
    );
  });
});
