import { shiftYmd } from "./timezone.ts";

export const NUTRITION_DAYS_MAX = 21;
export const NUTRITION_DAYS_INITIAL = 14;
export const NUTRITION_DAY_TODAY_INDEX = 10_000;

export function ymdForDayIndex(today: string, index: number): string {
  return shiftYmd(today, index - NUTRITION_DAY_TODAY_INDEX);
}

export function dayIndexWindows(
  today: string,
  startIndex: number,
  endIndex: number,
): { from: string; to: string }[] {
  const minIndex = Math.max(0, startIndex);
  const maxIndex = Math.min(NUTRITION_DAY_TODAY_INDEX, endIndex);
  if (minIndex > maxIndex) {
    return [];
  }
  const newestAgo = NUTRITION_DAY_TODAY_INDEX - maxIndex;
  const oldestAgo = NUTRITION_DAY_TODAY_INDEX - minIndex;
  const firstChunk = Math.floor(newestAgo / NUTRITION_DAYS_MAX);
  const lastChunk = Math.floor(oldestAgo / NUTRITION_DAYS_MAX);
  const windows: { from: string; to: string }[] = [];
  for (let chunk = firstChunk; chunk <= lastChunk; chunk += 1) {
    const toAgo = chunk * NUTRITION_DAYS_MAX;
    const fromAgo = Math.min(NUTRITION_DAY_TODAY_INDEX, toAgo + NUTRITION_DAYS_MAX - 1);
    windows.push({
      from: shiftYmd(today, -fromAgo),
      to: shiftYmd(today, -toAgo),
    });
  }
  return windows;
}
