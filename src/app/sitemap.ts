import type { MetadataRoute } from "next";

import { getBranding } from "@/lib/config/branding";
import { getPrisma } from "@/lib/db/prisma";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getBranding().appUrl.replace(/\/$/, "");
  const staticPaths = ["", "/about", "/internships", "/domains", "/how-it-works", "/projects", "/faq", "/contact", "/verify-certificate", "/privacy-policy", "/terms-and-conditions", "/certificate-policy", "/refund-policy"];
  const entries: MetadataRoute.Sitemap = staticPaths.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly", priority: p === "" ? 1 : 0.7 }));
  try {
    const programs = await getPrisma().internshipProgram.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } });
    for (const p of programs) entries.push({ url: `${base}/internships/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly", priority: 0.8 });
  } catch {
    // Without a database the static pages are still listed.
  }
  return entries;
}
