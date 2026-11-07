import { randomUUID } from "node:crypto";
import prisma from "./prisma";
import { renderNotification } from "./email-templates";
import { sendTransactionalMail } from "./mailer";

const MAX_ATTEMPTS = 5; const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
type Send = typeof sendTransactionalMail; type Database = typeof prisma;
export function safeDeliveryError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code ? `Email provider error (${code.slice(0, 32)}).` : "Email delivery failed.";
}
export async function processOutbox(options: { limit?: number; onlyId?: string; onlyIds?: string[]; operationId?: string; failedOnly?: boolean; send?: Send; db?: Database } = {}) {
  const db = options.db ?? prisma; const send = options.send ?? sendTransactionalMail; const limit = Math.min(20, Math.max(1, options.limit ?? 10)); const now = new Date();
  await db.notification.updateMany({ where: { status: "PROCESSING", claimedAt: { lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } }, data: { status: "FAILED", claimToken: null, claimedAt: null, nextAttemptAt: now, lastError: "Processing lease expired; ready to retry." } });
  const candidates = await db.notification.findMany({ where: { ...(options.onlyId ? { id: options.onlyId } : options.onlyIds ? { id: { in: options.onlyIds } } : {}), ...(options.operationId ? { operationId: options.operationId } : {}), status: { in: options.failedOnly ? ["FAILED"] : ["PENDING", "FAILED"] }, attemptCount: { lt: MAX_ATTEMPTS }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  let sent = 0; let failed = 0; let processed = 0;
  for (const candidate of candidates) {
    const claimToken = randomUUID();
    const claim = await db.notification.updateMany({ where: { id: candidate.id, status: { in: ["PENDING", "FAILED"] }, attemptCount: { lt: MAX_ATTEMPTS } }, data: { status: "PROCESSING", claimToken, claimedAt: new Date(), lastAttemptAt: new Date(), attemptCount: { increment: 1 }, lastError: null } });
    if (claim.count !== 1) continue;
    processed += 1; const notification = await db.notification.findUniqueOrThrow({ where: { claimToken } });
    try {
      await send({ to: notification.recipientEmail, ...renderNotification(notification.type, notification.payload as Record<string, unknown>) });
      await db.notification.updateMany({ where: { id: notification.id, status: "PROCESSING", claimToken }, data: { status: "SENT", sentAt: new Date(), claimToken: null, claimedAt: null, nextAttemptAt: null } }); sent += 1;
    } catch (error) {
      const delayMinutes = Math.min(60, 2 ** notification.attemptCount);
      await db.notification.updateMany({ where: { id: notification.id, status: "PROCESSING", claimToken }, data: { status: "FAILED", claimToken: null, claimedAt: null, nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000), lastError: safeDeliveryError(error) } }); failed += 1;
    }
  }
  return { processed, sent, failed };
}

export async function deliverNewNotifications(options: { operationId?: string; notificationIds?: string[] }) {
  if (!options.operationId && !options.notificationIds?.length) return { processed: 0, sent: 0, failed: 0 };
  try {
    return await processOutbox({ operationId: options.operationId, onlyIds: options.notificationIds, limit: 20 });
  } catch (error) {
    console.error("Immediate notification processing failed.", safeDeliveryError(error));
    return { processed: 0, sent: 0, failed: 0 };
  }
}
