/**
 * Standalone background-job worker:  npm run worker
 * Run it next to the web app (or as its own container) so emails, certificate PDFs and
 * repository checks are processed even when nobody is browsing. It is safe to run several
 * copies: each job is claimed atomically.
 */
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

async function main() {
  const { recoverStuckJobs, runDueJobs } = await import("../src/server/jobs/runner");
  let stop = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stop = true; });
  console.log("[worker] started");
  let tick = 0;
  while (!stop) {
    try {
      if (tick % 30 === 0) {
        const recovered = await recoverStuckJobs();
        if (recovered) console.log(`[worker] re-queued ${recovered} stuck job(s)`);
      }
      const processed = await runDueJobs(20);
      if (processed > 0) console.log(`[worker] processed ${processed} job(s)`);
      await new Promise((resolve) => setTimeout(resolve, processed > 0 ? 250 : 2000));
    } catch (error) {
      console.error("[worker] loop error", error instanceof Error ? error.message : error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    tick += 1;
  }
  console.log("[worker] stopped");
  process.exit(0);
}

void main();
