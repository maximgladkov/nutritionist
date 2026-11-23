import type { MonthImportResult } from "../lib/fatsecret-import.ts";

// Imports a user's FatSecret history in the background, newest month first, one durable step per
// month: a failed month is retried on its own, and progress is saved as each month lands.

async function beginStep(userId: string): Promise<string> {
  "use step";
  const { beginFatSecretImport } = await import("../lib/fatsecret-import.ts");
  return beginFatSecretImport(userId);
}

async function importMonthStep(userId: string, month: string): Promise<MonthImportResult> {
  "use step";
  const { importFatSecretMonth } = await import("../lib/fatsecret-import.ts");
  return importFatSecretMonth(userId, month);
}

async function finishStep(userId: string, error?: string): Promise<void> {
  "use step";
  const { finishFatSecretImport } = await import("../lib/fatsecret-import.ts");
  await finishFatSecretImport(userId, error);
}

async function limitsStep(): Promise<{ emptyToStop: number; maxMonths: number }> {
  "use step";
  const { FATSECRET_EMPTY_MONTHS_TO_STOP, FATSECRET_MAX_MONTHS } = await import("../lib/fatsecret-import.ts");
  return { emptyToStop: FATSECRET_EMPTY_MONTHS_TO_STOP, maxMonths: FATSECRET_MAX_MONTHS };
}

function monthBefore(from: string, offset: number): string {
  const [year, month] = from.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1 - offset, 1)).toISOString().slice(0, 7);
}

export async function fatSecretImportWorkflow(userId: string) {
  "use workflow";
  const currentMonth = await beginStep(userId);
  const { emptyToStop, maxMonths } = await limitsStep();
  let empty = 0;
  try {
    for (let offset = 0; offset < maxMonths && empty < emptyToStop; offset += 1) {
      const result = await importMonthStep(userId, monthBefore(currentMonth, offset));
      empty = result.oldestDate === null ? empty + 1 : 0;
    }
  } catch (error) {
    await finishStep(userId, error instanceof Error ? error.message : String(error));
    return { ok: false };
  }
  await finishStep(userId);
  return { ok: true };
}
