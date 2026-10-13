"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "STUDENT_LOGIN" }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || "Failed to request code.");
      }

      setInfo(data.data.message);
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, purpose: "STUDENT_LOGIN" }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || "Invalid verification code.");
      }

      router.push("/student/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Invalid code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-page flex min-h-[calc(100vh-16rem)] items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Student Sign In</CardTitle>
          <CardDescription>
            {step === "email"
              ? "Enter your registered email to receive a secure login code"
              : `Enter the code sent to ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4">
              <Alert variant="destructive" title="Error">{error}</Alert>
            </div>
          )}
          {info && !error && (
            <div className="mb-4">
              <Alert variant="info" title="Code Sent">{info}</Alert>
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 size-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="student@college.edu"
                    className="pl-10"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ArrowRight className="mr-2 size-4" />}
                {loading ? "Sending Code..." : "Send Login Code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">One-Time Password (OTP)</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  className="font-mono text-center tracking-widest text-lg"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}
                {loading ? "Verifying..." : "Sign In"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setStep("email")}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Use a different email address
                </button>
              </div>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col border-t border-border pt-4 text-center text-sm text-muted-foreground">
          <p>
            Don't have an account yet?{" "}
            <Link href="/register" className="text-primary hover:underline font-medium">
              Register Free
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
