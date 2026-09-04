import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  drainAgentTurnPersist,
  enqueueAgentTurnPersist,
  resetAgentTurnPersistQueue,
} from "./agent-turn-persist.ts";

describe("enqueueAgentTurnPersist", () => {
  it("runs overlapping patches on the same turn in order", async () => {
    resetAgentTurnPersistQueue();
    const order: number[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void enqueueAgentTurnPersist("session", "turn", async () => {
      order.push(1);
      await gate;
      order.push(2);
    });
    void enqueueAgentTurnPersist("session", "turn", async () => {
      order.push(3);
    });
    await Promise.resolve();
    assert.deepEqual(order, [1]);
    release?.();
    await drainAgentTurnPersist("session", "turn");
    assert.deepEqual(order, [1, 2, 3]);
  });

  it("keeps later work after an earlier patch fails", async () => {
    resetAgentTurnPersistQueue();
    const order: number[] = [];
    void enqueueAgentTurnPersist("session", "turn", async () => {
      order.push(1);
      throw new Error("persist failed");
    });
    void enqueueAgentTurnPersist("session", "turn", async () => {
      order.push(2);
    });
    await drainAgentTurnPersist("session", "turn");
    assert.deepEqual(order, [1, 2]);
  });
});
