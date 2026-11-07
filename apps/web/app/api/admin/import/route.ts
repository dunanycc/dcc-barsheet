import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../lib/authorization";
import {
  previewScheduleImport,
  analyzeScheduleIdentities,
  replaceSchedule,
} from "../../../../lib/schedule-import";
import prisma from "../../../../lib/prisma";

export async function GET() {
  const access = await authorizeAdminRequest(); if (!access.ok) return access.response;
  const batches = await prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const audits = await prisma.auditEvent.findMany({ where: { operationId: { in: batches.map((batch) => batch.operationId) } }, select: { operationId: true, actorNameSnapshot: true } });
  const actors = new Map(audits.map((audit) => [audit.operationId, audit.actorNameSnapshot]));
  return NextResponse.json({ batches: batches.map((batch) => { const snapshot = batch.snapshot as { type?: string; counts?: Record<string, number> } | null; return { id: batch.id, createdAt: batch.createdAt, appliedAt: batch.appliedAt, status: batch.status, sourceFileName: batch.sourceFileName, type: snapshot?.type === "VOLUNTEERS" ? "VOLUNTEERS" : "SCHEDULE", actor: actors.get(batch.operationId) || "System", counts: snapshot?.counts || { events: batch.eventCount, shifts: batch.shiftCount, signups: batch.signupCount, warnings: batch.warningCount }, warnings: batch.warningCount }; }) });
}

export async function POST(request: NextRequest) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const apply = form.get("apply") === "true";
    const confirmedHash = String(form.get("confirmedHash") ?? "");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a CSV file." }, { status: 400 });
    }
    if (file.size > 5_000_000) {
      return NextResponse.json({ error: "CSV must be smaller than 5 MB." }, { status: 400 });
    }

    const preview = await analyzeScheduleIdentities(previewScheduleImport(await file.text()));
    if (!apply) {
      return NextResponse.json({
        sourceHash: preview.sourceHash,
        counts: preview.counts,
        warnings: preview.warnings,
      });
    }
    if (!confirmedHash || confirmedHash !== preview.sourceHash) {
      return NextResponse.json(
        { error: "The file changed after preview. Preview it again." },
        { status: 409 },
      );
    }

    const batch = await replaceSchedule(preview, file.name, access.user);
    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      repeated: "repeated" in batch && batch.repeated,
      counts: preview.counts,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 400 },
    );
  }
}
