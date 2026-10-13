import type { Metadata } from "next";

import { PageHero } from "@/components/layout/page-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { getPrisma } from "@/lib/db/prisma";

export const revalidate = 600;
export const metadata: Metadata = { title: "FAQ", description: "Answers about our free internships and the optional certificate.", alternates: { canonical: "/faq" } };

async function load() {
  try { return await getPrisma().faq.findMany({ where: { isPublished: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }); } catch { return []; }
}

export default async function FaqPage() {
  const faqs = await load();
  return (
    <>
      {faqs.length > 0 ? <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }} /> : null}
      <PageHero title="Frequently asked questions." description="Straight answers, including what the certificate does and does not mean." />
      <div className="container-page max-w-3xl py-14">
        {faqs.length === 0 ? <p className="text-muted-foreground">No questions published yet. Use the contact page and we'll help.</p> : (
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {faqs.map((f) => (<details key={f.id} className="group p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{f.question}<span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-45">+</span></summary><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{f.answer}</p></details>))}
          </div>)}
      </div>
    </>
  );
}
