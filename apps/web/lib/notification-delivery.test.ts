import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { escapeHtml, renderNotification } from "./email-templates";
import { gmailTransportOptions, senderIdentity, validateMailEnvironment } from "./mail-config";

vi.mock("./mailer", () => ({ sendTransactionalMail: vi.fn() }));
vi.mock("./prisma", () => ({ default: {} }));

type Row = { id: string; operationId: string; type: string; status: string; recipientEmail: string; payload: Record<string, unknown>; attemptCount: number; createdAt: Date; nextAttemptAt: Date | null; claimedAt: Date | null; claimToken: string | null; lastAttemptAt: Date | null; lastError: string | null; sentAt: Date | null };
function fakeDb(initial: Row[]) {
  const rows = initial;
  const notification = {
    async findMany(args: { where: { id?: string | { in: string[] }; operationId?: string; status: { in: string[] } }; take: number }) { return rows.filter((row) => (!args.where.id || (typeof args.where.id === "string" ? row.id === args.where.id : args.where.id.in.includes(row.id))) && (!args.where.operationId || row.operationId === args.where.operationId) && args.where.status.in.includes(row.status) && row.attemptCount < 5 && (!row.nextAttemptAt || row.nextAttemptAt <= new Date())).slice(0, args.take).map(({ id }) => ({ id })); },
    async findUniqueOrThrow(args: { where: { claimToken: string } }) { const row = rows.find((item) => item.claimToken === args.where.claimToken); if (!row) throw new Error("not found"); return row; },
    async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      let count = 0;
      for (const row of rows) {
        if (args.where.id && row.id !== args.where.id) continue;
        if (args.where.claimToken && row.claimToken !== args.where.claimToken) continue;
        const status = args.where.status as string | { in?: string[] } | undefined;
        if (typeof status === "string" && row.status !== status) continue;
        if (status && typeof status === "object" && status.in && !status.in.includes(row.status)) continue;
        if (!args.where.id && row.status !== "PROCESSING") continue;
        count += 1;
        for (const [key, value] of Object.entries(args.data)) {
          if (key === "attemptCount" && value && typeof value === "object") row.attemptCount += Number((value as { increment: number }).increment);
          else (row as unknown as Record<string, unknown>)[key] = value;
        }
      }
      return { count };
    },
  };
  return { rows, db: { notification } };
}
function pending(): Row { return { id: "notification-1", operationId: "operation-1", type: "TEST_EMAIL", status: "PENDING", recipientEmail: "test@example.com", payload: { firstName: "Jane" }, attemptCount: 0, createdAt: new Date(), nextAttemptAt: null, claimedAt: null, claimToken: null, lastAttemptAt: null, lastError: null, sentAt: null }; }

describe("Gmail configuration and templates", () => {
  const env = { GMAIL_USER: "sender@example.com", GMAIL_APP_PASSWORD: "test-password" };
  it("validates credentials and configures secure Gmail SMTP", () => { expect(validateMailEnvironment(env).user).toBe("sender@example.com"); expect(gmailTransportOptions(env)).toMatchObject({ host: "smtp.gmail.com", port: 465, secure: true }); expect(senderIdentity(env)).toEqual({ name: "DCC Bar Schedule", address: "sender@example.com" }); });
  it("rejects missing credentials with a safe message", () => expect(() => validateMailEnvironment({})).toThrow("Gmail delivery is not configured."));
  it("escapes user-controlled HTML and renders text plus HTML", () => { expect(escapeHtml('<script>"x"</script>')).toBe("&lt;script&gt;&quot;x&quot;&lt;/script&gt;"); const email = renderNotification("INITIAL_AUTHORIZATION", { firstName: "<Jane>" }); expect(email.text).toContain("<Jane>"); expect(email.html).toContain("&lt;Jane&gt;"); expect(email.html).not.toContain("<Jane>"); });
});

describe("outbox processing", () => {
  it("marks a sent notification and never resends it", async () => { const { rows, db } = fakeDb([pending()]); const send = vi.fn().mockResolvedValue(undefined); const { processOutbox } = await import("./notification-processor"); expect(await processOutbox({ db: db as never, send, limit: 1 })).toEqual({ processed: 1, sent: 1, failed: 0 }); expect(rows[0].status).toBe("SENT"); await processOutbox({ db: db as never, send, limit: 1 }); expect(send).toHaveBeenCalledTimes(1); });
  it("keeps failures retryable without undoing the durable row", async () => { const { rows, db } = fakeDb([pending()]); const send = vi.fn().mockRejectedValueOnce(Object.assign(new Error("secret provider response"), { code: "EAUTH" })).mockResolvedValueOnce(undefined); const { processOutbox } = await import("./notification-processor"); expect((await processOutbox({ db: db as never, send })).failed).toBe(1); expect(rows[0]).toMatchObject({ status: "FAILED", attemptCount: 1, lastError: "Email provider error (EAUTH)." }); rows[0].nextAttemptAt = new Date(0); expect((await processOutbox({ db: db as never, send })).sent).toBe(1); });
  it("allows only one concurrent claim to deliver a row", async () => { const { db } = fakeDb([pending()]); const send = vi.fn().mockResolvedValue(undefined); const { processOutbox } = await import("./notification-processor"); await Promise.all([processOutbox({ db: db as never, send }), processOutbox({ db: db as never, send })]); expect(send).toHaveBeenCalledTimes(1); });
  it("immediate delivery processes only the new operation", async () => { const older = { ...pending(), id: "older", operationId: "older-operation" }; const current = { ...pending(), id: "current", operationId: "current-operation" }; const { rows, db } = fakeDb([older, current]); const send = vi.fn().mockResolvedValue(undefined); const { processOutbox } = await import("./notification-processor"); expect((await processOutbox({ db: db as never, send, operationId: "current-operation" })).sent).toBe(1); expect(rows.find((row) => row.id === "older")?.status).toBe("PENDING"); });
  it("daily recovery ignores historical pending mail and retries failures only", async () => { const historical = { ...pending(), id: "historical" }; const failed = { ...pending(), id: "failed", status: "FAILED" }; const { rows, db } = fakeDb([historical, failed]); const send = vi.fn().mockResolvedValue(undefined); const { processOutbox } = await import("./notification-processor"); expect((await processOutbox({ db: db as never, send, failedOnly: true })).sent).toBe(1); expect(rows.find((row) => row.id === "historical")?.status).toBe("PENDING"); });
});

describe("notification integration and authorization surface", () => {
  it.each([
    ["app/api/admin/users/route.ts", "INITIAL_AUTHORIZATION"], ["app/api/admin/access-requests/[requestId]/route.ts", "ACCESS_APPROVED"],
    ["app/api/assignments/[assignmentId]/replace/route.ts", "ASSIGNMENT_REPLACED"], ["app/api/admin/events/[eventId]/route.ts", "EVENT_CANCELLED"],
  ])("queues %s using %s", (file, type) => expect(readFileSync(file, "utf8")).toContain(`type: "${type}"`));
  it("protects processing and test-email endpoints with database-backed ADMIN authorization", () => {
    for (const file of ["app/api/admin/notifications/route.ts", "app/api/admin/notifications/test/route.ts", "app/api/admin/notifications/[notificationId]/retry/route.ts"]) expect(readFileSync(file, "utf8")).toContain("authorizeAdminRequest");
  });
  it("uses immediate delivery and a secret-protected failed-only daily recovery", () => {
    expect(readFileSync("app/api/admin/users/route.ts", "utf8")).toContain("deliverNewNotifications");
    const cron = readFileSync("app/api/cron/notifications/route.ts", "utf8");
    expect(cron).toContain("CRON_SECRET"); expect(cron).toContain("failedOnly: true");
  });
});


describe("shift cancellation email wording", () => {
  it("clearly describes the cancelled shift and thanks the volunteer", () => {
    const email = renderNotification("ASSIGNMENT_REMOVED", { shiftCancelled: true, firstName: "Jayem", eventName: "Car Rally", eventDate: "2027-10-09", shiftTime: "11pm–Closing" });
    expect(email.subject).toBe("Your DCC Bar Schedule shift has been cancelled");
    for (const body of [email.text, email.html]) {
      expect(body).toContain("An administrator has cancelled the shift listed below.");
      expect(body).toContain("Thank you for volunteering!");
      expect(body).toContain("Car Rally");
      expect(body).toContain("11pm–Closing");
      expect(body).not.toContain("A volunteer has been removed");
    }
  });
  it("retains assignment removal wording when the shift was not cancelled", () => {
    const email = renderNotification("ASSIGNMENT_REMOVED", { volunteerName: "Jane Smith" });
    expect(email.subject).toContain("assignment was removed");
    expect(email.text).toContain("Jane Smith has been removed");
  });
});
