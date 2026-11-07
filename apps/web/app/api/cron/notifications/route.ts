import { NextRequest, NextResponse } from "next/server";
import { processOutbox } from "../../../../lib/notification-processor";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron processing is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(await processOutbox({ failedOnly: true, limit: 20 }));
}
