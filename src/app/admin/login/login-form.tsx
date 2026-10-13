"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await response.json()) as { success: boolean; data?: { maskedEmail?: string }; error?: { message: string } };
}

export function AdminLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [masked, setMasked] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setError(null);
    setBusy(true);
    try {
      if (step === "password") {
        const mail = String(form.get("email") ?? "");
        const result = await post("/api/auth/admin/login", { email: mail, password: String(form.get("password") ?? ""), honeypot: String(form.get("company") ?? "") });
        if (!result.success) return setError(result.error?.message ?? "Sign-in failed.");
        setEmail(mail);
        setMasked(result.data?.maskedEmail ?? "your email");
        setStep("code");
      } else {
        const result = await post("/api/auth/admin/verify", { email, code: String(form.get("code") ?? "") });
        if (!result.success) return setError(result.error?.message ?? "That code did not work.");
        router.push("/admin/dashboard");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="mt-6 space-y-4" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {step === "password" ? (
        <>
          <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="username" required className="mt-1.5" /></div>
          <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="current-password" required className="mt-1.5" /></div>
          <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        </>
      ) : (
        <>
          <Alert>We sent a 6-digit code to {masked}.</Alert>
          <div><Label htmlFor="code">Verification code</Label><Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="mt-1.5 tracking-widest" /></div>
        </>
      )}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : step === "password" ? "Continue" : "Sign in"}</Button>
    </form>
  );
}
