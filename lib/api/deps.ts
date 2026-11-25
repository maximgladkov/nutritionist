import { del, get, put } from "@vercel/blob";
import { APP_NAME } from "../brand.ts";
import type { HomeWriter } from "../assistant/home-words.ts";
import { mintTalkSecret, talkKey } from "../assistant/talk.ts";
import { fatSecretClient, type FatSecretClient } from "../fatsecret.ts";
import { telegramProfileClient, type TelegramProfileClient } from "../telegram-profile.ts";
import { verifyAppleIdentityToken, type AppleIdentity } from "./apple.ts";

export type EmailCodeMessage = { code: string; email: string; locale: string };

export type StoredBlob = { pathname: string; url: string };

export type BlobStore = {
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<StoredBlob>;
  read(url: string): Promise<{ body: ReadableStream<Uint8Array>; contentType: string } | null>;
  remove(url: string): Promise<void>;
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

// One recognized food and the catalog products that might be it, for the AI to choose between.
export type MatchQuestion = {
  amount: number;
  candidates: { brand: string | null; kcalPer100: number | null; name: string; per100: Record<string, number> }[];
  estimate: Record<string, number>;
  name: string;
  unit: "g" | "ml" | "serving";
};

// For each question, the index of the chosen candidate, or null when none is that food.
export type MatchPicker = (questions: readonly MatchQuestion[]) => Promise<(number | null)[]>;

// Speech to text; the language is detected from the audio.
export type AudioTranscriber = (input: { bytes: Uint8Array; mediaType: string }) => Promise<{
  language: string | null;
  text: string;
}>;

export type ApiDeps = {
  // Runs work after the response is sent (embedding a saved food), so requests don't wait on it.
  background: (task: () => Promise<void>) => void;
  blobs: BlobStore;
  // Document embeddings for products; an empty array when embeddings are unavailable.
  embedDocuments: (texts: readonly string[]) => Promise<number[][]>;
  // Query embeddings for meaning-based search; an empty array when embeddings are unavailable.
  embedTexts: (texts: readonly string[]) => Promise<number[][]>;
  fatSecret: FatSecretClient;
  now: () => Date;
  pickMatches: MatchPicker;
  recognizeFoods: FoodRecognizer;
  sendEmailCode: (message: EmailCodeMessage) => Promise<void>;
  sendPush: (messages: readonly PushMessage[]) => Promise<void>;
  // A one-time key for the phone to open a live voice session; null when talking isn't set up.
  talk: { available: () => boolean; mintSecret: () => Promise<{ expiresAt: number; token: string }> };
  // Queues the FatSecret history import as a background workflow.
  startFatSecretImport: (userId: string) => Promise<void>;
  telegram: TelegramProfileClient;
  transcribe: AudioTranscriber;
  verifyAppleToken: (identityToken: string) => Promise<AppleIdentity>;
  // Words the coach's message on Today, from facts already worked out.
  writeHome: HomeWriter;
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
  async remove(url) {
    await del(url);
  },
};

async function recognizeWithModel(input: Parameters<FoodRecognizer>[0]) {
  const { recognizeFoodsWithModel } = await import("./recognize-foods.ts");
  return recognizeFoodsWithModel(input);
}

async function embedWithGateway(texts: readonly string[]): Promise<number[][]> {
  const { canEmbed, embedTexts } = await import("../product-embeddings.ts");
  return canEmbed() ? embedTexts(texts, { purpose: "query", signal: AbortSignal.timeout(5_000) }) : [];
}

async function embedDocumentsWithGateway(texts: readonly string[]): Promise<number[][]> {
  const { canEmbed, embedTexts } = await import("../product-embeddings.ts");
  return canEmbed() ? embedTexts(texts, { purpose: "document", signal: AbortSignal.timeout(15_000) }) : [];
}

function logBackgroundFailure(error: unknown): void {
  console.warn("api: background task failed", error);
}

// Next's after() keeps the serverless function alive until the task is done. Outside a request
// (scripts, the agent service) it throws, and the task simply runs now. Loaded lazily, with the
// explicit .js path, because this module is also loaded by plain Node, which can't resolve
// "next/server".
function runAfterResponse(task: () => Promise<void>): void {
  void import("next/server.js")
    .then(({ after }) => after(() => task().catch(logBackgroundFailure)))
    .catch(() => task().catch(logBackgroundFailure));
}

async function startFatSecretImportWorkflow(userId: string): Promise<void> {
  const [{ start }, { fatSecretImportWorkflow }] = await Promise.all([
    import("workflow/api"),
    import("../../workflows/fatsecret-import.ts"),
  ]);
  await start(fatSecretImportWorkflow, [userId]);
}

async function transcribeWithModel(input: Parameters<AudioTranscriber>[0]) {
  const { transcribeWithGateway } = await import("./transcribe-audio.ts");
  return transcribeWithGateway(input);
}

async function pickWithModel(questions: readonly MatchQuestion[]) {
  const { pickMatchesWithModel } = await import("./pick-matches.ts");
  return pickMatchesWithModel(questions);
}

async function writeHomeWithModel(input: Parameters<HomeWriter>[0]) {
  const { writeHomeWords } = await import("../assistant/home-words.ts");
  return writeHomeWords(input);
}

const defaults: ApiDeps = {
  background: runAfterResponse,
  blobs: vercelBlobStore,
  embedDocuments: embedDocumentsWithGateway,
  embedTexts: embedWithGateway,
  fatSecret: fatSecretClient,
  now: () => new Date(),
  pickMatches: pickWithModel,
  recognizeFoods: recognizeWithModel,
  sendEmailCode: sendEmailCodeWithResend,
  sendPush: sendExpoPush,
  startFatSecretImport: startFatSecretImportWorkflow,
  talk: { available: () => talkKey() !== null, mintSecret: mintTalkSecret },
  telegram: telegramProfileClient,
  transcribe: transcribeWithModel,
  verifyAppleToken: verifyAppleIdentityToken,
  writeHome: writeHomeWithModel,
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
