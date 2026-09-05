import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isAccelerateUrl, resolveDirectDatabaseUrl, resolveRuntimeDatabaseUrl } from "./prisma-url.ts";

const MANAGED_KEYS = [
  "DATABASE_DIRECT_URL",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "DIRECT_URL",
  "POSTGRES_URL",
  "PRISMA_ACCELERATE_URL",
  "PRISMA_DATABASE_URL",
] as const;

const original = new Map<string, string | undefined>(
  MANAGED_KEYS.map((key) => [key, process.env[key]]),
);

function setEnv(values: Partial<Record<(typeof MANAGED_KEYS)[number], string | undefined>>) {
  for (const key of MANAGED_KEYS) {
    const next = key in values ? values[key] : undefined;
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }
}

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    const value = original.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("prisma urls", () => {
  it("detects Accelerate connection strings", () => {
    assert.equal(isAccelerateUrl("prisma://accelerate.prisma-data.net/?api_key=abc"), true);
    assert.equal(isAccelerateUrl("prisma+postgres://accelerate.prisma-data.net/?api_key=abc"), true);
    assert.equal(isAccelerateUrl("postgres://user:pass@db.prisma.io:5432/postgres"), false);
    assert.equal(isAccelerateUrl("postgresql://localhost:5432/nutritionist"), false);
  });

  it("prefers an Accelerate URL at runtime", () => {
    setEnv({
      DATABASE_URL: "postgresql://localhost:5432/nutritionist",
      PRISMA_ACCELERATE_URL: "prisma+postgres://accelerate.prisma-data.net/?api_key=abc",
      PRISMA_DATABASE_URL: "postgres://user:pass@db.prisma.io:5432/postgres",
    });
    assert.equal(
      resolveRuntimeDatabaseUrl(),
      "prisma+postgres://accelerate.prisma-data.net/?api_key=abc",
    );
  });

  it("uses DATABASE_URL when no Accelerate URL is set", () => {
    setEnv({
      DATABASE_URL: "postgresql://localhost:5432/nutritionist",
      PRISMA_DATABASE_URL: "postgres://user:pass@db.prisma.io:5432/postgres",
    });
    assert.equal(resolveRuntimeDatabaseUrl(), "postgresql://localhost:5432/nutritionist");
  });

  it("skips Accelerate URLs when resolving a direct connection", () => {
    setEnv({
      DATABASE_URL: "prisma+postgres://accelerate.prisma-data.net/?api_key=abc",
      DATABASE_URL_UNPOOLED: "postgres://user:pass@db.prisma.io:5432/postgres",
    });
    assert.equal(resolveDirectDatabaseUrl(), "postgres://user:pass@db.prisma.io:5432/postgres");
  });

  it("rejects a missing direct URL", () => {
    setEnv({
      DATABASE_URL: "prisma://accelerate.prisma-data.net/?api_key=abc",
    });
    assert.throws(() => resolveDirectDatabaseUrl(), /No direct Postgres URL found/);
  });
});
