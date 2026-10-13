import Link from "next/link";

export const metadata = { title: "Access denied", robots: { index: false } };

export default function Forbidden() {
  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-6xl font-semibold text-primary">403</p>
      <h1 className="mt-4 font-display text-2xl font-semibold">You don't have access to this page.</h1>
      <p className="mt-2 max-w-md text-muted-foreground">Your account doesn't have permission to open it. If that seems wrong, contact support.</p>
      <Link href="/" className="mt-8 text-primary underline-offset-4 hover:underline">Back to the homepage</Link>
    </main>
  );
}
