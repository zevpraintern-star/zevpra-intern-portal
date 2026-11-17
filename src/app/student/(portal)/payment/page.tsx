import { redirect } from "next/navigation";

/** Preserve old links while retiring certificate payments. */
export default function RetiredPaymentPage() {
  redirect("/student/certificate");
}
