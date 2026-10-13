import { ZodError } from "zod";

import { isAppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";

export interface ActionState {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Changes on every submission so the UI can re-announce identical messages. */
  nonce?: number;
}

export const initialActionState: ActionState = { ok: false };

/**
 * Runs a server action body and converts every failure into a safe, typed result.
 * Redirects (which Next implements by throwing) are re-thrown untouched.
 */
export async function runAction(body: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await body();
    return { ok: true, message: message ?? undefined, nonce: Date.now() };
  } catch (error) {
    if (error instanceof Error && (error.message === "NEXT_REDIRECT" || (error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT") || (error as { digest?: string }).digest?.startsWith("NEXT_NOT_FOUND"))) throw error;
    if (error instanceof ZodError) {
      const errors: Record<string, string> = {};
      for (const issue of error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
      return { ok: false, message: "Please fix the highlighted fields.", errors, nonce: Date.now() };
    }
    if (isAppError(error)) {
      const errors: Record<string, string> = {};
      for (const detail of error.details ?? []) errors[detail.field] ??= detail.message;
      return { ok: false, message: error.message, errors: Object.keys(errors).length ? errors : undefined, nonce: Date.now() };
    }
    logger.error("[action] unexpected failure", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, message: "Something went wrong. Please try again.", nonce: Date.now() };
  }
}

export function str(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function strList(form: FormData, key: string): string[] {
  return form.getAll(key).filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

export function num(form: FormData, key: string): number | undefined {
  const value = str(form, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function bool(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === "on" || value === "true" || value === "1";
}
