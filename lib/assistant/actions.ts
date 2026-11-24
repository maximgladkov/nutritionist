import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.ts";
import { inferMealLabel } from "../meal-label.ts";
import { callerTimezone, deleteMealItem, previewMealItems, upsertMealItems, type MealItemInput, type MealView } from "../meals.ts";
import { prisma } from "../prisma.ts";

export type AssistantCardItem = { amount: number; kcal: number | null; name: string; unit: string };

// A card in the conversation: a meal the assistant logged, or an idea it hasn't.
export type AssistantCard = {
  id: string;
  items: AssistantCardItem[];
  kcal: number | null;
  kind: "idea" | "logged";
  label: string;
  state: string;
};

type CardPayload = { inputs?: MealItemInput[]; items: AssistantCardItem[]; kcal: number | null; label: string };
type ActionRow = { callId: string; id: string; kind: string; payload: Prisma.JsonValue; state: string };

export function cardView(row: ActionRow): AssistantCard {
  const payload = row.payload as unknown as CardPayload;
  return {
    id: row.id,
    items: payload.items,
    kcal: payload.kcal,
    kind: row.kind === "idea" ? "idea" : "logged",
    label: payload.label,
    state: row.state,
  };
}

function totalKcal(items: readonly AssistantCardItem[]): number | null {
  const known = items.flatMap((item) => (item.kcal === null ? [] : [item.kcal]));
  return known.length === 0 ? null : Math.round(known.reduce((sum, kcal) => sum + kcal, 0));
}

// Ids chosen before logging, so the card knows which foods of the meal are its own.
export function withItemIds<T extends MealItemInput>(items: readonly T[]): (T & { id: string })[] {
  return items.map((item) => ({ ...item, id: randomUUID() }));
}

// Remembers what the assistant just logged, so the app can show it with an Undo. The food is logged
// either way: a failure here only costs the card.
export async function recordLogged(input: {
  addedItemIds: readonly string[];
  callId: string;
  meal: MealView;
  sessionId: string;
  userId: string;
}): Promise<AssistantCard | null> {
  const added = new Set(input.addedItemIds);
  const items = input.meal.items
    .filter((item) => added.has(item.id))
    .map((item) => ({ amount: item.amount, kcal: item.metrics.energyKcal, name: item.name, unit: item.unit }));
  const payload: CardPayload = { items, kcal: totalKcal(items), label: input.meal.label };
  try {
    const row = await prisma.assistantAction.upsert({
      create: {
        callId: input.callId,
        kind: "logged",
        mealItemIds: [...added],
        payload: payload as unknown as Prisma.InputJsonValue,
        sessionId: input.sessionId,
        state: "added",
        userId: input.userId,
      },
      update: {},
      where: { userId_callId: { callId: input.callId, userId: input.userId } },
    });
    return cardView(row);
  } catch (error) {
    console.error("assistant action persist failed", error);
    return null;
  }
}

export async function recordIdea(input: {
  callId: string;
  country?: string;
  items: MealItemInput[];
  label?: MealView["label"];
  sessionId: string;
  signal?: AbortSignal;
  userId: string;
}): Promise<{ card: AssistantCard; proteins: number | null }> {
  const preview = await previewMealItems({ country: input.country, items: input.items, signal: input.signal });
  const items = preview.map((item) => ({ amount: item.amount, kcal: item.metrics.energyKcal, name: item.name, unit: item.unit }));
  const label = input.label ?? inferMealLabel(new Date(), (await callerTimezone(input.userId)) ?? "UTC");
  const payload: CardPayload = { inputs: input.items, items, kcal: totalKcal(items), label };
  const row = await prisma.assistantAction.upsert({
    create: {
      callId: input.callId,
      kind: "idea",
      payload: payload as unknown as Prisma.InputJsonValue,
      sessionId: input.sessionId,
      userId: input.userId,
    },
    update: {},
    where: { userId_callId: { callId: input.callId, userId: input.userId } },
  });
  const proteins = preview.flatMap((item) => (item.metrics.proteins === null ? [] : [item.metrics.proteins]));
  return { card: cardView(row), proteins: proteins.length === 0 ? null : Math.round(proteins.reduce((a, b) => a + b, 0)) };
}

async function ownedAction(userId: string, id: string, kind: string) {
  return prisma.assistantAction.findFirst({ where: { id, kind, userId } });
}

// Logs an idea today, once: the tap is the confirmation, and a second tap changes nothing.
export async function addIdea(input: { country?: string; id: string; userId: string }): Promise<AssistantCard | null> {
  const row = await ownedAction(input.userId, input.id, "idea");
  if (!row) {
    return null;
  }
  const claimed = await prisma.assistantAction.updateMany({ data: { state: "added" }, where: { id: row.id, state: "open" } });
  if (claimed.count === 0) {
    const current = await ownedAction(input.userId, input.id, "idea");
    return current ? cardView(current) : null;
  }
  const payload = row.payload as unknown as CardPayload;
  const items = withItemIds(payload.inputs ?? []);
  try {
    await upsertMealItems({ country: input.country, items, label: payload.label as MealView["label"], userId: input.userId });
  } catch (error) {
    await prisma.assistantAction.update({ data: { state: "open" }, where: { id: row.id } });
    throw error;
  }
  return cardView(
    await prisma.assistantAction.update({ data: { mealItemIds: items.map((item) => item.id) }, where: { id: row.id } }),
  );
}

// Takes back what the assistant logged. Foods already removed by hand are simply gone.
export async function undoLogged(input: { id: string; userId: string }): Promise<AssistantCard | null> {
  const row = await ownedAction(input.userId, input.id, "logged");
  if (!row) {
    return null;
  }
  const left = await prisma.mealItem.findMany({
    select: { id: true },
    where: { id: { in: row.mealItemIds }, meal: { userId: input.userId } },
  });
  for (const item of left) {
    await deleteMealItem({ itemId: item.id, userId: input.userId });
  }
  return cardView(await prisma.assistantAction.update({ data: { state: "undone" }, where: { id: row.id } }));
}

export async function recordVoiceNote(input: {
  callId: string;
  durationMs: number;
  levels: number[];
  sessionId: string;
  text: string;
  userId: string;
}): Promise<void> {
  await prisma.assistantAction.upsert({
    create: {
      callId: `voice:${input.callId}`,
      kind: "voice",
      payload: { durationMs: input.durationMs, levels: input.levels, text: input.text },
      sessionId: input.sessionId,
      userId: input.userId,
    },
    update: {},
    where: { userId_callId: { callId: `voice:${input.callId}`, userId: input.userId } },
  });
}
