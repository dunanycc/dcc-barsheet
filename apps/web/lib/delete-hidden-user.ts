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

  // Include IDs embedded in audit snapshots and notification payloads.
  for (const id of [...ids, target.normalizedEmail]) {
    await tx.$executeRaw`DELETE FROM "AuditEvent" WHERE "actorUserId" = ${userId} OR "entityId" = ${id} OR strpos("previousData"::text, ${id}) > 0 OR strpos("newData"::text, ${id}) > 0 OR strpos("details"::text, ${id}) > 0`;
    await tx.$executeRaw`DELETE FROM "Notification" WHERE "recipientEmail" = ${target.normalizedEmail} OR "relatedEntityId" = ${id} OR strpos("payload"::text, ${id}) > 0`;
  }
  await tx.auditEvent.deleteMany({ where: { actorEmailSnapshot: target.normalizedEmail } });
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
