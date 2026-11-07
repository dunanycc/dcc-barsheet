import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseAccessRequestRateLimiter } from "../../../lib/access-request-limiter";
import { normalizeEmail } from "../../../lib/auth-policy";
import prisma from "../../../lib/prisma";

const limiter = new DatabaseAccessRequestRateLimiter();
const DAY = 24 * 60 * 60 * 1000;

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
  const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
  const honeypot = typeof body?.website === "string" ? body.website.trim() : "";
  const ipAddress = clientIp(request);
  const userAgent = request.headers.get("user-agent");
  const operationId = randomUUID();

  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter your first name, last name, and email." }, { status: 400 });
  }
  if (firstName.length > 80 || lastName.length > 80 || email.length > 254) {
    return NextResponse.json({ error: "One or more entries are too long." }, { status: 400 });
  }
  if (honeypot) {
    await prisma.accessRequestAttempt.create({
      data: { normalizedEmail: email, ipAddress, outcome: "HONEYPOT_REJECTED", operationId },
    });
    return NextResponse.json({ state: "SUBMITTED" });
  }

  const limit = await limiter.check({ ipAddress, normalizedEmail: email });
  if (limit !== "OK") {
    await prisma.accessRequestAttempt.create({
      data: { normalizedEmail: email, ipAddress, outcome: limit, operationId },
    });
    return NextResponse.json(
      { error: "Please wait before submitting another access request." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { normalizedEmail: email } });
  if (user?.status === "APPROVED" || user?.status === "ACTIVE") {
    return NextResponse.json({ state: "SIGN_IN" });
  }
  if (user?.status === "DISABLED") return NextResponse.json({ state: "SUBMITTED" });

  const existing = await prisma.accessRequest.findFirst({
    where: { normalizedEmail: email },
    orderBy: { requestedAt: "desc" },
  });
  if (existing?.status === "PENDING") {
    await prisma.accessRequestAttempt.create({
      data: { normalizedEmail: email, ipAddress, outcome: "DUPLICATE_PENDING", operationId },
    });
    return NextResponse.json({ state: "SUBMITTED" });
  }
  if (existing && existing.cooldownUntil > new Date()) {
    await prisma.accessRequestAttempt.create({
      data: { normalizedEmail: email, ipAddress, outcome: "COOLDOWN_REJECTED", operationId },
    });
    return NextResponse.json({ state: "SUBMITTED" });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.accessRequest.create({
        data: {
          email,
          normalizedEmail: email,
          firstName,
          lastName,
          pendingKey: email,
          operationId,
          cooldownUntil: new Date(Date.now() + DAY),
          requestIp: ipAddress,
          userAgent,
        },
      });
      await tx.accessRequestAttempt.create({
        data: { normalizedEmail: email, ipAddress, outcome: "ACCEPTED", operationId },
      });
      await tx.auditEvent.create({
        data: {
          operationId,
          actorNameSnapshot: `${firstName} ${lastName}`,
          actorEmailSnapshot: email,
          action: "ACCESS_REQUESTED",
          entityType: "AccessRequest",
          entityId: created.id,
          newData: { firstName, lastName, normalizedEmail: email, status: "PENDING" },
          ipAddress,
          userAgent,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ state: "SUBMITTED" });
    }
    console.error(error);
    return NextResponse.json({ error: "Your request could not be submitted." }, { status: 500 });
  }
  return NextResponse.json({ state: "SUBMITTED" }, { status: 201 });
}
