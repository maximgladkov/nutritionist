import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { embedMissingProducts } from "./product-embeddings.ts";

// A tiny stand-in for the two product tables, answering only the queries the backfill sends.
function fakeDatabase(offCount: number) {
  const off = Array.from({ length: offCount }, (_, index) => ({
    embedding: index % 3 === 0 ? "[already]" : null,
    key: `b${String(index).padStart(4, "0")}`,
    text: `product ${index}`,
  }));
  const writes: string[] = [];
  const query = async (sql: string, params: unknown[]) => {
    const table = sql.includes('"OffProduct"') ? off : [];
    const missing = table.filter((row) => row.embedding === null);
    if (sql.startsWith("SELECT count")) return { rows: [{ left: missing.length }] };
    if (sql.startsWith("SELECT")) {
      const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1]);
      return { rows: missing.filter((row) => row.key > String(params[0])).slice(0, limit) };
    }
    const [keys, embeddings] = params as [string[], string[]];
    keys.forEach((key, index) => {
      const row = off.find((entry) => entry.key === key)!;
      assert.equal(row.embedding, null, `${key} was embedded twice`);
      row.embedding = embeddings[index]!;
      writes.push(key);
    });
    return { rows: [] };
  };
  return { off, query, writes };
}

describe("embedMissingProducts", () => {
  it("embeds every missing product once, several batches at a time", async () => {
    const db = fakeDatabase(1000);
    let active = 0;
    let peak = 0;
    const total = await embedMissingProducts(db.query, {
      batchSize: 50,
      concurrency: 4,
      embed: async (texts) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return texts.map(() => [1, 0]);
      },
    });
    assert.equal(total, 666);
    assert.equal(db.off.filter((row) => row.embedding === null).length, 0);
    assert.equal(new Set(db.writes).size, db.writes.length);
    assert.equal(peak, 4);
  });

  it("stops on a failed batch and leaves the rest for the next run", async () => {
    const db = fakeDatabase(200);
    let calls = 0;
    await assert.rejects(
      embedMissingProducts(db.query, {
        batchSize: 20,
        embed: async (texts) => {
          calls += 1;
          if (calls === 3) throw new Error("gateway down");
          return texts.map(() => [1]);
        },
      }),
      /gateway down/,
    );
    const rerun = await embedMissingProducts(db.query, { batchSize: 20, embed: async (texts) => texts.map(() => [1]) });
    assert.equal(rerun, 200 - Math.ceil(200 / 3) - 40);
    assert.equal(db.off.filter((row) => row.embedding === null).length, 0);
  });
});
