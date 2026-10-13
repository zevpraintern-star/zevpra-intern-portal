"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { KeyRound, Loader2, Lock, Mail, Pencil } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await response.json()) as { success: boolean; data?: { maskedEmail?: string }; error?: { message: string } };
}

export function AdminLoginForm() {
  const router = useRouter();
  const reduced = useReducedMotion();
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

  // Step transitions are decorative; reduced-motion visitors get an instant swap.
  const stepMotion = reduced
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
        transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <Card className="border-border/70 shadow-2xl shadow-primary/10">
      <CardContent className="pt-6">
        {error ? (
          <div className="mb-4">
            <Alert variant="destructive" title={step === "password" ? "Sign-in failed" : "Code not accepted"}>
              {error}
            </Alert>
          </div>
        ) : null}

        <form action={submit} className="space-y-4" noValidate>
          <AnimatePresence mode="wait" initial={false}>
            {step === "password" ? (
              <motion.div key="password" className="space-y-4" {...stepMotion}>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="email" name="email" type="email" autoComplete="username" placeholder="you@company.com" required className="pl-9" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="password" name="password" type="password" autoComplete="current-password" required className="pl-9" />
                  </div>
                </div>
                <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
              </motion.div>
            ) : (
              <motion.div key="code" className="space-y-4" {...stepMotion}>
                <Alert title="Code sent">We sent a 6-digit code to {masked}. Enter it below to finish signing in.</Alert>
                <div>
                  <Label htmlFor="code">Verification code</Label>
                  <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" required autoFocus className="mt-1.5 text-center font-mono text-lg tracking-[0.5em]" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : step === "code" ? <KeyRound /> : null}
            {busy ? "Please wait…" : step === "password" ? "Continue" : "Sign in"}
          </Button>

          {step === "code" ? (
            <button
              type="button"
              onClick={() => {
                setStep("password");
                setError(null);
              }}
              className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Pencil className="size-3" aria-hidden="true" />
              Use a different email address
            </button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
