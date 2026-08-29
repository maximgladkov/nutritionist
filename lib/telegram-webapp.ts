import { createHmac, timingSafeEqual } from "node:crypto";

export const TELEGRAM_WEBAPP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type TelegramWebAppUser = {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
};

export class TelegramWebAppError extends Error {
  readonly code: "missing" | "hash" | "expired" | "user";

  constructor(message: string, code: "missing" | "hash" | "expired" | "user") {
    super(message);
    this.name = "TelegramWebAppError";
    this.code = code;
  }
}

export function verifyTelegramWebAppInitData(
  initData: string,
  botToken: string,
  options?: { maxAgeMs?: number; now?: Date },
): TelegramWebAppUser {
  const trimmed = initData.trim();
  if (!trimmed) {
    throw new TelegramWebAppError("Telegram login data is missing", "missing");
  }
  const params = new URLSearchParams(trimmed);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/iu.test(hash)) {
    throw new TelegramWebAppError("Telegram login data is invalid", "hash");
  }
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const actualBuf = Buffer.from(hash.toLowerCase());
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new TelegramWebAppError("Telegram login data is invalid", "hash");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) {
    throw new TelegramWebAppError("Telegram login data is invalid", "hash");
  }
  const now = options?.now ?? new Date();
  const maxAgeMs = options?.maxAgeMs ?? TELEGRAM_WEBAPP_MAX_AGE_MS;
  const ageMs = now.getTime() - authDate * 1000;
  if (ageMs > maxAgeMs || ageMs < -60_000) {
    throw new TelegramWebAppError("Telegram login expired. Close and open the summary again.", "expired");
  }

  return parseTelegramWebAppUser(params.get("user"));
}

function parseTelegramWebAppUser(raw: string | null): TelegramWebAppUser {
  if (!raw) {
    throw new TelegramWebAppError("Telegram user is missing", "user");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TelegramWebAppError("Telegram user is missing", "user");
  }
  if (typeof parsed !== "object" || parsed === null || !("id" in parsed)) {
    throw new TelegramWebAppError("Telegram user is missing", "user");
  }
  const id = (parsed as { id: unknown }).id;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    throw new TelegramWebAppError("Telegram user is missing", "user");
  }
  const firstName =
    "first_name" in parsed && typeof (parsed as { first_name: unknown }).first_name === "string"
      ? (parsed as { first_name: string }).first_name
      : "";
  const lastName =
    "last_name" in parsed && typeof (parsed as { last_name: unknown }).last_name === "string"
      ? (parsed as { last_name: string }).last_name
      : undefined;
  const username =
    "username" in parsed && typeof (parsed as { username: unknown }).username === "string"
      ? (parsed as { username: string }).username
      : undefined;
  return { id, firstName, lastName, username };
}
