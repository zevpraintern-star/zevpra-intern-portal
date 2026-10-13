import { NextRequest } from "next/server";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession("STUDENT");
    if (!session) {
      return apiSuccess({ authenticated: false, user: null });
    }

    return apiSuccess({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        roles: session.user.roles.map((r) => r.role.key),
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
