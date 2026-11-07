import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  importBatch: { findFirst: vi.fn() }, user: { findMany: vi.fn() }, transaction: vi.fn(),
}));

vi.mock("./prisma", () => ({ default: {
  importBatch: database.importBatch,
  user: database.user,
  $transaction: database.transaction,
} }));

import { canAdminister, type AccessUser } from "./auth-policy";
import { analyzeScheduleIdentities, previewScheduleImport, replaceSchedule } from "./schedule-import";
import { applyVolunteerImport, parseVolunteerImport, previewVolunteerImport } from "./volunteer-import";

const admin: AccessUser = { id: "admin-1", email: "admin@example.com", normalizedEmail: "admin@example.com", firstName: "Active", lastName: "Admin", status: "ACTIVE", role: "ADMIN" };
const volunteerCsv = "First Name,Last Name,Email\n Ada , Lovelace , ADA@Example.COM \n";
const scheduleCsv = "Date,EventName,Notes,SlotTime,MaxVols,IsOpen,Vol1,Vol2,Vol3,Vol4\n2026-08-28,Pizza party,,5pm-7pm,2,true,Ada Lovelace,Shared Name,,\n";

beforeEach(() => { vi.clearAllMocks(); database.importBatch.findFirst.mockResolvedValue(null); database.user.findMany.mockResolvedValue([]); });

describe("Import authorization", () => {
  it("allows only ACTIVE ADMIN users", () => {
    expect(canAdminister(admin)).toBe(true);
    expect(canAdminister({ ...admin, role: "MEMBER" })).toBe(false);
    expect(canAdminister({ ...admin, status: "APPROVED" })).toBe(false);
    expect(canAdminister(null)).toBe(false);
  });
  it("guards the page and both APIs with database-backed admin authorization", () => {
    expect(readFileSync("app/admin/import/page.tsx", "utf8")).toContain("requireAdmin");
    expect(readFileSync("app/api/admin/import/route.ts", "utf8")).toContain("authorizeAdminRequest");
    expect(readFileSync("app/api/admin/import/volunteers/route.ts", "utf8")).toContain("authorizeAdminRequest");
  });
});

describe("Volunteer import safety", () => {
  it("normalizes email and rejects duplicate normalized emails", () => {
    expect(parseVolunteerImport(volunteerCsv).rows[0].normalizedEmail).toBe("ada@example.com");
    const duplicate = parseVolunteerImport("First,Last,Email\nA,One,A@EXAMPLE.COM\nA,Two,a@example.com\n");
    expect(duplicate.rows).toHaveLength(1); expect(duplicate.rejected[0]).toContain("duplicate email");
  });
  it("previews new, changed, and unchanged users", async () => {
    database.user.findMany.mockResolvedValue([{ normalizedEmail: "ada@example.com", firstName: "Ada", lastName: "Old" }]);
    expect((await previewVolunteerImport(volunteerCsv)).counts).toMatchObject({ updates: 1, newRecords: 0 });
  });
  it("preserves an existing admin and creates no identity or notification", async () => {
    const update = vi.fn(); const create = vi.fn(); const auditCreate = vi.fn(); const batchCreate = vi.fn(async () => ({ id: "batch-1", operationId: "operation-1" }));
    const tx = { importBatch: { create: batchCreate }, user: { findUnique: vi.fn(async () => ({ ...admin, firstName: "Old" })), update, create }, auditEvent: { create: auditCreate } };
    database.transaction.mockImplementation(async (callback) => callback(tx));
    const preview = await previewVolunteerImport(volunteerCsv); await applyVolunteerImport(preview, "volunteers.csv", admin);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" } }));
    expect(create).not.toHaveBeenCalled(); expect(tx).not.toHaveProperty("notification"); expect(tx).not.toHaveProperty("externalIdentity");
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "VOLUNTEER_IMPORT_APPLIED" }) }));
  });
  it("creates imported volunteers as APPROVED MEMBER and is idempotent", async () => {
    const create = vi.fn(); const tx = { importBatch: { create: vi.fn(async () => ({ id: "batch-1", operationId: "op-1" })) }, user: { findUnique: vi.fn(async () => null), create }, auditEvent: { create: vi.fn() } };
    database.transaction.mockImplementation(async (callback) => callback(tx)); const preview = await previewVolunteerImport(volunteerCsv);
    await applyVolunteerImport(preview, "volunteers.csv", admin);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", role: "MEMBER" }) }));
    database.importBatch.findFirst.mockResolvedValue({ id: "batch-1", operationId: "op-1" }); database.transaction.mockClear();
    expect((await applyVolunteerImport(preview, "volunteers.csv", admin)).repeated).toBe(true); expect(database.transaction).not.toHaveBeenCalled();
  });
});

describe("Schedule import safety", () => {
  it("links only deterministic users and flags ambiguous names", async () => {
    database.user.findMany.mockResolvedValue([{ normalizedEmail: "ada@example.com", volunteerProfiles: [{ id: "ada", firstName: "Ada", lastName: "Lovelace", relationship: "PRIMARY" }] }, { normalizedEmail: "one@example.com", volunteerProfiles: [{ id: "one", firstName: "Shared", lastName: "Name", relationship: "PRIMARY" }] }, { normalizedEmail: "two@example.com", volunteerProfiles: [{ id: "two", firstName: "Shared", lastName: "Name", relationship: "PRIMARY" }] }]);
    const preview = await analyzeScheduleIdentities(previewScheduleImport(scheduleCsv)); const volunteers = preview.events[0].shifts[0].volunteers;
    expect(volunteers[0].volunteerProfileId).toBe("ada"); expect(volunteers[1].volunteerProfileId).toBeUndefined(); expect(preview.warnings.join(" ")).toContain("Ambiguous volunteer name");
  });
  it("does not duplicate an identical applied schedule", async () => {
    database.importBatch.findFirst.mockResolvedValue({ id: "existing", status: "APPLIED" });
    const result = await replaceSchedule(previewScheduleImport(scheduleCsv), "schedule.csv", admin);
    expect(result).toMatchObject({ id: "existing", repeated: true }); expect(database.transaction).not.toHaveBeenCalled();
  });
  it("archives active events rather than hard deleting and records one audit", async () => {
    const updateMany = vi.fn(); const auditCreate = vi.fn(); const tx = { importBatch: { create: vi.fn(async () => ({ id: "batch-1", operationId: "op-1" })) }, event: { updateMany, createManyAndReturn: vi.fn(async ({ data }) => data.map((item: { sourceKey: string }) => ({ id: "event-1", sourceKey: item.sourceKey }))) }, shift: { createManyAndReturn: vi.fn(async ({ data }) => data.map((item: { sourceKey: string }) => ({ id: "shift-1", sourceKey: item.sourceKey }))) }, shiftAssignment: { createMany: vi.fn() }, auditEvent: { create: auditCreate } };
    database.transaction.mockImplementation(async (callback) => callback(tx)); await replaceSchedule(previewScheduleImport(scheduleCsv), "schedule.csv", admin);
    expect(updateMany).toHaveBeenCalledWith({ where: { status: "ACTIVE" }, data: expect.objectContaining({ status: "ARCHIVED", isLocked: true }) });
    expect(tx.shift.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ eventId: "event-1" })]) }));
    expect(tx.shiftAssignment.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ shiftId: "shift-1" })]) });
    expect(tx.event).not.toHaveProperty("deleteMany"); expect(auditCreate).toHaveBeenCalledTimes(1);
  });
});
