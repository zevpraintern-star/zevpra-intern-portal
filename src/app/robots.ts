import type { MetadataRoute } from "next";

import { getBranding } from "@/lib/config/branding";

export default function robots(): MetadataRoute.Robots {
  const base = getBranding().appUrl.replace(/\/$/, "");
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/student", "/api/", "/verify-certificate/"] }], sitemap: `${base}/sitemap.xml` };
}
