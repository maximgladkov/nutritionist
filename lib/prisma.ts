import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { PrismaPg } from "@prisma/adapter-pg";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "../generated/prisma/client.ts";
import { isAccelerateUrl, resolveRuntimeDatabaseUrl } from "./prisma-url.ts";

const runtimeDatabaseUrl = resolveRuntimeDatabaseUrl();

export const usingAccelerate = isAccelerateUrl(runtimeDatabaseUrl);

function createPrisma(): PrismaClient {
  if (usingAccelerate) {
    return new PrismaClient({ accelerateUrl: runtimeDatabaseUrl }).$extends(
      withAccelerate(),
    ) as unknown as PrismaClient;
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeDatabaseUrl }) });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function hasRequiredModels(client: PrismaClient | undefined): client is PrismaClient {
  return (
    typeof client?.agentTurn?.findUnique === "function" &&
    typeof client?.agentTurnPendingAck?.findFirst === "function" &&
    typeof client?.offProduct?.findUnique === "function" &&
    typeof client?.productFavorite?.findMany === "function"
  );
}

function getPrisma(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (hasRequiredModels(cached)) {
    return cached;
  }
  const created = createPrisma();
  if (!hasRequiredModels(created)) {
    throw new Error("Prisma client is missing models. Restart the eve runtime after prisma generate.");
  }
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = created;
  }
  return created;
}

export const prisma = getPrisma();
