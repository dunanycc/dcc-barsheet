import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../lib/authorization";
import { displayName } from "../../../../lib/auth-policy";
import { validateEmailDraft, EmailRecipient, EmailDraftError } from "../../../../lib/admin-email";
import { deliverNewNotifications } from "../../../../lib/notification-processor";
import prisma from "../../../../lib/prisma";
export const maxDuration = 60;
const eligible = { hiddenAt: null, status: { in: ["APPROVED", "ACTIVE"] as ("APPROVED" | "ACTIVE")[] } };
async function recipients(ids?: string[]): Promise<EmailRecipient[]> {
  const users = await prisma.user.findMany({ where: { ...eligible, ...(ids ? { id: { in: ids } } : {}) }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  return users.map(user => ({ id: user.id, name: displayName(user), email: user.normalizedEmail }));
}
export async function GET(request?: NextRequest) {
  const access = await authorizeAdminRequest(); if (!access.ok) return access.response;
  const cursor = request?.nextUrl.searchParams.get("before");
  const [users, settings, rows] = await Promise.all([recipients(), prisma.adminEmailSettings.findUnique({ where: { id: "singleton" } }), prisma.adminEmail.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })]);
  const history = rows.slice(0, 50);
  const counts = await prisma.notification.groupBy({ by: ["operationId", "status"], where: { operationId: { in: history.map(item => item.id) } }, _count: { _all: true } });
  return NextResponse.json({ users, hasMore: rows.length > 50, signature: settings?.signature || "", history: history.map(item => ({ ...item, delivery: Object.fromEntries(counts.filter(row => row.operationId === item.id).map(row => [row.status, row._count._all])) })) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest) {
  const access = await authorizeAdminRequest(); if (!access.ok) return access.response;
  const body = await request.json().catch(() => null);
  if (!["preview", "send", "deliver", "signature"].includes(body?.action)) return NextResponse.json({ error: "Choose an email action." }, { status: 400 });
  try {
    if (body.action === "signature") {
      if (typeof body.signature !== "string" || body.signature.length > 4000) throw new EmailDraftError("Signature must be at most 4,000 characters.");
      await prisma.adminEmailSettings.upsert({ where: { id: "singleton" }, create: { signature: body.signature }, update: { signature: body.signature } });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "deliver") {
      if (typeof body.id !== "string" || !await prisma.adminEmail.findUnique({ where: { id: body.id } })) return NextResponse.json({ error: "Email not found." }, { status: 404 });
      const result = await deliverNewNotifications({ operationId: body.id });
      const remaining = await prisma.notification.count({ where: { operationId: body.id, status: "PENDING" } });
      return NextResponse.json({ ...result, remaining });
    }
    const draft = validateEmailDraft({ ...body, id: body.action === "preview" ? randomUUID() : body.id });
    // Repeated sends of the same preview never create another email batch.
    if (body.action === "send" && await prisma.adminEmail.findUnique({ where: { id: draft.id } })) return NextResponse.json({ id: draft.id });
    const to = await recipients(draft.recipientIds);
    if (to.length !== draft.recipientIds.length) throw new EmailDraftError("A recipient is no longer approved. Refresh the page and preview again.");
    if (body.action === "preview") {
      await prisma.adminEmailSettings.upsert({ where: { id: "singleton" }, create: { signature: draft.signature }, update: { signature: draft.signature } });
      return NextResponse.json({ draft, recipients: to });
    }
    await prisma.$transaction(async tx => {
      await tx.adminEmail.create({ data: { id: draft.id, subject: draft.subject, message: draft.message, signature: draft.signature, recipients: to, senderName: displayName(access.user) } });
      await tx.notification.createMany({ data: to.map(user => ({ operationId: draft.id, type: "ADMIN_ALERT" as const, recipientEmail: user.email, payload: { adminComposed: true, subject: draft.subject, message: draft.message, signature: draft.signature }, relatedEntityType: "AdminEmail", relatedEntityId: draft.id })) });
      await tx.auditEvent.create({ data: { operationId: draft.id, actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail, action: "ADMIN_EMAIL_QUEUED", entityType: "AdminEmail", entityId: draft.id, newData: { subject: draft.subject, recipientCount: to.length } } });
    });
    return NextResponse.json({ id: draft.id });
  } catch (error) {
    if (error instanceof EmailDraftError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(error); return NextResponse.json({ error: "Could not save the email. Please refresh history before trying again." }, { status: 500 });
  }
}
