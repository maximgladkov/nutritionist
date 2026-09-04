import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function hasAgentTurn(client: PrismaClient | undefined): client is PrismaClient {
  return (
    typeof client?.agentTurn?.findUnique === "function" &&
    typeof client?.agentTurnPendingAck?.findFirst === "function"
  );
}

function getPrisma(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (hasAgentTurn(cached)) {
    return cached;
  }
  const created = createPrisma();
  if (!hasAgentTurn(created)) {
    throw new Error("Prisma client is missing AgentTurn. Restart the eve runtime after prisma generate.");
  }
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = created;
  }
  return created;
}

export const prisma = getPrisma();
