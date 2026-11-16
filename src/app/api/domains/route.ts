import { NextResponse } from "next/server";

import { apiFailure, apiSuccess } from "@/lib/api/response";
import { getPrisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const domains = await getPrisma().domain.findMany({
      where: { isActive: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    });
    return apiSuccess(domains, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch (error) {
    return apiFailure(error, { context: "domains.list" });
  }
}
