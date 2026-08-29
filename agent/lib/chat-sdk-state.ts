import type { Lock, QueueEntry, StateAdapter } from "chat";
import { prisma } from "../../lib/prisma";

type StoredLock = {
  expiresAt: number;
  threadId: string;
  token: string;
};

function isExpired(expiresAt: Date | null): boolean {
  return expiresAt !== null && expiresAt.getTime() <= Date.now();
}

export function createPrismaChatState(): StateAdapter {
  return {
    async connect() {},
    async disconnect() {},
    async get<T = unknown>(key: string): Promise<T | null> {
      const row = await prisma.chatSdkEntry.findUnique({ where: { key: `kv:${key}` } });
      if (!row || isExpired(row.expiresAt)) {
        return null;
      }
      return row.value as T;
    },
    async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
      const expiresAt = ttlMs === undefined ? null : new Date(Date.now() + ttlMs);
      await prisma.chatSdkEntry.upsert({
        where: { key: `kv:${key}` },
        create: { key: `kv:${key}`, value: value as never, expiresAt },
        update: { value: value as never, expiresAt },
      });
    },
    async setIfNotExists(key: string, value: unknown, ttlMs?: number): Promise<boolean> {
      const existing = await this.get(key);
      if (existing !== null) {
        return false;
      }
      await this.set(key, value, ttlMs);
      return true;
    },
    async delete(key: string): Promise<void> {
      await prisma.chatSdkEntry.deleteMany({ where: { key: `kv:${key}` } });
    },
    async subscribe(threadId: string): Promise<void> {
      await prisma.chatSdkEntry.upsert({
        where: { key: `sub:${threadId}` },
        create: { key: `sub:${threadId}`, value: true },
        update: { value: true, expiresAt: null },
      });
    },
    async unsubscribe(threadId: string): Promise<void> {
      await prisma.chatSdkEntry.deleteMany({ where: { key: `sub:${threadId}` } });
    },
    async isSubscribed(threadId: string): Promise<boolean> {
      const row = await prisma.chatSdkEntry.findUnique({ where: { key: `sub:${threadId}` } });
      return Boolean(row) && !isExpired(row?.expiresAt ?? null);
    },
    async acquireLock(threadId: string, ttlMs: number): Promise<Lock | null> {
      const key = `lock:${threadId}`;
      const now = Date.now();
      const existing = await prisma.chatSdkEntry.findUnique({ where: { key } });
      const lock = existing?.value as StoredLock | undefined;
      if (existing && !isExpired(existing.expiresAt) && lock && lock.expiresAt > now) {
        return null;
      }
      const next: StoredLock = {
        expiresAt: now + ttlMs,
        threadId,
        token: crypto.randomUUID(),
      };
      await prisma.chatSdkEntry.upsert({
        where: { key },
        create: { key, value: next as never, expiresAt: new Date(next.expiresAt) },
        update: { value: next as never, expiresAt: new Date(next.expiresAt) },
      });
      return next;
    },
    async forceReleaseLock(threadId: string): Promise<void> {
      await prisma.chatSdkEntry.deleteMany({ where: { key: `lock:${threadId}` } });
    },
    async releaseLock(lock: Lock): Promise<void> {
      const key = `lock:${lock.threadId}`;
      const existing = await prisma.chatSdkEntry.findUnique({ where: { key } });
      const stored = existing?.value as StoredLock | undefined;
      if (stored?.token === lock.token) {
        await prisma.chatSdkEntry.deleteMany({ where: { key } });
      }
    },
    async extendLock(lock: Lock, ttlMs: number): Promise<boolean> {
      const key = `lock:${lock.threadId}`;
      const existing = await prisma.chatSdkEntry.findUnique({ where: { key } });
      const stored = existing?.value as StoredLock | undefined;
      if (!stored || stored.token !== lock.token || isExpired(existing?.expiresAt ?? null)) {
        return false;
      }
      const expiresAt = Date.now() + ttlMs;
      await prisma.chatSdkEntry.update({
        where: { key },
        data: {
          value: { ...stored, expiresAt } as never,
          expiresAt: new Date(expiresAt),
        },
      });
      return true;
    },
    async appendToList(
      key: string,
      value: unknown,
      options?: { maxLength?: number; ttlMs?: number },
    ): Promise<void> {
      const listKey = `list:${key}`;
      const row = await prisma.chatSdkEntry.findUnique({ where: { key: listKey } });
      const list = Array.isArray(row?.value) ? [...(row.value as unknown[])] : [];
      list.push(value);
      const trimmed =
        options?.maxLength === undefined ? list : list.slice(-options.maxLength);
      const expiresAt =
        options?.ttlMs === undefined ? null : new Date(Date.now() + options.ttlMs);
      await prisma.chatSdkEntry.upsert({
        where: { key: listKey },
        create: { key: listKey, value: trimmed as never, expiresAt },
        update: { value: trimmed as never, expiresAt },
      });
    },
    async getList<T = unknown>(key: string): Promise<T[]> {
      const row = await prisma.chatSdkEntry.findUnique({ where: { key: `list:${key}` } });
      if (!row || isExpired(row.expiresAt) || !Array.isArray(row.value)) {
        return [];
      }
      return row.value as T[];
    },
    async enqueue(threadId: string, entry: QueueEntry, maxSize: number): Promise<number> {
      const key = `queue:${threadId}`;
      const row = await prisma.chatSdkEntry.findUnique({ where: { key } });
      const queue = Array.isArray(row?.value) ? [...(row.value as unknown[])] : [];
      queue.push(entry);
      const trimmed = queue.slice(-maxSize);
      await prisma.chatSdkEntry.upsert({
        where: { key },
        create: { key, value: trimmed as never },
        update: { value: trimmed as never },
      });
      return trimmed.length;
    },
    async dequeue(threadId: string): Promise<QueueEntry | null> {
      const key = `queue:${threadId}`;
      const row = await prisma.chatSdkEntry.findUnique({ where: { key } });
      const queue = Array.isArray(row?.value) ? [...(row.value as unknown[])] : [];
      const now = Date.now();
      while (queue.length > 0) {
        const next = queue.shift() as QueueEntry;
        if (next && next.expiresAt > now) {
          await prisma.chatSdkEntry.upsert({
            where: { key },
            create: { key, value: queue as never },
            update: { value: queue as never },
          });
          return next;
        }
      }
      await prisma.chatSdkEntry.upsert({
        where: { key },
        create: { key, value: [] as never },
        update: { value: [] as never },
      });
      return null;
    },
    async queueDepth(threadId: string): Promise<number> {
      const row = await prisma.chatSdkEntry.findUnique({ where: { key: `queue:${threadId}` } });
      return Array.isArray(row?.value) ? row.value.length : 0;
    },
  };
}
