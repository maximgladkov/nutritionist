export const BACKFILL_LOOKUP_DELAY_MS = 250;

export type BackfillMealItemImagesStore = {
  listBarcodesMissingImage: () => Promise<string[]>;
  setImageUrl: (barcode: string, imageUrl: string) => Promise<number>;
};

export type BackfillMealItemImagesLookup = (barcode: string) => Promise<{
  found: boolean;
  imageUrl?: string | null;
}>;

export type BackfillMealItemImagesResult = {
  lookedUp: number;
  skipped: number;
  updated: number;
};

export async function backfillMealItemImages(input: {
  delayMs?: number;
  lookup: BackfillMealItemImagesLookup;
  sleep?: (ms: number) => Promise<void>;
  store: BackfillMealItemImagesStore;
}): Promise<BackfillMealItemImagesResult> {
  const delayMs = input.delayMs ?? BACKFILL_LOOKUP_DELAY_MS;
  const sleep = input.sleep ?? defaultSleep;
  const barcodes = await input.store.listBarcodesMissingImage();
  let skipped = 0;
  let updated = 0;
  for (const [index, barcode] of barcodes.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
    let imageUrl: string | null | undefined;
    try {
      const result = await input.lookup(barcode);
      imageUrl = result.found ? (result.imageUrl ?? null) : null;
    } catch (error) {
      if (isSkipBarcodeError(error)) {
        skipped += 1;
        continue;
      }
      throw error;
    }
    if (!imageUrl) {
      skipped += 1;
      continue;
    }
    updated += await input.store.setImageUrl(barcode, imageUrl);
  }
  return { lookedUp: barcodes.length, skipped, updated };
}

function isSkipBarcodeError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "InvalidBarcodeError"
  );
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
