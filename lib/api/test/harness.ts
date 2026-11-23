import assert from "node:assert/strict";
import { handleApiRequest } from "../index.ts";
import { resetApiDeps, setApiDeps, type EmailCodeMessage, type FoodRecognizer, type MatchPicker, type PushMessage } from "../deps.ts";
import type { AppleIdentity } from "../apple.ts";
import { prisma } from "../../prisma.ts";
import type { FatSecretFoodEntry, FatSecretServing } from "../../fatsecret.ts";
import { runFatSecretImportInline } from "../../fatsecret-import.ts";

export const emails: EmailCodeMessage[] = [];
export const pushes: PushMessage[] = [];
const blobs = new Map<string, { bytes: Uint8Array; contentType: string }>();

let recognizer: FoodRecognizer = async () => ({ foods: [] });

export function setRecognizer(next: FoodRecognizer): void {
  recognizer = next;
}

const backgroundTasks: Promise<void>[] = [];

export async function flushBackground(): Promise<void> {
  await Promise.all(backgroundTasks.splice(0));
}

let documentEmbedder: (texts: readonly string[]) => Promise<number[][]> = async () => [];

export function setDocumentEmbedder(next: (texts: readonly string[]) => Promise<number[][]>): void {
  documentEmbedder = next;
}

let picker: MatchPicker = async () => {
  throw new Error("no picker in tests");
};

export function setMatchPicker(next: MatchPicker): void {
  picker = next;
}

// A fake FatSecret account: diary entries and weights by day (days since 1970-01-01).
export const fatSecretDiary = {
  entries: new Map<number, FatSecretFoodEntry[]>(),
  // Food ids the import looked up, in order.
  lookups: [] as string[],
  servings: new Map<string, FatSecretServing[]>(),
  weights: new Map<number, number>(),
};

function sameMonth(dateInt: number, monthDateInt: number): boolean {
  const month = (value: number) => new Date(value * 86_400_000).toISOString().slice(0, 7);
  return month(dateInt) === month(monthDateInt);
}

// Identity tokens in tests are `apple:<json identity>`; anything else fails verification.
export function appleToken(identity: Partial<AppleIdentity> & { sub: string }): string {
  return `apple:${JSON.stringify({ email: null, emailVerified: false, isPrivateEmail: false, ...identity })}`;
}

// Media types the fake transcriber was asked to read, in order.
export const transcriptions: string[] = [];

export function installFakes(): void {
  transcriptions.length = 0;
  emails.length = 0;
  pushes.length = 0;
  fatSecretDiary.entries.clear();
  fatSecretDiary.lookups.length = 0;
  fatSecretDiary.servings.clear();
  fatSecretDiary.weights.clear();
  blobs.clear();
  resetApiDeps();
  setApiDeps({
    blobs: {
      async put(pathname, bytes, contentType) {
        const url = `memory://${pathname}`;
        blobs.set(url, { bytes, contentType });
        return { pathname, url };
      },
      async read(url) {
        const entry = blobs.get(url);
        return entry ? { body: new Response(Buffer.from(entry.bytes)).body!, contentType: entry.contentType } : null;
      },
    },
    // No embeddings or AI picks in tests unless a test sets them: grounding falls back to its
    // name-and-calorie rules.
    // Background work runs at once in tests; flushBackground() waits for it.
    background: (task) => {
      backgroundTasks.push(task());
    },
    embedDocuments: (texts) => documentEmbedder(texts),
    fatSecret: {
      configured: () => true,
      async requestToken() {
        return { secret: "request-secret", token: `request-${Math.random().toString(36).slice(2)}` };
      },
      authorizeUrl: (token) => `https://fatsecret.test/authorize?oauth_token=${token}`,
      async accessToken(request, verifier) {
        assert.equal(request.secret, "request-secret");
        if (verifier !== "good-verifier") throw new Error("bad verifier");
        return { secret: "access-secret", token: "access-token" };
      },
      async monthDays(access, dateInt) {
        assert.equal(access.token, "access-token");
        return [...fatSecretDiary.entries.keys()].filter((day) => sameMonth(day, dateInt));
      },
      async dayEntries(_access, dateInt) {
        return fatSecretDiary.entries.get(dateInt) ?? [];
      },
      async monthWeights(_access, dateInt) {
        return [...fatSecretDiary.weights]
          .filter(([day]) => sameMonth(day, dateInt))
          .map(([day, weightKg]) => ({ dateInt: day, weightKg }));
      },
      async foodServings(foodId) {
        fatSecretDiary.lookups.push(foodId);
        return fatSecretDiary.servings.get(foodId) ?? null;
      },
    },
    embedTexts: async () => [],
    pickMatches: (questions) => picker(questions),
    recognizeFoods: (input) => recognizer(input),
    // Reads the "spoken" text straight out of the test recording.
    async transcribe({ bytes, mediaType }) {
      transcriptions.push(mediaType);
      const spoken = new TextDecoder().decode(bytes.subarray(44));
      return { language: spoken.startsWith("Dos") ? "spanish" : "english", text: spoken };
    },
    async sendEmailCode(message) {
      emails.push(message);
    },
    async sendPush(messages) {
      pushes.push(...messages);
    },
    async startFatSecretImport(userId) {
      backgroundTasks.push(runFatSecretImportInline(userId));
    },
    async verifyAppleToken(identityToken) {
      if (!identityToken.startsWith("apple:")) {
        throw new Error("bad token");
      }
      return JSON.parse(identityToken.slice("apple:".length)) as AppleIdentity;
    },
  });
}

const TABLES_TO_KEEP = new Set(["_prisma_migrations"]);

export async function resetDatabase(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  const tables = rows.map((row) => row.tablename).filter((name) => !TABLES_TO_KEEP.has(name));
  if (tables.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((name) => `"${name}"`).join(", ")} CASCADE`);
  }
}

export type ApiResult<T = any> = { body: T; headers: Headers; status: number };

export async function api<T = any>(
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string>; raw?: BodyInit; token?: string } = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers);
  if (options.token) {
    headers.set("authorization", `Bearer ${options.token}`);
  }
  let body: BodyInit | undefined = options.raw;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  const response = await handleApiRequest(new Request(`http://localhost/api/v1${path}`, { body, headers, method }));
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { body: parsed as T, headers: response.headers, status: response.status };
}

export type Session = { accessToken: string; refreshToken: string; userId: string };

export async function signIn(email: string, profile: { timezone?: string } = { timezone: "Europe/Madrid" }): Promise<Session> {
  const start = await api("POST", "/auth/email/start", { body: { email } });
  assert.equal(start.status, 204, JSON.stringify(start.body));
  const message = emails.filter((entry) => entry.email === email.toLowerCase()).at(-1);
  assert.ok(message, "expected a sign-in email");
  const verified = await api("POST", "/auth/email/verify", { body: { code: message.code, email } });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  const session = {
    accessToken: verified.body.accessToken as string,
    refreshToken: verified.body.refreshToken as string,
    userId: verified.body.user.id as string,
  };
  if (profile.timezone) {
    const patched = await api("PATCH", "/me", { body: { timezone: profile.timezone }, token: session.accessToken });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
  }
  return session;
}

export async function seedOffProduct(input: {
  barcode: string;
  brands?: string;
  countryCodes?: string[];
  name: string;
  nutriments: Record<string, number>;
  quantity?: string;
  servingSize?: string;
}): Promise<void> {
  await prisma.offProduct.create({
    data: {
      barcode: input.barcode,
      brands: input.brands ?? null,
      countryCodes: input.countryCodes ?? [],
      name: input.name,
      names: {},
      nutriments: input.nutriments,
      quantity: input.quantity ?? null,
      searchSource: [input.name, input.brands ?? ""].join(" "),
      servingSize: input.servingSize ?? null,
    },
  });
}

export async function seedGenericFood(input: { id: string; name: string; nutriments: Record<string, number>; portions?: { grams: number; label: string }[] }): Promise<void> {
  await prisma.genericFood.create({
    data: {
      category: null,
      id: input.id,
      name: input.name,
      nutriments: input.nutriments,
      portions: input.portions ?? [],
      source: "usda-sr-legacy",
      sourceId: input.id.replace("usda:", ""),
    },
  });
}

// A 1x1 PNG, enough for the media-type sniffing done on upload.
export const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

export async function uploadPng(token: string): Promise<string> {
  const uploaded = await api("POST", "/uploads", { headers: { "content-type": "image/png" }, raw: PNG_BYTES, token });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  return uploaded.body.uploadId as string;
}

export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect();
}
