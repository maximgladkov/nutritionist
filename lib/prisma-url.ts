const ACCELERATE_PREFIXES = ["prisma://", "prisma+postgres://"] as const;

const RUNTIME_URL_KEYS = ["PRISMA_ACCELERATE_URL", "PRISMA_DATABASE_URL", "DATABASE_URL"] as const;

const DIRECT_URL_KEYS = [
  "DATABASE_URL_UNPOOLED",
  "DATABASE_DIRECT_URL",
  "DIRECT_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "PRISMA_DATABASE_URL",
] as const;

export function isAccelerateUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return ACCELERATE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function resolveRuntimeDatabaseUrl(): string {
  const candidates = RUNTIME_URL_KEYS.map(readEnv).filter((value): value is string => Boolean(value));
  const accelerate = candidates.find(isAccelerateUrl);
  if (accelerate) {
    return accelerate;
  }
  const url = readEnv("DATABASE_URL");
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export function resolveDirectDatabaseUrl(): string {
  const candidates = DIRECT_URL_KEYS.map(readEnv).filter((value): value is string => Boolean(value));
  const direct = candidates.find((url) => !isAccelerateUrl(url));
  if (!direct) {
    throw new Error(
      "No direct Postgres URL found. Set DATABASE_URL_UNPOOLED or DATABASE_DIRECT_URL to a postgres:// connection string.",
    );
  }
  return direct;
}
