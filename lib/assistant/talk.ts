import { prisma } from "../prisma.ts";

export const TALK_MODEL = "openai/gpt-live-1";
export const TALK_WEBSOCKET_URL = "wss://ai-gateway.vercel.sh/v1/live/sessions";
// Live sessions bill every second, silence included, so the app hangs up after this long. The audio
// goes straight from the phone to the gateway, so only the number of calls is enforced here.
export const TALK_MAX_SECONDS = 10 * 60;
export const TALK_HOURLY_CALLS = 12;
export const TALK_DAILY_CALLS = 25;

export const TALK_INSTRUCTIONS = `You are the voice of the personal coach in Btr.me, a food diary app. Speak the language the user is speaking, and switch only when they switch; foods or results in another language don't change it, so say those results in the user's language. You can hold a natural conversation, but you can't see their diary, goals, foods or weight, remember past calls, or change anything yourself. For anything beyond greetings and small talk, including every question about food, nutrition, calories, plans, weight or health, delegate to the application right away and briefly acknowledge it while it works. Never guess a number and never say something was logged or added unless the application says so. When the result arrives, say it naturally in your own words and keep every reply short. If the application suggests a meal, ask whether to add it, then delegate whatever the user replies, even a single word. Never answer for the user. If the user mentions an emergency or harming themselves, tell them to call local emergency services now.`;

// The gateway only takes a real key for live sessions, not Vercel's OIDC token.
export function talkKey(): string | null {
  return process.env.AI_GATEWAY_API_KEY?.trim() || null;
}

export type TalkSecret = { expiresAt: number; token: string };

export async function mintTalkSecret(): Promise<TalkSecret> {
  const key = talkKey();
  if (!key) {
    throw new Error("AI_GATEWAY_API_KEY is not configured");
  }
  const response = await fetch("https://ai-gateway.vercel.sh/v1/realtime/client-secrets", {
    body: JSON.stringify({ model: TALK_MODEL, routeKind: "live" }),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`The gateway refused a talk secret: ${response.status}`);
  }
  const { expiresAt, token } = (await response.json()) as TalkSecret;
  return { expiresAt, token };
}

// Books a call before it's paid for; null once this person has had enough of them. One at a time
// per person, so calls started together can't slip past the limit.
export async function bookTalk(userId: string, callId: string, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const since = (ms: number) =>
      tx.assistantAction.count({ where: { createdAt: { gt: new Date(now.getTime() - ms) }, kind: "talk", userId } });
    if ((await since(3_600_000)) >= TALK_HOURLY_CALLS || (await since(86_400_000)) >= TALK_DAILY_CALLS) {
      return false;
    }
    await tx.assistantAction.create({ data: { callId, createdAt: now, kind: "talk", payload: {}, userId } });
    return true;
  });
}
