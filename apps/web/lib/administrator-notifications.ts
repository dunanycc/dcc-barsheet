import { Prisma } from "../app/generated/prisma/client";

export type AdministratorNotificationInput = {
  operationId: string;
  subject: string;
  message: string;
  eventId?: string | null;
  relatedEntityType?: string;
  relatedEntityId?: string;
  details?: Record<string, string | null | undefined>;
};

export async function queueAdministratorNotification(tx: Prisma.TransactionClient, input: AdministratorNotificationInput) {
  const settings = await tx.notificationSettings.findUnique({ where: { id: "singleton" }, select: { toEmail: true } });
  if (!settings?.toEmail) return null;
  const notification = await tx.notification.create({ data: {
    operationId: input.operationId, type: "ADMIN_ALERT", recipientEmail: settings.toEmail,
    payload: { subject: input.subject, message: input.message, ...(input.details ?? {}) },
    eventId: input.eventId ?? null, relatedEntityType: input.relatedEntityType, relatedEntityId: input.relatedEntityId,
  } });
  return notification.id;
}
