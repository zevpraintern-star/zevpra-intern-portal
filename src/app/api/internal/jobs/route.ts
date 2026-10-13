import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getEnv } from "@/lib/config/env";
import { recoverStuckJobs, runDueJobs } from "@/server/jobs/runner";

/** Cron entry point: `curl -X POST -H "Authorization: Bearer $JOB_RUNNER_SECRET" https://host/api/internal/jobs` */
export async function POST(req: NextRequest) {
  const secret = getEnv().JOB_RUNNER_SECRET;
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(secret ?? "");
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Unauthorized." } }, { status: 401 });
  }
  const recovered = await recoverStuckJobs();
  const processed = await runDueJobs(25);
  return NextResponse.json({ success: true, data: { processed, recovered } }, { headers: { "Cache-Control": "no-store" } });
}
