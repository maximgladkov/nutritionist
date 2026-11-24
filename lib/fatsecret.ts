import { createHmac, randomBytes } from "node:crypto";

// FatSecret Platform API. Reading someone's diary needs OAuth 1.0 three-legged sign-in: their
// OAuth 2.0 only grants app-level access (food search), not a user's profile or diary.
// Docs: https://platform.fatsecret.com/docs/guides/authentication/oauth1/three-legged

const AUTH_BASE = "https://authentication.fatsecret.com/oauth";
const API_URL = "https://platform.fatsecret.com/rest/server.api";
const REQUEST_TIMEOUT_MS = 20_000;

export class FatSecretError extends Error {
  readonly code?: number;
  // FatSecret's per-user limit ("User is performing too many actions"): wait, then try again.
  readonly rateLimited: boolean;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "FatSecretError";
    this.code = code;
    this.rateLimited = /too many actions/i.test(message);
  }
}

// FatSecret limits how fast one user's data can be read, so calls go out one at a time with a
// short gap instead of in bursts.
const CALL_GAP_MS = 400;
let queue: Promise<unknown> = Promise.resolve();

function paced<T>(call: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    try {
      return await call();
    } finally {
      await new Promise((resolve) => setTimeout(resolve, CALL_GAP_MS));
    }
  });
  queue = next.catch(() => undefined);
  return next;
}

export type FatSecretTokens = { token: string; secret: string };

// One diary entry as FatSecret returns it: nutrients are for the whole entry, not per 100 g.
export type FatSecretFoodEntry = {
  calories?: string;
  carbohydrate?: string;
  date_int: string;
  fat?: string;
  fiber?: string;
  food_entry_description?: string;
  food_entry_id: string;
  food_entry_name: string;
  food_id?: string;
  meal: string;
  number_of_units?: string;
  protein?: string;
  saturated_fat?: string;
  serving_id?: string;
  sodium?: string;
  sugar?: string;
};

export type FatSecretServing = {
  metric_serving_amount?: string;
  metric_serving_unit?: string;
  number_of_units?: string;
  serving_id: string;
};

export type FatSecretClient = {
  configured(): boolean;
  // Starts sign-in; FatSecret sends the user back to `callbackUrl` with a verifier.
  requestToken(callbackUrl: string): Promise<FatSecretTokens>;
  authorizeUrl(requestToken: string): string;
  accessToken(request: FatSecretTokens, verifier: string): Promise<FatSecretTokens>;
  // Days (as days since 1970-01-01) in the month containing `dateInt` that have food entries.
  monthDays(access: FatSecretTokens, dateInt: number): Promise<number[]>;
  // The height in the person's FatSecret profile; null when they haven't set one.
  heightCm(access: FatSecretTokens): Promise<number | null>;
  dayEntries(access: FatSecretTokens, dateInt: number): Promise<FatSecretFoodEntry[]>;
  monthWeights(access: FatSecretTokens, dateInt: number): Promise<{ dateInt: number; weightKg: number }[]>;
  // Servings of a public food, for grams per serving; null when the food isn't public.
  foodServings(foodId: string): Promise<FatSecretServing[] | null>;
};

const enc = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

function credentials(): { key: string; secret: string } {
  const key = process.env.FATSECRET_CONSUMER_KEY?.trim();
  const secret = process.env.FATSECRET_CONSUMER_SECRET?.trim();
  if (!key || !secret) {
    throw new FatSecretError("FatSecret is not configured");
  }
  return { key, secret };
}

// Signs request parameters with HMAC-SHA1 (OAuth 1.0a), returning them with the oauth_* fields.
export function signFatSecretRequest(input: {
  consumerKey: string;
  consumerSecret: string;
  method: "GET" | "POST";
  nonce?: string;
  params: Record<string, string>;
  timestamp?: string;
  tokenSecret?: string;
  url: string;
}): Record<string, string> {
  const all: Record<string, string> = {
    ...input.params,
    oauth_consumer_key: input.consumerKey,
    oauth_nonce: input.nonce ?? randomBytes(12).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: input.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
  };
  const normalized = Object.keys(all)
    .sort()
    .map((name) => `${enc(name)}=${enc(all[name]!)}`)
    .join("&");
  const base = [input.method, enc(input.url), enc(normalized)].join("&");
  const signingKey = `${enc(input.consumerSecret)}&${enc(input.tokenSecret ?? "")}`;
  return { ...all, oauth_signature: createHmac("sha1", signingKey).update(base).digest("base64") };
}

async function signedPost(url: string, params: Record<string, string>, tokenSecret?: string): Promise<string> {
  const { key, secret } = credentials();
  const body = new URLSearchParams(
    signFatSecretRequest({ consumerKey: key, consumerSecret: secret, method: "POST", params, tokenSecret, url }),
  );
  const response = await fetch(url, {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new FatSecretError(`FatSecret ${response.status}: ${text.slice(0, 200)}`);
  }
  return text;
}

function tokensFrom(text: string): FatSecretTokens {
  const reply = new URLSearchParams(text);
  const token = reply.get("oauth_token");
  const secret = reply.get("oauth_token_secret");
  if (!token || !secret) {
    throw new FatSecretError(`FatSecret sign-in failed: ${text.slice(0, 200)}`);
  }
  return { secret, token };
}

async function callApi(method: string, params: Record<string, string>, access?: FatSecretTokens): Promise<Record<string, unknown>> {
  return paced(() => callApiNow(method, params, access));
}

async function callApiNow(method: string, params: Record<string, string>, access?: FatSecretTokens): Promise<Record<string, unknown>> {
  const text = await signedPost(
    API_URL,
    { ...params, format: "json", method, ...(access ? { oauth_token: access.token } : {}) },
    access?.secret,
  );
  const json = JSON.parse(text) as { error?: { code: number; message: string } } & Record<string, unknown>;
  if (json.error) {
    throw new FatSecretError(json.error.message, json.error.code);
  }
  return json;
}

// FatSecret returns a single object instead of a one-item array.
function list<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// Invalid ID: the food is private or regional and not served by the public API.
const INVALID_ID = 106;

export const fatSecretClient: FatSecretClient = {
  configured() {
    return Boolean(process.env.FATSECRET_CONSUMER_KEY?.trim() && process.env.FATSECRET_CONSUMER_SECRET?.trim());
  },
  async requestToken(callbackUrl) {
    return tokensFrom(await signedPost(`${AUTH_BASE}/request_token`, { oauth_callback: callbackUrl }));
  },
  authorizeUrl(requestToken) {
    return `${AUTH_BASE}/authorize?oauth_token=${encodeURIComponent(requestToken)}`;
  },
  async accessToken(request, verifier) {
    return tokensFrom(
      await signedPost(`${AUTH_BASE}/access_token`, { oauth_token: request.token, oauth_verifier: verifier }, request.secret),
    );
  },
  async monthDays(access, dateInt) {
    const json = await callApi("food_entries.get_month", { date: String(dateInt) }, access);
    const month = json.month as { day?: { date_int: string } | { date_int: string }[] } | undefined;
    return list(month?.day).map((day) => Number(day.date_int));
  },
  async heightCm(access) {
    const json = await callApi("profile.get", {}, access);
    const height = Number((json.profile as { height_cm?: string } | undefined)?.height_cm);
    return Number.isFinite(height) && height > 0 ? height : null;
  },
  async dayEntries(access, dateInt) {
    const json = await callApi("food_entries.get", { date: String(dateInt) }, access);
    const entries = json.food_entries as { food_entry?: FatSecretFoodEntry | FatSecretFoodEntry[] } | null | undefined;
    return list(entries?.food_entry);
  },
  async monthWeights(access, dateInt) {
    const json = await callApi("weights.get_month", { date: String(dateInt) }, access);
    const month = json.month as { day?: { date_int: string; weight_kg: string } | { date_int: string; weight_kg: string }[] } | undefined;
    return list(month?.day)
      .map((day) => ({ dateInt: Number(day.date_int), weightKg: Number(day.weight_kg) }))
      .filter((day) => Number.isFinite(day.weightKg) && day.weightKg > 0);
  },
  async foodServings(foodId) {
    try {
      const json = await callApi("food.get.v4", { food_id: foodId });
      const food = json.food as { servings?: { serving?: FatSecretServing | FatSecretServing[] } } | undefined;
      return list(food?.servings?.serving);
    } catch (error) {
      if (error instanceof FatSecretError && error.code === INVALID_ID) return null;
      throw error;
    }
  },
};

// FatSecret dates are whole days since 1970-01-01 (UTC).
export function fatSecretDateInt(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
}

export function fatSecretYmd(dateInt: number): string {
  return new Date(dateInt * 86_400_000).toISOString().slice(0, 10);
}
