import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { config } from "dotenv";
import { Client } from "pg";
import { APP_NAME } from "./brand.ts";
import { normalizeCountryCode } from "./countries.ts";
import { parseCountryList } from "./off-country.ts";
import { slimOffDocument, type SlimOffProduct } from "./off-import.ts";
import { resolveDirectDatabaseUrl } from "./prisma-url.ts";

config({ path: ".env.local" });
config();

export const OFF_JSONL_URL = "https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz";
export const OFF_DELTA_INDEX_URL = "https://static.openfoodfacts.org/data/delta/index.txt";
export const OFF_DELTA_BASE_URL = "https://static.openfoodfacts.org/data/delta/";

const BATCH_SIZE = 250;
const STATE_ID = "default";
const LOG_INTERVAL_MS = 5000;

export type ImportMode = "full" | "delta";

export type ImportStats = {
  applied: number;
  countryCodes: string[];
  mode: ImportMode;
  scanned: number;
  skipped: number;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${rest}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${rest}s`;
  }
  return `${rest}s`;
}

export function databaseHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "database";
  }
}

function log(message: string) {
  console.log(`[off-import] ${message}`);
}

type ProgressSnapshot = {
  applied: number;
  scanned: number;
  skipped: number;
};

function createProgress(label: string) {
  const started = Date.now();
  let lastLog = 0;
  let bytes = 0;
  let totalBytes: number | null = null;
  let snapshot: ProgressSnapshot = { applied: 0, scanned: 0, skipped: 0 };

  function line() {
    const elapsed = Date.now() - started;
    const rate = elapsed > 0 ? snapshot.scanned / (elapsed / 1000) : 0;
    const downloaded =
      totalBytes && totalBytes > 0
        ? `${formatBytes(bytes)} / ${formatBytes(totalBytes)}`
        : formatBytes(bytes);
    return `${label}: scanned ${snapshot.scanned.toLocaleString()} | imported ${snapshot.applied.toLocaleString()} | skipped ${snapshot.skipped.toLocaleString()} | ${downloaded} | ${rate.toFixed(0)} docs/s | ${formatDuration(elapsed)}`;
  }

  return {
    setTotalBytes(value: number | null) {
      totalBytes = value;
    },
    addBytes(count: number) {
      bytes += count;
      this.emit(false);
    },
    tick(next: ProgressSnapshot) {
      snapshot = next;
      this.emit(false);
    },
    done(next: ProgressSnapshot) {
      snapshot = next;
      this.emit(true);
    },
    emit(force: boolean) {
      const now = Date.now();
      if (!force && lastLog > 0 && now - lastLog < LOG_INTERVAL_MS) {
        return;
      }
      lastLog = now;
      log(`${line()}${force ? " (done)" : ""}`);
    },
  };
}

export function dedupeByBarcode(rows: SlimOffProduct[]): SlimOffProduct[] {
  const byBarcode = new Map<string, SlimOffProduct>();
  for (const row of rows) {
    const existing = byBarcode.get(row.barcode);
    if (!existing) {
      byBarcode.set(row.barcode, row);
      continue;
    }
    const existingTime = existing.lastModifiedAt?.getTime() ?? -1;
    const nextTime = row.lastModifiedAt?.getTime() ?? -1;
    if (nextTime >= existingTime) {
      byBarcode.set(row.barcode, row);
    }
  }
  return [...byBarcode.values()];
}

export function deltaFilesToApply(indexLines: string[], lastDeltaFile: string | null): string[] {
  const files = indexLines.map((line) => line.trim()).filter((line) => line.length > 0);
  files.sort();
  if (!lastDeltaFile) {
    return files;
  }
  return files.filter((file) => file > lastDeltaFile);
}

export function directDatabaseUrl(): string {
  return resolveDirectDatabaseUrl();
}

export async function resolveImportCountries(client: Client): Promise<string[]> {
  const codes = new Set(parseCountryList(process.env.OFF_IMPORT_COUNTRIES));
  const result = await client.query<{ country: string | null }>(
    `SELECT DISTINCT country FROM "UserProfile" WHERE country IS NOT NULL`,
  );
  for (const row of result.rows) {
    const iso = row.country ? normalizeCountryCode(row.country) : null;
    if (iso) {
      codes.add(iso);
    }
  }
  return [...codes].sort();
}

export async function importOffProducts(mode: ImportMode): Promise<ImportStats> {
  const connectionString = directDatabaseUrl();
  log(`Starting ${mode} import into ${databaseHost(connectionString)}`);
  const client = new Client({ connectionString });
  log("Connecting to Postgres...");
  await client.connect();
  try {
    const countryCodes = await resolveImportCountries(client);
    if (countryCodes.length === 0) {
      throw new Error("No import countries. Set OFF_IMPORT_COUNTRIES or save a user profile country.");
    }
    log(`Countries: ${countryCodes.join(", ")}`);
    const stats: ImportStats = { applied: 0, countryCodes, mode, scanned: 0, skipped: 0 };
    if (mode === "full") {
      log("Downloading full JSONL dump (this can take a while)...");
      await importFromUrl(client, OFF_JSONL_URL, countryCodes, stats, "full dump");
      await client.query(
        `INSERT INTO "OffImportState" ("id", "lastDeltaFile", "lastFullImportAt", "countryCodes", "updatedAt")
         VALUES ($1, NULL, NOW(), $2, NOW())
         ON CONFLICT ("id") DO UPDATE SET
           "lastFullImportAt" = NOW(),
           "countryCodes" = EXCLUDED."countryCodes",
           "updatedAt" = NOW()`,
        [STATE_ID, countryCodes],
      );
      log("Full dump finished. Applying daily deltas...");
    }
    await importDeltas(client, countryCodes, stats);
    return stats;
  } finally {
    await client.end();
  }
}

async function importDeltas(
  client: Client,
  countryCodes: string[],
  stats: ImportStats,
): Promise<void> {
  const state = await client.query<{ lastDeltaFile: string | null }>(
    `SELECT "lastDeltaFile" FROM "OffImportState" WHERE "id" = $1`,
    [STATE_ID],
  );
  const lastDeltaFile = state.rows[0]?.lastDeltaFile ?? null;
  log("Fetching delta index...");
  const indexResponse = await offDownload(OFF_DELTA_INDEX_URL);
  if (!indexResponse.ok) {
    throw new Error(`Open Food Facts delta index failed (${indexResponse.status})`);
  }
  const indexText = await indexResponse.text();
  const files = deltaFilesToApply(indexText.split(/\r?\n/), lastDeltaFile);
  if (files.length === 0) {
    log("No new delta files.");
    return;
  }
  log(`${files.length} delta file${files.length === 1 ? "" : "s"} to apply`);
  let latest = lastDeltaFile;
  let index = 0;
  for (const file of files) {
    index += 1;
    await importFromUrl(
      client,
      `${OFF_DELTA_BASE_URL}${file}`,
      countryCodes,
      stats,
      `delta ${index}/${files.length} ${file}`,
    );
    latest = file;
    await client.query(
      `INSERT INTO "OffImportState" ("id", "lastDeltaFile", "lastFullImportAt", "countryCodes", "updatedAt")
       VALUES ($1, $2, NULL, $3, NOW())
       ON CONFLICT ("id") DO UPDATE SET
         "lastDeltaFile" = EXCLUDED."lastDeltaFile",
         "countryCodes" = EXCLUDED."countryCodes",
         "updatedAt" = NOW()`,
      [STATE_ID, latest, countryCodes],
    );
  }
}

async function importFromUrl(
  client: Client,
  url: string,
  countryCodes: string[],
  stats: ImportStats,
  label: string,
): Promise<void> {
  const progress = createProgress(label);
  let batch: SlimOffProduct[] = [];
  for await (const document of jsonDocuments(url, progress)) {
    stats.scanned += 1;
    const slim = slimOffDocument(document, countryCodes);
    if (!slim) {
      stats.skipped += 1;
      progress.tick({ scanned: stats.scanned, applied: stats.applied, skipped: stats.skipped });
      continue;
    }
    batch.push(slim);
    if (batch.length >= BATCH_SIZE) {
      stats.applied += await upsertBatch(client, batch);
      batch = [];
    }
    progress.tick({ scanned: stats.scanned, applied: stats.applied, skipped: stats.skipped });
  }
  if (batch.length > 0) {
    stats.applied += await upsertBatch(client, batch);
  }
  progress.done({ scanned: stats.scanned, applied: stats.applied, skipped: stats.skipped });
}

async function upsertBatch(client: Client, rows: SlimOffProduct[]): Promise<number> {
  const uniqueRows = dedupeByBarcode(rows);
  const values: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  for (const row of uniqueRows) {
    values.push(
      `($${index++}, $${index++}, $${index++}::jsonb, $${index++}, $${index++}, $${index++}, $${index++}, $${index++}, $${index++}, $${index++}, $${index++}::jsonb, $${index++}, $${index++}::text[], $${index++}, $${index++}, NOW())`,
    );
    params.push(
      row.barcode,
      row.name,
      JSON.stringify(row.names),
      row.brands,
      row.quantity,
      row.servingSize,
      row.nutriscoreGrade,
      row.novaGroup,
      row.ingredients,
      row.allergens,
      JSON.stringify(row.nutriments),
      row.imageUrl,
      row.countryCodes,
      row.searchSource,
      row.lastModifiedAt,
    );
  }
  await client.query(
    `INSERT INTO "OffProduct" (
       "barcode", "name", "names", "brands", "quantity", "servingSize",
       "nutriscoreGrade", "novaGroup", "ingredients", "allergens",
       "nutriments", "imageUrl", "countryCodes", "searchSource",
       "lastModifiedAt", "updatedAt"
     ) VALUES ${values.join(",")}
     ON CONFLICT ("barcode") DO UPDATE SET
       "name" = EXCLUDED."name",
       "names" = EXCLUDED."names",
       "brands" = EXCLUDED."brands",
       "quantity" = EXCLUDED."quantity",
       "servingSize" = EXCLUDED."servingSize",
       "nutriscoreGrade" = EXCLUDED."nutriscoreGrade",
       "novaGroup" = EXCLUDED."novaGroup",
       "ingredients" = EXCLUDED."ingredients",
       "allergens" = EXCLUDED."allergens",
       "nutriments" = EXCLUDED."nutriments",
       "imageUrl" = EXCLUDED."imageUrl",
       "countryCodes" = EXCLUDED."countryCodes",
       "searchSource" = EXCLUDED."searchSource",
       "lastModifiedAt" = EXCLUDED."lastModifiedAt",
       "updatedAt" = EXCLUDED."updatedAt"`,
    params,
  );
  return uniqueRows.length;
}

async function* jsonDocuments(
  url: string,
  progress: ReturnType<typeof createProgress>,
): AsyncGenerator<Record<string, unknown>> {
  log(`Fetching ${url}`);
  const response = await offDownload(url);
  if (!response.ok || !response.body) {
    throw new Error(`Open Food Facts download failed (${response.status}) for ${url}`);
  }
  const lengthHeader = Number(response.headers.get("content-length"));
  const totalBytes = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;
  progress.setTotalBytes(totalBytes);
  log(totalBytes ? `Streaming ${formatBytes(totalBytes)} from ${url}` : `Streaming ${url}`);
  const nodeStream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
  nodeStream.on("data", (chunk: Buffer | string) => {
    progress.addBytes(typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length);
  });
  const input = url.endsWith(".gz") ? nodeStream.pipe(createGunzip()) : nodeStream;
  const lines = createInterface({ input });
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "[" || trimmed === "]") {
      continue;
    }
    const jsonLine = trimmed.endsWith(",") ? trimmed.slice(0, -1) : trimmed;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonLine);
    } catch {
      continue;
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          yield item as Record<string, unknown>;
        }
      }
    } else if (parsed && typeof parsed === "object") {
      yield parsed as Record<string, unknown>;
    }
  }
}

function offDownload(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "*/*",
      "User-Agent": `${APP_NAME}/0.0.0 (off-import)`,
    },
  });
}
