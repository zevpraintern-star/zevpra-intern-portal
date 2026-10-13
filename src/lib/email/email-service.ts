import { getEnv } from "../config/env";
import { getPrisma } from "../db/prisma";
import { logger } from "../logger";
import {
  baseEmailVariables,
  getFallbackTemplate,
  renderTemplate,
  type EmailVariables,
} from "./templates";

/**
 * Transactional email service.
 *
 * All email is delivered through Brevo (transactional HTTP API). The API key
 * is provided via the environment (BREVO_API_KEY) and never committed.
 *
 * Delivery guarantees
 *  - Every attempt is recorded in email_logs (never an OTP value or token).
 *  - Non-urgent mail is queued as a durable BackgroundJob so request handlers stay
 *    fast; verification codes use the inline path for immediate delivery.
 */

export interface SendEmailInput {
  to: string;
  templateKey: string;
  variables?: EmailVariables;
  subjectOverride?: string;
  replyTo?: string;
  /** Links the email_logs row to a student when known. */
  userId?: string;
}

export interface SendEmailResult {
  delivered: boolean;
  queued: boolean;
  logId?: string;
  providerMessageId?: string;
  error?: string;
}

interface EmailProvider {
  readonly name: string;
  send(message: {
    to: string;
    from: string;
    replyTo?: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ providerMessageId?: string }>;
}

/**
 * Brevo (formerly Sendinblue) transactional email over its HTTP API.
 * Delivers to real inboxes. Free tier ~300 emails/day.
 * Requires a verified sender (EMAIL_FROM) in the Brevo dashboard.
 */
class BrevoEmailProvider implements EmailProvider {
  readonly name = "brevo";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(message: {
    to: string;
    from: string;
    replyTo?: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ providerMessageId?: string }> {
    // Brevo wants the sender split into name + email, e.g. "Zevpra Intern <no-reply@...>".
    const fromMatch = message.from.match(/^\s*(.*?)\s*<(.+?)>\s*$/);
    const sender = fromMatch
      ? { name: fromMatch[1] || undefined, email: fromMatch[2] }
      : { email: message.from };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Brevo rejected the message (${response.status}): ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as { messageId?: string };
    return { providerMessageId: payload.messageId };
  }
}

export function getEmailProvider(): EmailProvider {
  const env = getEnv();
  if (!env.BREVO_API_KEY) {
    throw new Error(
      "BREVO_API_KEY is not set. Email is delivered via Brevo; add your Brevo v3 API key to the environment.",
    );
  }
  return new BrevoEmailProvider(env.BREVO_API_KEY);
}

interface CachedTemplate {
  key: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

const templateCache = new Map<string, CachedTemplate>();

/**
 * Resolves a template from the database (canonical, admin editable) and falls
 * back to the code defaults shipped in ./templates.ts. Results are cached in
 * process memory; the admin panel clears the cache on save.
 */
async function resolveTemplate(key: string): Promise<CachedTemplate | null> {
  const cached = templateCache.get(key);
  if (cached) return cached;

  try {
    const row = await getPrisma().emailTemplate.findFirst({ where: { key, isActive: true } });
    if (row) {
      const definition: CachedTemplate = {
        key: row.key,
        subject: row.subject,
        bodyHtml: row.bodyHtml,
        bodyText: row.bodyText ?? row.bodyHtml.replace(/<[^>]+>/g, " ").trim(),
      };
      templateCache.set(key, definition);
      return definition;
    }
  } catch (error) {
    logger.warn("[email] template lookup failed, using code fallback", {
      templateKey: key,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  const fallback = getFallbackTemplate(key);
  if (!fallback) return null;

  const definition: CachedTemplate = {
    key: fallback.key,
    subject: fallback.subject,
    bodyHtml: fallback.bodyHtml,
    bodyText: fallback.bodyText,
  };
  templateCache.set(key, definition);
  return definition;
}

export function clearEmailTemplateCache(): void {
  templateCache.clear();
}

interface PreparedMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function prepareMessage(input: SendEmailInput): Promise<PreparedMessage> {
  const template = await resolveTemplate(input.templateKey);
  if (!template) {
    throw new Error(`Unknown email template: ${input.templateKey}`);
  }

  const variables: EmailVariables = { ...baseEmailVariables(), ...(input.variables ?? {}) };

  return {
    to: input.to,
    subject: renderTemplate(input.subjectOverride ?? template.subject, variables, false),
    html: renderTemplate(template.bodyHtml, variables, true),
    text: renderTemplate(template.bodyText, variables, false),
  };
}

async function dispatch(input: SendEmailInput): Promise<SendEmailResult> {
  const env = getEnv();
  const prisma = getPrisma();
  let logId: string | undefined;

  try {
    const log = await prisma.emailLog.create({
      data: {
        userId: input.userId ?? null,
        toEmail: input.to,
        templateKey: input.templateKey,
        subject: input.subjectOverride ?? input.templateKey,
        status: "QUEUED",
      },
    });
    logId = log.id;

    const message = await prepareMessage(input);
    const provider = getEmailProvider();
    const { providerMessageId } = await provider.send({
      to: message.to,
      from: env.EMAIL_FROM,
      replyTo: input.replyTo ?? env.EMAIL_REPLY_TO,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: "SENT",
        subject: message.subject,
        providerMessageId: providerMessageId ?? null,
        sentAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    return { delivered: true, queued: false, logId, providerMessageId };
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : "unknown error";
    logger.error("[email] delivery failed", { templateKey: input.templateKey, error: failureMessage });

    if (logId) {
      await prisma.emailLog
        .update({
          where: { id: logId },
          data: { status: "FAILED", error: failureMessage.slice(0, 1000), attempts: { increment: 1 } },
        })
        .catch(() => undefined);
    }

    return { delivered: false, queued: false, logId, error: failureMessage };
  }
}

/** Inline delivery for time-critical mail: verification codes and security notices. */
export async function sendEmailNow(input: SendEmailInput): Promise<SendEmailResult> {
  return dispatch(input);
}

/**
 * Durable queue path for every other notification. A background worker (Phase 9)
 * picks up QUEUED jobs, so a slow provider can never block a request handler.
 */
export async function queueEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const job = await getPrisma().backgroundJob.create({
    data: {
      type: "EMAIL",
      payload: {
        to: input.to,
        templateKey: input.templateKey,
        variables: (input.variables ?? {}) as never,
        userId: input.userId ?? null,
        subjectOverride: input.subjectOverride ?? null,
      },
    },
  });

  logger.info("[email] queued", { templateKey: input.templateKey, jobId: job.id });
  return { delivered: false, queued: true };
}

/** Executes one queued EMAIL job. Called by the background worker. */
export async function processEmailJob(jobId: string): Promise<SendEmailResult> {
  const job = await getPrisma().backgroundJob.findUnique({ where: { id: jobId } });
  if (!job || job.type !== "EMAIL") {
    return { delivered: false, queued: false, error: "Job not found or not an email job." };
  }

  const payload = job.payload as {
    to: string;
    templateKey: string;
    variables?: EmailVariables;
    userId?: string | null;
    subjectOverride?: string | null;
  };

  return dispatch({
    to: payload.to,
    templateKey: payload.templateKey,
    variables: payload.variables ?? {},
    userId: payload.userId ?? undefined,
    subjectOverride: payload.subjectOverride ?? undefined,
  });
}
