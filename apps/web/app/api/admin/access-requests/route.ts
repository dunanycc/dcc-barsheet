import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../lib/authorization";
import prisma from "../../../../lib/prisma";

export async function GET() {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const requests = await prisma.accessRequest.findMany({
    where: { status: "PENDING" }, orderBy: { requestedAt: "asc" },
  });
  return NextResponse.json({ requests });
}
