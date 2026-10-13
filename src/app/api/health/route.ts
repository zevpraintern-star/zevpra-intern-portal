import { NextResponse } from "next/server";

import { pingDatabase } from "@/lib/db/prisma";
import { getRedisOrNull } from "@/lib/redis/client";

/** Liveness/readiness probe. Reports component status only: no versions, hosts or secrets. */
export async function GET() {
  const db = await pingDatabase();
  let redis: "up" | "down" | "not_configured" = "not_configured";
  let redisError: string | undefined;
  const client = getRedisOrNull();
  if (client) {
    try {
      await client.ping();
      redis = "up";
    } catch (error) {
      // Surface the real reason (WRONGPASS, NOPERM, timeout, ...) instead of
      // silently reporting "down" — a swallowed error here is very hard to debug.
      const message = error instanceof Error ? error.message : String(error);
      // First line only; never emit the connection string or credentials.
      redisError = message.split("\n")[0];
      console.error("[health] redis ping failed:", redisError);
      redis = "down";
    }
  }
  const ok = db && redis !== "down";
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      database: db ? "up" : "down",
      redis,
      ...(redisError ? { redisError } : {}),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
