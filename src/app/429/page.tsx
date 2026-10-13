import Link from "next/link";

export const metadata = { title: "Too many requests", robots: { index: false } };

export default function TooManyRequests() {
  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-6xl font-semibold text-primary">429</p>
      <h1 className="mt-4 font-display text-2xl font-semibold">Too many requests.</h1>
      <p className="mt-2 max-w-md text-muted-foreground">Too many requests. Please try again later.</p>
      <Link href="/" className="mt-8 text-primary underline-offset-4 hover:underline">Back to the homepage</Link>
    </main>
  );
}
