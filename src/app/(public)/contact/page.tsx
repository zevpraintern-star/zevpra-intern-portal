import type { Metadata } from "next";

import { PageHero } from "@/components/layout/page-hero";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact", description: "Questions about tasks, reviews or certificates? Send us a message.", alternates: { canonical: "/contact" } };

export default function ContactPage() {
  return (
    <>
      <PageHero title="Get in touch." description="Questions about tasks, project reviews or certificate payments? We read every message." />
      <div className="container-page max-w-xl py-14"><ContactForm /></div>
    </>
  );
}
