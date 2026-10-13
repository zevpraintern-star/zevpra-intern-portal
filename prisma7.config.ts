import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

/**
 * Prisma ORM 7 configuration.
 *
 * Prisma 7 no longer reads the datasource URL from the schema file, so the CLI
 * (migrate / db push / studio / db seed) resolves it here. Runtime code connects
 * through the `@prisma/adapter-pg` driver adapter (see src/lib/db/prisma.ts).
 *
 * .env.local is loaded first so local development overrides win over .env,
 * mirroring Next.js behaviour. dotenv never overwrites already-set variables.
 */
loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const directUrl = process.env.DIRECT_URL?.trim();
const databaseUrl = directUrl && directUrl.length > 0 ? directUrl : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and configure your PostgreSQL connection string.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
