import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../../lib/authorization";
import { applyVolunteerImport, previewVolunteerImport } from "../../../../../lib/volunteer-import";

export async function POST(request: NextRequest) {
  const access = await authorizeAdminRequest(); if (!access.ok) return access.response;
  try {
    const form = await request.formData(); const file = form.get("file"); const apply = form.get("apply") === "true"; const confirmedHash = String(form.get("confirmedHash") || "");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a CSV file." }, { status: 400 });
    if (file.size > 5_000_000) return NextResponse.json({ error: "CSV must be smaller than 5 MB." }, { status: 400 });
    const preview = await previewVolunteerImport(await file.text());
    if (!apply) return NextResponse.json(preview);
    if (!confirmedHash || confirmedHash !== preview.sourceHash) return NextResponse.json({ error: "The file changed after preview. Preview it again." }, { status: 409 });
    const result = await applyVolunteerImport(preview, file.name, access.user);
    return NextResponse.json({ ok: true, batchId: result.batch.id, repeated: result.repeated, created: result.created, updated: result.updated, counts: preview.counts });
  } catch (error) { console.error(error); return NextResponse.json({ error: error instanceof Error ? error.message : "Volunteer import failed." }, { status: 400 }); }
}
