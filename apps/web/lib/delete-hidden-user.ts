import { Prisma } from "../app/generated/prisma/client";

export class UserDeletionError extends Error {}

export async function deleteHiddenUser(tx: Prisma.TransactionClient, userId: string, actorId: string) {
  const target = await tx.user.findUnique({ where: { id: userId } });
  if (!target) throw new UserDeletionError("NOT_FOUND");
  if (!target.hiddenAt) throw new UserDeletionError("NOT_HIDDEN");
  if (target.id === actorId) throw new UserDeletionError("SELF_DELETE");
  if (target.role === "ADMIN" && ["APPROVED", "ACTIVE"].includes(target.status)) {
    const others = await tx.user.count({ where: { id: { not: userId }, hiddenAt: null, role: "ADMIN", status: { in: ["APPROVED", "ACTIVE"] } } });
    if (!others) throw new UserDeletionError("LAST_ACTIVE_ADMIN");
  }

  const profiles = await tx.volunteerProfile.findMany({ where: { userId }, select: { id: true } });
  const assignments = await tx.shiftAssignment.findMany({ where: { OR: [{ userId }, { volunteerProfileId: { in: profiles.map(p => p.id) } }] }, select: { id: true } });
  const requests = await tx.accessRequest.findMany({ where: { OR: [{ approvedUserId: userId }, { normalizedEmail: target.normalizedEmail }] }, select: { id: true } });
  const ids = [userId, ...profiles.map(p => p.id), ...assignments.map(a => a.id), ...requests.map(r => r.id)];

  // The trigger permits only related audit deletions for this hidden account.
  // This setting expires automatically on commit or rollback.
  await tx.$queryRaw`SELECT set_config('app.hidden_user_cleanup_id', ${userId}, true)`;

  // Match related IDs in one scan per table instead of two round trips per ID.
  const references = Prisma.sql`ARRAY[${Prisma.join([...ids, target.normalizedEmail])}]::text[]`;
  await tx.$executeRaw`
    DELETE FROM "AuditEvent" AS audit
    WHERE audit."actorUserId" = ${userId}
       OR audit."actorEmailSnapshot" = ${target.normalizedEmail}
       OR EXISTS (
         SELECT 1 FROM unnest(${references}) AS ref(value)
         WHERE audit."entityId" = ref.value
            OR strpos(audit."previousData"::text, ref.value) > 0
            OR strpos(audit."newData"::text, ref.value) > 0
            OR strpos(audit."details"::text, ref.value) > 0
       )`;
  await tx.$executeRaw`
    DELETE FROM "Notification" AS notification
    WHERE notification."recipientEmail" = ${target.normalizedEmail}
       OR EXISTS (
         SELECT 1 FROM unnest(${references}) AS ref(value)
         WHERE notification."relatedEntityId" = ref.value
            OR strpos(notification."payload"::text, ref.value) > 0
       )`;
  await tx.shiftAssignment.updateMany({ where: { replacedAssignmentId: { in: assignments.map(a => a.id) } }, data: { replacedAssignmentId: null } });
  await tx.shiftAssignment.deleteMany({ where: { id: { in: assignments.map(a => a.id) } } });
  // Preserve other volunteers' assignments and approvals when this user was their creator.
  await tx.shiftAssignment.updateMany({ where: { createdByUserId: userId }, data: { createdByUserId: null } });
  await tx.user.updateMany({ where: { approvedByUserId: userId }, data: { approvedByUserId: null } });
  await tx.accessRequest.deleteMany({ where: { id: { in: requests.map(r => r.id) } } });
  await tx.accessRequest.updateMany({ where: { decidedByUserId: userId }, data: { decidedByUserId: null } });
  await tx.accessRequestAttempt.deleteMany({ where: { normalizedEmail: target.normalizedEmail } });
  await tx.externalIdentity.deleteMany({ where: { userId } });
  await tx.volunteerProfile.deleteMany({ where: { userId } });
  await tx.user.delete({ where: { id: userId } });
}
