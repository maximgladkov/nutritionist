import { config } from "dotenv";
import { Client } from "pg";
import { embedMissingProducts } from "../lib/product-embeddings.ts";
import { resolveDirectDatabaseUrl } from "../lib/prisma-url.ts";

// Backfills product embeddings (the import also does this after each run).
config({ path: ".env.local" });
config();

const client = new Client({ connectionString: resolveDirectDatabaseUrl() });
await client.connect();
try {
  const total = await embedMissingProducts((sql, params) => client.query(sql, params), (message) => console.log(`[embed] ${message}`));
  console.log(`[embed] Done: ${total.toLocaleString()} products embedded.`);
} finally {
  await client.end();
}
