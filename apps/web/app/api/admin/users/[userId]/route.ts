import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "../../../../generated/prisma/client";
import { assertLastAdminSafe, displayName } from "../../../../../lib/auth-policy";
import { authorizeAdminRequest } from "../../../../../lib/authorization";
import prisma from "../../../../../lib/prisma";

type Action = "disable" | "enable" | "grant_admin" | "remove_admin" | "hide" | "unhide" | "update_account";

export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const { userId } = await context.params;
  const body = (await request.json().catch(() => null)) as { action?: Action; reason?: string; firstName?: string; lastName?: string; email?: string; partnerFirstName?: string; partnerLastName?: string; partnerActive?: boolean } | null;
  const action = body?.action;
  if (!action || !["disable", "enable", "grant_admin", "remove_admin", "hide", "unhide", "update_account"].includes(action)) {
    return NextResponse.json({ error: "Choose a valid user action." }, { status: 400 });
  }
  try {
    const user = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new Error("NOT_FOUND");
      if (action === "update_account") {
        const firstName=body?.firstName?.trim()||"";const lastName=body?.lastName?.trim()||"";const email=(body?.email||"").normalize("NFKC").trim().toLowerCase();
        if(!firstName||!lastName||!/^\S+@\S+\.\S+$/.test(email))throw new Error("INVALID");
        const duplicate=await tx.user.findFirst({where:{normalizedEmail:email,id:{not:userId}},select:{id:true}});if(duplicate)throw new Error("DUPLICATE_EMAIL");
        const primary=await tx.volunteerProfile.findFirstOrThrow({where:{userId,relationship:"PRIMARY"}});const partner=await tx.volunteerProfile.findFirst({where:{userId,relationship:"PARTNER",active:true}});const emailChanged=email!==target.normalizedEmail;
        await tx.user.update({where:{id:userId},data:{firstName,lastName,email,normalizedEmail:email,...(emailChanged?{authVersion:{increment:1}}:{})}});await tx.volunteerProfile.update({where:{id:primary.id},data:{firstName,lastName}});
        const pf=body?.partnerFirstName?.trim()||"";const pl=body?.partnerLastName?.trim()||"";if(body?.partnerActive&&pf&&pl){if(partner)await tx.volunteerProfile.update({where:{id:partner.id},data:{firstName:pf,lastName:pl}});else await tx.volunteerProfile.create({data:{userId,firstName:pf,lastName:pl,relationship:"PARTNER"}});}else if(partner)await tx.volunteerProfile.update({where:{id:partner.id},data:{active:false}});
        if(emailChanged)await tx.externalIdentity.deleteMany({where:{userId}});
        await tx.auditEvent.create({data:{operationId:randomUUID(),actorUserId:access.user.id,actorNameSnapshot:displayName(access.user),actorEmailSnapshot:access.user.normalizedEmail,action:emailChanged?"USER_EMAIL_CHANGED":"USER_PROFILE_ADMIN_UPDATED",entityType:"User",entityId:userId,previousData:{firstName:target.firstName,lastName:target.lastName,email:target.normalizedEmail},newData:{firstName,lastName,email,identitiesUnlinked:emailChanged}}});
        return tx.user.findUniqueOrThrow({where:{id:userId}});
      }
      const activeAdminCount = await tx.user.count({ where: {
        role: "ADMIN", status: { in: ["APPROVED", "ACTIVE"] },
      }});
      assertLastAdminSafe({
        targetIsActiveAdmin: target.role === "ADMIN" && ["APPROVED", "ACTIVE"].includes(target.status),
        activeAdminCount,
        removingAdmin: action === "disable" || action === "remove_admin" || action === "hide",
      });
      const data = action === "hide"
        ? { hiddenAt: new Date(), status: "DISABLED" as const, disabledAt: new Date(), disabledReason: body?.reason?.trim() || "Removed from operational views", authVersion: { increment: 1 } }
        : action === "unhide"
          ? { hiddenAt: null }
          : action === "disable"
        ? { status: "DISABLED" as const, disabledAt: new Date(), disabledReason: body?.reason?.trim() || null }
        : action === "enable"
          ? { status: "APPROVED" as const, disabledAt: null, disabledReason: null }
          : action === "grant_admin"
            ? { role: "ADMIN" as const }
            : { role: "MEMBER" as const };
      const updated = await tx.user.update({ where: { id: userId }, data });
      const auditAction = {
        disable: "USER_DISABLED", enable: "USER_ENABLED",
        grant_admin: "ADMIN_GRANTED", remove_admin: "ADMIN_REMOVED",
        hide: "USER_HIDDEN", unhide: "USER_UNHIDDEN",
      }[action];
      await tx.auditEvent.create({ data: {
        operationId: randomUUID(), actorUserId: access.user.id,
        actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
        action: auditAction, entityType: "User", entityId: userId,
        previousData: { status: target.status, role: target.role },
        newData: { status: updated.status, role: updated.role }, reason: body?.reason?.trim() || null,
      }});
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ user });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "LAST_ACTIVE_ADMIN") return NextResponse.json({ error: "The last active administrator cannot be disabled or changed to a member." }, { status: 409 });
    if (code === "NOT_FOUND") return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (code === "DUPLICATE_EMAIL") return NextResponse.json({ error: "That email is already registered." }, { status: 409 });
    if (code === "INVALID") return NextResponse.json({ error: "Enter a valid name and email." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Could not update the user." }, { status: 500 });
  }
}
