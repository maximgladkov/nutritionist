import assert from "node:assert/strict";
import { handleApiRequest } from "../index.ts";
import { resetApiDeps, setApiDeps, type EmailCodeMessage, type FoodRecognizer, type PushMessage } from "../deps.ts";
import type { AppleIdentity } from "../apple.ts";
import { prisma } from "../../prisma.ts";

export const emails: EmailCodeMessage[] = [];
export const pushes: PushMessage[] = [];
const blobs = new Map<string, { bytes: Uint8Array; contentType: string }>();

let recognizer: FoodRecognizer = async () => ({ foods: [] });

export function setRecognizer(next: FoodRecognizer): void {
  recognizer = next;
}

// Identity tokens in tests are `apple:<json identity>`; anything else fails verification.
export function appleToken(identity: Partial<AppleIdentity> & { sub: string }): string {
  return `apple:${JSON.stringify({ email: null, emailVerified: false, isPrivateEmail: false, ...identity })}`;
}

export function installFakes(): void {
  emails.length = 0;
  pushes.length = 0;
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
    recognizeFoods: (input) => recognizer(input),
    async sendEmailCode(message) {
      emails.push(message);
    },
    async sendPush(messages) {
      pushes.push(...messages);
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
