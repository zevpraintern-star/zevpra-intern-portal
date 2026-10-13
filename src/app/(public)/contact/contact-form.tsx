"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(form: FormData) {
    setError(null);
    setFields({});
    setState("sending");
    try {
      const response = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), email: form.get("email"), subject: form.get("subject"), message: form.get("message"), honeypot: form.get("website") }),
      });
      const json = await response.json();
      if (json.success) return setState("sent");
      const map: Record<string, string> = {};
      for (const d of json.error?.details ?? []) map[d.field] = d.message;
      setFields(map);
      setError(json.error?.message ?? "Could not send your message.");
      setState("idle");
    } catch {
      setError("Network problem. Please try again.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (<div className="rounded-2xl border border-border bg-card p-10 text-center" role="status"><CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden="true" /><h2 className="mt-4 font-display text-xl font-semibold">Message received</h2><p className="mt-2 text-sm text-muted-foreground">Thanks. We'll reply to the email address you gave us.</p></div>);
  }

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><Label htmlFor={name}>{label}</Label><Input id={name} name={name} required aria-invalid={Boolean(fields[name])} aria-describedby={fields[name] ? `${name}-error` : undefined} className="mt-1.5" {...props} />{fields[name] ? <p id={`${name}-error`} role="alert" className="mt-1 text-sm text-destructive">{fields[name]}</p> : null}</div>
  );
  return (
    <form action={submit} className="space-y-5 rounded-2xl border border-border bg-card p-6 sm:p-8" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">{field("name", "Your name", { autoComplete: "name" })}{field("email", "Email", { type: "email", autoComplete: "email" })}</div>
      {field("subject", "Subject")}
      <div><Label htmlFor="message">Message</Label><textarea id="message" name="message" required rows={6} aria-invalid={Boolean(fields.message)} aria-describedby={fields.message ? "message-error" : undefined} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />{fields.message ? <p id="message-error" role="alert" className="mt-1 text-sm text-destructive">{fields.message}</p> : null}</div>
      {/* Honeypot: invisible to people, tempting to bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <Button type="submit" disabled={state === "sending"}>{state === "sending" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}{state === "sending" ? "Sending…" : "Send message"}</Button>
    </form>
  );
}
