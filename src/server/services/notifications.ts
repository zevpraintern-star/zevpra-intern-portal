import type { Prisma } from "@/generated/prisma/client";
import type { NotificationType } from "@/generated/prisma/enums";
import { getBranding } from "@/lib/config/branding";
import { getPrisma } from "@/lib/db/prisma";
import { queueEmail } from "@/lib/email/email-service";
import { kickJobs } from "@/server/jobs/queue";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Prisma.InputJsonValue;
}

export async function notify(input: NotifyInput, db: Pick<ReturnType<typeof getPrisma>, "notification"> | Prisma.TransactionClient = getPrisma()): Promise<void> {
  await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body,
      link: input.link?.slice(0, 500),
      metadata: input.metadata,
    },
  });
}

export interface NotifyAndEmailInput extends NotifyInput {
  email: string;
  recipientName: string;
  templateKey: string;
  variables?: Record<string, string | number>;
}

/** In-app notification now, email through the job queue (never blocks the request). */
export async function notifyAndEmail(input: NotifyAndEmailInput): Promise<void> {
  await notify(input);
  const appUrl = getBranding().appUrl;
  await queueEmail({
    to: input.email,
    templateKey: input.templateKey,
    userId: input.userId,
    variables: {
      recipientName: input.recipientName,
      actionUrl: input.link ? `${appUrl}${input.link}` : appUrl,
      ...(input.variables ?? {}),
    },
  });
  kickJobs();
}

export async function unreadCount(userId: string): Promise<number> {
  return getPrisma().notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, id: string): Promise<void> {
  await getPrisma().notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markAllRead(userId: string): Promise<void> {
  await getPrisma().notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
