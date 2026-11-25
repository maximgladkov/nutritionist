// Where the time goes in the last app turns. Reads only, and prints times and tool names, never what
// was said. Run where DATABASE_URL points at the database to look at:
//   node scripts/timings/turns.mjs
import { createRequire } from "node:module";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
const { Pool } = createRequire(import.meta.url)("pg");
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await db.query(
  `select "startedAt" at time zone 'UTC' as "startedAt","endedAt" at time zone 'UTC' as "endedAt",status,"inputTokens","outputTokens",messages from "AgentTurn" where channel='app' order by "startedAt" desc limit 8`,
);
for (const row of rows) {
  const start = new Date(row.startedAt).getTime();
  const at = (value) => ((new Date(value).getTime() - start) / 1000).toFixed(1).padStart(5);
  const items = row.messages.items ?? [];
  console.log(`\n${row.startedAt.toISOString().slice(5, 16)} ${row.status} total ${row.endedAt ? at(row.endedAt) : "?"}s  in ${row.inputTokens} out ${row.outputTokens} tokens, ${(row.messages.steps ?? []).length} model calls`);
  for (const step of row.messages.steps ?? []) {
    console.log(`         call ${step.stepIndex}: ${step.inputTokens} in, ${step.cacheReadTokens} of them cached, ${step.outputTokens} out`);
  }
  for (const item of items) {
    const what = item.type === "tool" ? item.toolName : item.type === "assistant" ? `says (${item.finishReason})` : item.type;
    console.log(`  ${at(item.at)}s  ${what}`);
  }
}
await db.end();
