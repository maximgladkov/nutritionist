import { get, put } from "@vercel/blob";
import { APP_NAME } from "../brand.ts";
import { verifyAppleIdentityToken, type AppleIdentity } from "./apple.ts";

export type EmailCodeMessage = { code: string; email: string; locale: string };

export type StoredBlob = { pathname: string; url: string };

export type BlobStore = {
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<StoredBlob>;
  read(url: string): Promise<{ body: ReadableStream<Uint8Array>; contentType: string } | null>;
};

export type PushMessage = { body: string; data?: Record<string, unknown>; title: string; to: string };

export type RecognizedFood = {
  amount: number;
  brand?: string;
  name: string;
  // Per-100 g or ml values read from a nutrition label, when the source shows them.
  nutrimentsPer100g?: Record<string, number>;
  // Centre of the food in a meal photo, as fractions of the image width and height.
  position?: { x: number; y: number };
  searchQueries: string[];
  // Serving size as printed on a nutrition label ("40 g"), when the label states one.
  servingSize?: string;
  unit: "g" | "ml" | "serving";
};

export type FoodRecognizer = (input: {
  // The user's catalog country, so search terms come in the language its products are named in.
  country?: string;
  images: readonly { bytes: Uint8Array; mediaType: string }[];
  locale: string;
  source: "label" | "photo" | "text";
  text?: string;
}) => Promise<{ foods: RecognizedFood[]; note?: string }>;

export type ApiDeps = {
  blobs: BlobStore;
  now: () => Date;
  recognizeFoods: FoodRecognizer;
  sendEmailCode: (message: EmailCodeMessage) => Promise<void>;
  sendPush: (messages: readonly PushMessage[]) => Promise<void>;
  verifyAppleToken: (identityToken: string) => Promise<AppleIdentity>;
};

async function sendEmailCodeWithResend({ code, email }: EmailCodeMessage): Promise<void> {
  const key = process.env.AUTH_RESEND_KEY?.trim();
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      // Lets the mobile app sign in against a local server without an email provider.
      console.info(`[api] sign-in code for ${email}: ${code}`);
      return;
    }
    throw new Error("AUTH_RESEND_KEY is not configured");
  }
  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM ?? `${APP_NAME} <onboarding@resend.dev>`,
      subject: `${code} is your ${APP_NAME} code`,
      text: `Your ${APP_NAME} sign-in code is ${code}. It expires in 10 minutes.`,
      to: email,
    }),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Resend rejected the email: ${response.status}`);
  }
}

async function sendExpoPush(messages: readonly PushMessage[]): Promise<void> {
  if (messages.length === 0) {
    return;
  }
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    body: JSON.stringify(messages.map((message) => ({ ...message, sound: "default" }))),
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Expo push failed: ${response.status}`);
  }
}

const vercelBlobStore: BlobStore = {
  async put(pathname, bytes, contentType) {
    const stored = await put(pathname, Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
    return { pathname: stored.pathname, url: stored.url };
  },
  async read(url) {
    const result = await get(url, { access: "private" });
    if (result === null || result.statusCode !== 200 || result.stream === null) {
      return null;
    }
    return { body: result.stream, contentType: result.blob.contentType };
  },
};

async function recognizeWithModel(input: Parameters<FoodRecognizer>[0]) {
  const { recognizeFoodsWithModel } = await import("./recognize-foods.ts");
  return recognizeFoodsWithModel(input);
}

const defaults: ApiDeps = {
  blobs: vercelBlobStore,
  now: () => new Date(),
  recognizeFoods: recognizeWithModel,
  sendEmailCode: sendEmailCodeWithResend,
  sendPush: sendExpoPush,
  verifyAppleToken: verifyAppleIdentityToken,
};

let current: ApiDeps = defaults;

export function apiDeps(): ApiDeps {
  return current;
}

// Tests swap external services (email, push, blob storage, the model) for fakes.
export function setApiDeps(overrides: Partial<ApiDeps>): void {
  current = { ...current, ...overrides };
}

export function resetApiDeps(): void {
  current = defaults;
}
