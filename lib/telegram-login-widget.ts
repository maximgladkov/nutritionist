import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const TELEGRAM_LOGIN_WIDGET_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type TelegramLoginUser = {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
};

export class TelegramLoginWidgetError extends Error {
  readonly code: "missing" | "hash" | "expired" | "user";

  constructor(message: string, code: "missing" | "hash" | "expired" | "user") {
    super(message);
    this.name = "TelegramLoginWidgetError";
    this.code = code;
  }
}

export type TelegramLoginWidgetFields = {
  readonly auth_date?: unknown;
  readonly first_name?: unknown;
  readonly hash?: unknown;
  readonly id?: unknown;
  readonly last_name?: unknown;
  readonly photo_url?: unknown;
  readonly username?: unknown;
};

export function telegramLoginBotUsername(): string | undefined {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!raw) {
    return undefined;
  }
  return raw.replace(/^@/u, "");
}

export function verifyTelegramLoginWidget(
  fields: TelegramLoginWidgetFields,
  botToken: string,
  options?: { maxAgeMs?: number; now?: Date },
): TelegramLoginUser {
  const hash = stringField(fields.hash);
  if (!hash || !/^[0-9a-f]{64}$/iu.test(hash)) {
    throw new TelegramLoginWidgetError("Telegram login data is invalid", "hash");
  }

  const payload: Record<string, string> = {};
  for (const key of ["id", "first_name", "last_name", "username", "photo_url", "auth_date"] as const) {
    const value = stringField(fields[key]);
    if (value) {
      payload[key] = value;
    }
  }
  if (Object.keys(payload).length === 0) {
    throw new TelegramLoginWidgetError("Telegram login data is missing", "missing");
  }

  const dataCheckString = Object.entries(payload)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const actualBuf = Buffer.from(hash.toLowerCase());
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new TelegramLoginWidgetError("Telegram login data is invalid", "hash");
  }

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate)) {
    throw new TelegramLoginWidgetError("Telegram login data is invalid", "hash");
  }
  const now = options?.now ?? new Date();
  const maxAgeMs = options?.maxAgeMs ?? TELEGRAM_LOGIN_WIDGET_MAX_AGE_MS;
  const ageMs = now.getTime() - authDate * 1000;
  if (ageMs > maxAgeMs || ageMs < -60_000) {
    throw new TelegramLoginWidgetError("Telegram login expired. Try signing in again.", "expired");
  }

  return parseTelegramLoginUser(payload);
}

function stringField(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseTelegramLoginUser(payload: Record<string, string>): TelegramLoginUser {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TelegramLoginWidgetError("Telegram user is missing", "user");
  }
  const firstName = payload.first_name ?? "";
  return {
    id,
    firstName,
    lastName: payload.last_name,
    username: payload.username,
    photoUrl: payload.photo_url,
  };
}
