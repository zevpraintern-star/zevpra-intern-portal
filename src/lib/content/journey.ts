/**
 * The six-step internship journey. One source of truth shared by the homepage
 * flight, the /how-it-works timeline and the screen-reader outline, so the copy can
 * never drift between them.
 *
 * `{fee}` is replaced with the configured certificate fee at render time.
 */

export type JourneyIcon = "mail" | "compass" | "tasks" | "project" | "verify" | "certificate";

export interface JourneyStep {
  icon: JourneyIcon;
  title: string;
  summary: string;
  detail: string;
}

export const JOURNEY_STEPS: readonly JourneyStep[] = [
  {
    icon: "mail",
    title: "Sign up or log in",
    summary: "Enter your email, confirm the one-time code, and you're in.",
    detail:
      "There is no password to remember or leak. Each sign-in uses a short-lived code sent to your email.",
  },
  {
    icon: "compass",
    title: "Choose your domain",
    summary: "Pick the engineering domain you want to intern in.",
    detail:
      "Your tasks and project options come from the domain you choose, so everything you do is relevant to your branch.",
  },
  {
    icon: "tasks",
    title: "Complete the tasks",
    summary: "Work through your domain's tasks and submit each one.",
    detail:
      "Every submission gets reviewer feedback. If changes are requested you can resubmit while attempts remain.",
  },
  {
    icon: "project",
    title: "Pick a project",
    summary: "Once your required tasks are approved, choose a project.",
    detail:
      "Projects are listed for your domain. You build yours in your own public GitHub repository.",
  },
  {
    icon: "verify",
    title: "Submit and get verified",
    summary: "Share your repository link for mentor review.",
    detail:
      "A reviewer checks the project. When it is approved, your internship is complete and you become eligible for a certificate.",
  },
  {
    icon: "certificate",
    title: "Get your certificate",
    summary: "The internship is free. The certificate is {fee}, and optional.",
    detail:
      "Pay by UPI, then submit your UTR and a payment screenshot. An administrator verifies the payment before your certificate is issued.",
  },
] as const;

export function withFee(text: string, fee: string): string {
  return text.replaceAll("{fee}", fee);
}
