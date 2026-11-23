import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "prisma/config";

if (existsSync(".env")) loadEnvFile(".env");

const developmentUrl = "file:.local/schema-development.sqlite";
const databaseUrl = process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Preserve the scratch database selected by the previous .env.example.
    url: !databaseUrl || databaseUrl === "file:../.local/schema-development.sqlite"
      ? developmentUrl
      : databaseUrl,
  },
});
