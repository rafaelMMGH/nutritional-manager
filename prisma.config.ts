import { defineConfig, env } from "prisma/config";

// The Prisma CLI doesn't read Next's .env.local on its own.
process.loadEnvFile?.(".env.local");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") }
});
