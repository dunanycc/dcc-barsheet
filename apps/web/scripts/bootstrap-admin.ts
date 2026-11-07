import { randomUUID } from "node:crypto";
import { config } from "dotenv";

async function main() {
  config({ path: ".env.local", quiet: true });
  const configured = process.env.BOOTSTRAP_ADMIN_EMAILS;
  if (!configured) throw new Error("BOOTSTRAP_ADMIN_EMAILS is required.");
  const { normalizeEmail } = await import("../lib/auth-policy");
  const { default: prisma } = await import("../lib/prisma");
  const emails = [...new Set(configured.split(",").map(normalizeEmail).filter(Boolean))];
  if (!emails.length) throw new Error("BOOTSTRAP_ADMIN_EMAILS contains no valid entries.");

  let changed = 0;
  for (const email of emails) {
    await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { normalizedEmail: email } });
    const user = existing
      ? await tx.user.update({ where: { id: existing.id }, data: {
          role: "ADMIN", status: "ACTIVE", approvedAt: existing.approvedAt ?? new Date(),
          activatedAt: existing.activatedAt ?? new Date(), disabledAt: null, disabledReason: null,
        }})
      : await tx.user.create({ data: {
          email, normalizedEmail: email, firstName: "DCC", lastName: "Administrator",
          role: "ADMIN", status: "ACTIVE", approvedAt: new Date(), activatedAt: new Date(),
        }});
    if (!existing || existing.role !== "ADMIN" || existing.status !== "ACTIVE") {
      await tx.auditEvent.create({ data: {
        operationId: randomUUID(), actorNameSnapshot: "Bootstrap configuration",
        action: "ADMIN_GRANTED", entityType: "User", entityId: user.id,
        previousData: existing ? { role: existing.role, status: existing.status } : undefined,
        newData: { role: "ADMIN", status: "ACTIVE" }, reason: "BOOTSTRAP_ADMIN_EMAILS",
      }});
      changed += 1;
    }
    });
  }
  console.log(`Bootstrap complete. Configured: ${emails.length}; changed: ${changed}.`);
  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Bootstrap failed.");
  process.exitCode = 1;
});
