import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/layout/page-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBranding } from "@/lib/config/branding";
import { getPrisma } from "@/lib/db/prisma";
import { formatPrice } from "@/lib/utils/format";
import { getPaymentSettings } from "@/server/services/settings";

export const revalidate = 600;

async function load(slug: string) {
  try {
    return await getPrisma().internshipProgram.findFirst({
      where: { slug, status: { in: ["PUBLISHED", "CLOSED"] } },
      include: { domain: { select: { name: true } }, projects: { where: { status: "PUBLISHED" }, select: { id: true, title: true }, orderBy: { sortOrder: "asc" } }, _count: { select: { tasks: { where: { status: "PUBLISHED" } } } } },
    });
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return { title: "Internship not found" };
  return { title: p.title, description: p.summary, alternates: { canonical: `/internships/${p.slug}` }, openGraph: { title: p.title, description: p.summary, type: "website" } };
}

export default async function InternshipDetail({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  if (!p) notFound();
  const branding = getBranding();
  const pay = await getPaymentSettings().catch(() => null);
  const fee = formatPrice(pay?.fee ?? branding.certificateFee, pay?.currency ?? branding.currency);
  const list = (title: string, items: string[]) => items.length ? (<section><h2 className="font-display text-xl font-semibold">{title}</h2><ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">{items.map((i) => <li key={i}>{i}</li>)}</ul></section>) : null;
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Course", name: p.title, description: p.summary, provider: { "@type": "Organization", name: branding.companyName, url: branding.appUrl }, isAccessibleForFree: true, educationalLevel: p.difficulty, timeRequired: `P${p.durationWeeks}W`, offers: { "@type": "Offer", price: 0, priceCurrency: branding.currency, category: "Free" } }} />
      <PageHero title={p.title} description={p.summary}>
        <div className="mt-6 flex flex-wrap items-center gap-2"><Badge variant="success">Free</Badge><Badge variant="outline">{p.domain.name}</Badge><Badge variant="outline">{p.durationLabel}</Badge><Badge variant="outline">{p.mode}</Badge><Badge variant="outline">{p.difficulty.toLowerCase()}</Badge></div>
        <div className="mt-8"><Button asChild size="lg">{p.status === "PUBLISHED" ? <Link href="/register">Register free to apply</Link> : <span>Applications closed</span>}</Button></div>
      </PageHero>
      <div className="container-page grid gap-12 py-14 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-10">
          {p.description ? <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{p.description}</p> : null}
          {list("What you'll learn", p.learningOutcomes)}{list("Skills", p.skills)}{list("Prerequisites", p.prerequisites)}
          {p.projects.length ? <section><h2 className="font-display text-xl font-semibold">Project options</h2><ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">{p.projects.map((x) => <li key={x.id}>{x.title}</li>)}</ul><p className="mt-2 text-sm text-muted-foreground">You pick one after finishing your tasks.</p></section> : null}
        </div>
        <aside className="h-fit rounded-2xl border border-border bg-card p-6 text-sm">
          <h2 className="font-display text-lg font-semibold">At a glance</h2>
          <dl className="mt-4 space-y-3">
            <div><dt className="text-muted-foreground">Tasks</dt><dd className="font-medium">{p._count.tasks}</dd></div>
            <div><dt className="text-muted-foreground">Fee</dt><dd className="font-medium">Free</dd></div>
            <div><dt className="text-muted-foreground">Certificate</dt><dd className="font-medium">{fee}, optional</dd></div>
            {p.certificateRequirements ? <div><dt className="text-muted-foreground">To earn it</dt><dd>{p.certificateRequirements}</dd></div> : null}
          </dl>
        </aside>
      </div>
    </>
  );
}
