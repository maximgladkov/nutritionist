import { config } from "dotenv";
import { Client } from "pg";
import { canEmbed, embedMissingProducts } from "../lib/product-embeddings.ts";
import { resolveDirectDatabaseUrl } from "../lib/prisma-url.ts";
import { downloadUsdaFoods, parseUsdaFood, upsertGenericFoods } from "../lib/usda-import.ts";

// Loads the USDA generic foods (fried egg, toast, brewed coffee…) and embeds them for
// meaning-based search. Safe to rerun.
config({ path: ".env.local" });
config();

const log = (message: string) => console.log(`[usda] ${message}`);
const foods = await downloadUsdaFoods(log);
const rows = foods.flatMap((food) => parseUsdaFood(food) ?? []);
log(`${rows.length.toLocaleString()} of ${foods.length.toLocaleString()} foods have nutrition`);

const client = new Client({ connectionString: resolveDirectDatabaseUrl() });
await client.connect();
try {
  await upsertGenericFoods((sql, params) => client.query(sql, params), rows);
  log("Saved.");
  if (canEmbed()) {
    await embedMissingProducts((sql, params) => client.query(sql, params), { log });
  } else {
    log("Skipping embeddings: set AI_GATEWAY_API_KEY, then run yarn db:embed-products.");
  }
} finally {
  await client.end();
}
