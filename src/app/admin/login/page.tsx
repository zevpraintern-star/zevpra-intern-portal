import type { Metadata } from "next";

import { AdminLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold">Admin sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Staff only. You'll confirm with a code sent to your email.</p>
        <AdminLoginForm />
      </div>
    </main>
  );
}
