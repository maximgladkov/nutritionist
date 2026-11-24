import { prisma } from "../prisma.ts";

// First-time actions that nothing else in the database records. A new one is a name here, a call
// to recordAchievementEvent where it happens, and a catalogue entry using the `event:<kind>` metric.
export const ACHIEVEMENT_EVENTS = ["barcode_scan", "voice_note"] as const;
export type AchievementEventKind = (typeof ACHIEVEMENT_EVENTS)[number];

export async function recordAchievementEvent(userId: string, kind: AchievementEventKind): Promise<void> {
  await prisma.achievementEvent.createMany({ data: [{ kind, userId }], skipDuplicates: true });
}
