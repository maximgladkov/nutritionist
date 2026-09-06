import { config } from "dotenv";

const production = process.argv.includes("--production");
const dryRun = process.argv.includes("--dry-run");

config({ path: ".env.local" });
if (production) {
  config({ path: ".env.production.local", override: true });
}

const { backfillUserAttachments } = await import("../lib/backfill-user-attachments.ts");

const result = await backfillUserAttachments({ dryRun });
const target = production ? "production" : "local";
const mode = dryRun ? "dry-run" : "write";
console.log(
  `Attachment backfill (${target}, ${mode}): scanned ${result.scannedTurns} turns, ${result.fileParts} file parts, persisted ${result.persisted}, patched ${result.patchedTurns} turns, skipped ${result.skipped}.`,
);
