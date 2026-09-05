import { parseArgs } from "node:util";
import { importOffProducts, type ImportMode } from "../lib/off-import-run.ts";

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    mode: { type: "string", default: "delta" },
  },
  strict: true,
});

const mode = parseMode(values.mode);
const stats = await importOffProducts(mode);
console.log(
  `[off-import] Finished ${stats.mode}: scanned ${stats.scanned.toLocaleString()}, imported ${stats.applied.toLocaleString()}, skipped ${stats.skipped.toLocaleString()}, countries: ${stats.countryCodes.join(",") || "none"}.`,
);

function parseMode(value: string | undefined): ImportMode {
  if (value === "full" || value === "delta") {
    return value;
  }
  throw new Error(`Invalid --mode ${value ?? ""}. Use full or delta.`);
}
