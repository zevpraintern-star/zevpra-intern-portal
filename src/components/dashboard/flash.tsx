import { Alert } from "@/components/ui/alert";

/**
 * One-shot confirmation shown after an action redirects (the form that triggered it is
 * often gone by then). Only keys from this fixed map render; arbitrary text in the URL
 * is ignored, so the parameter cannot be used to inject content.
 */
const MESSAGES: Record<string, string> = {
  applied: "Application submitted. We'll let you know as soon as it is reviewed.",
  task_submitted: "Submitted. A reviewer will look at it soon.",
  project_selected: "Project selected. Build it in your own GitHub repository, then submit the link.",
  project_submitted: "Project submitted for verification.",
  application_reviewed: "Decision recorded and the student was notified.",
  task_reviewed: "Review saved and the student was notified.",
  project_approved: "Project verified. The student is now certificate-eligible.",
  project_reviewed: "Review saved and the student was notified.",
  payment_approved: "Payment approved. The certificate is being generated.",
  payment_rejected: "Payment rejected and the student was notified.",
  certificate_revoked: "Certificate revoked. Its verification page now shows it as revoked.",
  payment_submitted: "Payment proof submitted. Your certificate is issued only after an administrator verifies it.",
};

export function Flash({ flash }: { flash?: string }) {
  const message = flash ? MESSAGES[flash] : undefined;
  if (!message) return null;
  return <Alert variant="success" className="mb-6">{message}</Alert>;
}
