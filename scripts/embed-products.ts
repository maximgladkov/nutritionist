import { parseArgs } from "node:util";
import { config } from "dotenv";
import { Pool } from "pg";
import { embedMissingProducts } from "../lib/product-embeddings.ts";
import { resolveDirectDatabaseUrl } from "../lib/prisma-url.ts";

// Backfills product embeddings (the import also embeds new products after each run). Several
// batches run at once; stop it any time and rerun to continue.
config({ path: ".env.local" });
config();

const { values } = parseArgs({
  options: {
    "batch-size": { default: "250", type: "string" },
    concurrency: { default: "6", type: "string" },
  },
  strict: true,
});
const concurrency = Number(values.concurrency);
const batchSize = Number(values["batch-size"]);

// One connection per batch in flight, plus one for finding the next batch.
const pool = new Pool({ connectionString: resolveDirectDatabaseUrl(), max: concurrency + 1 });
try {
  const total = await embedMissingProducts((sql, params) => pool.query(sql, params), {
    batchSize,
    concurrency,
    log: (message) => console.log(`[embed] ${message}`),
  });
  console.log(`[embed] Done: ${total.toLocaleString()} products embedded.`);
} finally {
  await pool.end();
}
