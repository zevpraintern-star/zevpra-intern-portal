import { NextResponse } from "next/server";

import { pingDatabase } from "@/lib/db/prisma";
import { getRedisOrNull } from "@/lib/redis/client";

/** Liveness/readiness probe. Reports component status only: no versions, hosts or secrets. */
export async function GET() {
  const db = await pingDatabase();
  let redis: "up" | "down" | "not_configured" = "not_configured";
  const client = getRedisOrNull();
  if (client) {
    try {
      await client.ping();
      redis = "up";
    } catch (error) {
      // Surface the real reason (WRONGPASS, NOPERM, timeout, ...) instead of
      // silently reporting "down" — a swallowed error here is very hard to debug.
      console.error(
        "[health] redis ping failed:",
        error instanceof Error ? error.message : error,
      );
      redis = "down";
    }
  }
  const ok = db && redis !== "down";
  return NextResponse.json({ status: ok ? "ok" : "degraded", database: db ? "up" : "down", redis }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
