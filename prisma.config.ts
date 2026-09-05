import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import { resolveDirectDatabaseUrl } from "./lib/prisma-url.ts";

config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolveDirectDatabaseUrl(),
  },
});
