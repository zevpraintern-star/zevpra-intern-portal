import { CsrfError } from "@/lib/api/errors";
import { getEnv } from "@/lib/config/env";
import { clientIpFromHeaders } from "@/lib/redis/rate-limit";

export interface RequestMeta {
  ipAddress: string;
  userAgent: string | undefined;
}

export function requestMeta(headers: Headers): RequestMeta {
  return {
    ipAddress: clientIpFromHeaders(headers),
    userAgent: headers.get("user-agent")?.slice(0, 400) ?? undefined,
  };
}

/**
 * CSRF defence for state-changing requests that carry cookies.
 *
 * Layers: (1) session cookies are SameSite=Lax, so cross-site POSTs arrive without
 * them; (2) this check additionally requires the browser-supplied Origin (or, for
 * old clients, Referer) to match our own host. `Sec-Fetch-Site` is honoured when
 * present. Browsers cannot forge these headers from a web page, which is the
 * "verifying origin with standard headers" defence recommended by OWASP.
 * Next.js Server Actions run the same Origin/Host comparison themselves.
 */
export function assertSameOrigin(headers: Headers): void {
  const site = headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return;
  if (site === "cross-site" || site === "same-site") throw new CsrfError();

  const origin = headers.get("origin") ?? refererOrigin(headers.get("referer"));
  if (!origin) throw new CsrfError();

  const allowed = new Set<string>();
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  try {
    allowed.add(new URL(getEnv().APP_URL).origin);
  } catch {
    // APP_URL is validated at boot; ignore here.
  }
  for (const extra of (getEnv().CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const trimmed = extra.trim();
    if (trimmed) allowed.add(trimmed);
  }
  if (!allowed.has(origin)) throw new CsrfError();
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
