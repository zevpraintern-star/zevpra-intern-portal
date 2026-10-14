"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { COUNTRY_CODES } from "@/lib/config/constants";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"otp" | "form">("otp");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string>("+91");

  const [formData, setFormData] = useState({
    fullName: "",
    mobile: "",
    college: "",
    degree: "B.Tech",
    branch: "Computer Science",
    yearOfStudy: 3,
    graduationYear: 2026,
    termsAccepted: false,
    privacyAccepted: false,
  });

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "STUDENT_REGISTER" }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || "Failed to send code.");
      setInfo(data.data.message);
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message);
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
        body: JSON.stringify({ email, code, purpose: "STUDENT_REGISTER" }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || "Invalid code.");
      setStep("form");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        ...formData,
        email,
        mobile: `${countryCode}${formData.mobile}`,
        country: COUNTRY_CODES.find((c) => c.dial === countryCode)?.label ?? "India",
        yearOfStudy: Number(formData.yearOfStudy),
        graduationYear: Number(formData.graduationYear),
      };
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        // Surface the specific field errors (e.g. "Enter a valid 10 digit Indian mobile number.")
        // instead of the generic "Please check your input." envelope message.
        const details = data.error?.details as Array<{ field: string; message: string }> | undefined;
        const specific = details?.length ? details.map((d) => d.message).join(" ") : null;
        throw new Error(specific || data.error?.message || "Registration failed.");
      }
      router.push("/student/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-page flex min-h-[calc(100vh-16rem)] items-center justify-center py-12">
      <Card className="w-full max-w-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Register for Free Internship</CardTitle>
          <CardDescription>
            {step === "otp"
              ? "Verify your student email address to get started"
              : "Complete your profile details"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4"><Alert variant="destructive" title="Error">{error}</Alert></div>}
          {info && !error && <div className="mb-4"><Alert variant="info" title="Verification Code">{info}</Alert></div>}

          {step === "otp" ? (
            <div className="space-y-4">
              {!otpSent ? (
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
                    Send Verification Code
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Enter 6-digit Code sent to {email}</Label>
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
                    Verify & Continue
                  </Button>
                </form>
              )}
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mobile">Mobile Number</Label>
                  <div className="flex">
  <select
    aria-label="Country code"
    className="h-10 w-24 shrink-0 rounded-l-md rounded-r-none border border-input border-r-0 bg-background pl-2 pr-1 text-sm focus:outline-none"
    value={countryCode}
    onChange={(e) => setCountryCode(e.target.value)}
  >
    {COUNTRY_CODES.map((c) => (
      <option key={c.dial} value={c.dial}>
        {c.dial} {c.short}
      </option>
    ))}
  </select>
  <Input
    id="mobile"
    type="tel"
    inputMode="numeric"
    maxLength={10}
    placeholder="9876543210"
    required
    className="min-w-0 flex-1 rounded-l-none"
    value={formData.mobile}
    onChange={(e) => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
  />
</div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="college">College / Institution</Label>
                  <Input
                    id="college"
                    required
                    value={formData.college}
                    onChange={(e) => setFormData({ ...formData, college: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="degree">Degree</Label>
                  <Input
                    id="degree"
                    required
                    value={formData.degree}
                    onChange={(e) => setFormData({ ...formData, degree: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch / Specialization</Label>
                  <Input
                    id="branch"
                    required
                    value={formData.branch}
                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="graduationYear">Graduation Year</Label>
                  <Input
                    id="graduationYear"
                    type="number"
                    min={2025}
                    max={2034}
                    required
                    value={formData.graduationYear}
                    onChange={(e) => setFormData({ ...formData, graduationYear: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-border"
                    required
                    checked={formData.termsAccepted}
                    onChange={(e) => setFormData({ ...formData, termsAccepted: e.target.checked })}
                  />
                  <span>
                    I accept the <Link href="/terms-and-conditions" target="_blank" className="text-primary hover:underline">Terms & Conditions</Link>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-border"
                    required
                    checked={formData.privacyAccepted}
                    onChange={(e) => setFormData({ ...formData, privacyAccepted: e.target.checked })}
                  />
                  <span>
                    I accept the <Link href="/privacy-policy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>
                  </span>
                </label>
              </div>

              <Button type="submit" className="w-full mt-4" disabled={loading}>
                {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
                Complete Registration
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col border-t border-border pt-4 text-center text-sm text-muted-foreground">
          <p>
            Already have an account? <Link href="/login" className="text-primary hover:underline font-medium">Sign In</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
