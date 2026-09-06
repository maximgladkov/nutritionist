import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  groupInviteLinks,
  groupInviteUrl,
  telegramBotStartInviteUrl,
  telegramShareUrl,
} from "./app-url.ts";

const KEYS = ["AUTH_URL", "TELEGRAM_BOT_USERNAME"] as const;
const original = new Map<string, string | undefined>(KEYS.map((key) => [key, process.env[key]]));

function setEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const key of KEYS) {
    const next = key in values ? values[key] : original.get(key);
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }
}

afterEach(() => {
  for (const key of KEYS) {
    const value = original.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("group invite URLs", () => {
  it("builds web and Telegram bot-start links", () => {
    setEnv({ AUTH_URL: "https://app.example.com/", TELEGRAM_BOT_USERNAME: "@coach_bot" });
    assert.equal(groupInviteUrl("AbCdEfGh12345678"), "https://app.example.com/g/AbCdEfGh12345678");
    assert.equal(
      telegramBotStartInviteUrl("AbCdEfGh12345678"),
      "https://t.me/coach_bot?start=g_AbCdEfGh12345678",
    );
    assert.deepEqual(groupInviteLinks("AbCdEfGh12345678"), {
      telegramInviteUrl: "https://t.me/coach_bot?start=g_AbCdEfGh12345678",
      webInviteUrl: "https://app.example.com/g/AbCdEfGh12345678",
    });
  });

  it("returns null when origin or bot username is missing", () => {
    setEnv({ AUTH_URL: undefined, TELEGRAM_BOT_USERNAME: undefined });
    assert.equal(groupInviteUrl("AbCdEfGh12345678"), null);
    assert.equal(telegramBotStartInviteUrl("AbCdEfGh12345678"), null);
    assert.deepEqual(groupInviteLinks("AbCdEfGh12345678"), {
      telegramInviteUrl: null,
      webInviteUrl: null,
    });
  });

  it("builds a Telegram share URL", () => {
    assert.equal(
      telegramShareUrl("https://t.me/coach_bot?start=g_token", "Team"),
      "https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fcoach_bot%3Fstart%3Dg_token&text=Team",
    );
  });
});
