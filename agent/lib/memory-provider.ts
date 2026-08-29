import { defineMemoryProvider } from "eve/memory";
import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  emptyMemoryFile,
  formatRecall,
  parseMemoryFile,
  serializeMemoryFile,
  type MemoryFile,
} from "../../lib/memory-format";
import { prisma } from "../../lib/prisma";

function scopeUserId(value: string | readonly string[]): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function readFile(
  userId: string,
  slot: string,
  signal: AbortSignal,
): Promise<{ file: MemoryFile; version: number } | null> {
  signal.throwIfAborted();
  const row = await prisma.memoryDocument.findUnique({
    where: { userId_slot: { userId, slot } },
  });
  if (!row) {
    return null;
  }
  return { file: parseMemoryFile(row.content), version: row.version };
}

async function writeFile(input: {
  expectedVersion: number | null;
  file: MemoryFile;
  scopeKey: string;
  signal: AbortSignal;
  slot: string;
  userId: string;
}): Promise<void> {
  input.signal.throwIfAborted();
  const content = serializeMemoryFile(input.file);
  if (input.expectedVersion === null) {
    try {
      await prisma.memoryDocument.create({
        data: {
          content,
          scopeKey: input.scopeKey,
          slot: input.slot,
          userId: input.userId,
          version: 1,
        },
      });
      return;
    } catch {
      throw new Error(`Memory write conflict for ${input.userId}`);
    }
  }
  const updated = await prisma.memoryDocument.updateMany({
    where: { userId: input.userId, slot: input.slot, version: input.expectedVersion },
    data: { content, scopeKey: input.scopeKey, version: { increment: 1 } },
  });
  if (updated.count !== 1) {
    throw new Error(`Memory write conflict for ${input.userId}`);
  }
}

export function prismaMemoryProvider() {
  return defineMemoryProvider({
    recall: {
      async "turn.started"(ctx: {
        abortSignal: AbortSignal;
        memory: { scope: { value: string | readonly string[] }; slot: string };
      }) {
        const userId = scopeUserId(ctx.memory.scope.value);
        if (!userId) {
          return null;
        }
        const stored = await readFile(userId, ctx.memory.slot, ctx.abortSignal);
        return {
          messages: [
            {
              content: formatRecall(ctx.memory.slot, stored?.file ?? emptyMemoryFile()),
              id: "profile-memory-document",
            },
          ],
        };
      },
      async "compaction.completed"(ctx: {
        abortSignal: AbortSignal;
        memory: { scope: { value: string | readonly string[] }; slot: string };
      }) {
        const userId = scopeUserId(ctx.memory.scope.value);
        if (!userId) {
          return null;
        }
        const stored = await readFile(userId, ctx.memory.slot, ctx.abortSignal);
        return {
          messages: [
            {
              content: formatRecall(ctx.memory.slot, stored?.file ?? emptyMemoryFile()),
              id: "profile-memory-document",
            },
          ],
        };
      },
    },
    async tools(ctx: {
      memory: { scope: { key: string; value: string | readonly string[] }; slot: string };
    }) {
      const userId = scopeUserId(ctx.memory.scope.value);
      if (!userId) {
        return null;
      }
      const slot = ctx.memory.slot;
      const scopeKey = ctx.memory.scope.key;
      return {
        remove_memory: defineTool({
          description:
            "Remove one persistent memory by the index shown in recalled memory. Use when it is wrong, outdated, or no longer needed.",
          inputSchema: z.object({ index: z.number().int().min(0) }),
          async execute({ index }, toolCtx) {
            const stored = await readFile(userId, slot, toolCtx.abortSignal);
            if (!stored) {
              return { removed: false };
            }
            const entries = stored.file.entries.filter((entry) => entry.index !== index);
            if (entries.length === stored.file.entries.length) {
              return { removed: false };
            }
            await writeFile({
              expectedVersion: stored.version,
              file: { ...stored.file, entries },
              scopeKey,
              signal: toolCtx.abortSignal,
              slot,
              userId,
            });
            return { removed: true };
          },
        }),
        save_memory: defineTool({
          description:
            "Save one concise, stable fact or preference for future conversations. Omit secrets, instructions, and current-task details.",
          inputSchema: z.object({ text: z.string().min(1) }),
          async execute({ text }, toolCtx) {
            const normalized = text.trim().replaceAll(/\s+/g, " ");
            const stored = await readFile(userId, slot, toolCtx.abortSignal);
            const current = stored?.file ?? emptyMemoryFile();
            if (current.entries.some((entry) => entry.text === normalized)) {
              return { saved: false };
            }
            const lastAllocatedIndex = current.lastAllocatedIndex + 1;
            await writeFile({
              expectedVersion: stored?.version ?? null,
              file: {
                lastAllocatedIndex,
                entries: [...current.entries, { index: lastAllocatedIndex, text: normalized }],
              },
              scopeKey,
              signal: toolCtx.abortSignal,
              slot,
              userId,
            });
            return { saved: true };
          },
        }),
      };
    },
  });
}
