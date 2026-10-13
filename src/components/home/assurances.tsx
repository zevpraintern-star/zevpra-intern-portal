import { Building2, GitBranch, ShieldCheck } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";

const ITEMS = [
  {
    icon: ShieldCheck,
    title: "Manual UPI verification",
    body: "There is no payment gateway. You pay by UPI, submit your UTR and screenshot, and an administrator checks it before anything is issued.",
  },
  {
    icon: GitBranch,
    title: "GitHub-based final project",
    body: "Your project lives in a public GitHub repository, so your work can be reviewed and shared with anyone.",
  },
  {
    icon: Building2,
    title: "Honest certificate wording",
    body: "Certificates state the program, domain and duration you completed. We do not claim government, university, UGC or AICTE approval.",
  },
] as const;

export function Assurances() {
  return (
    <section aria-labelledby="assurances-heading" className="pb-[12vh]">
      <div className="container-page">
        <Reveal>
          <h2 id="assurances-heading" className="font-display text-3xl font-semibold sm:text-4xl">
            What you can count on
          </h2>
        </Reveal>
        <div className="world-panel mt-8 grid overflow-hidden rounded-2xl md:grid-cols-3 md:divide-x md:divide-border">
          {ITEMS.map(({ icon: Icon, title, body }, index) => (
            <Reveal
              key={title}
              delay={index * 0.1}
              className="border-b border-border p-6 last:border-b-0 md:border-b-0 sm:p-8"
            >
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
