import { config as loadDotenv } from "dotenv";

/**
 * Daily retention sweep: removes rows that are older than their retention
 * thresholds (see src/server/jobs/retention.ts). Runs as a cron job, e.g.
 *
 *   0 0 * * * cd /app && npm run retention
 *
 * Audit logs are intentionally not touched: they are an immutable security trail.
 */
loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

async function main(): Promise<void> {
  const { runRetention } = await import("../src/server/jobs/retention");
  const results = await runRetention();
  console.log("[retention] sweep complete", JSON.stringify(results));
}

main().catch((error) => {
  console.error("[retention] sweep failed", error);
  process.exit(1);
});
