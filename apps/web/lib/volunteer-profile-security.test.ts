import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("VolunteerProfile migration safety", () => {
  const migration = source("prisma/migrations/20260824000000_volunteer_profiles/migration.sql");
  it("backfills one primary profile per User and linked assignments deterministically", () => { expect(migration).toContain('FROM "User"'); expect(migration).toContain('assignment."userId" = profile."userId"'); expect(migration).toContain("profile.\"relationship\" = 'PRIMARY'"); });
  it("uses restrictive foreign keys and partial uniqueness without deleting data", () => { expect(migration).toContain("VolunteerProfile_one_primary_per_user"); expect(migration).toContain("VolunteerProfile_one_active_partner_per_user"); expect(migration).toContain("ON DELETE RESTRICT"); expect(migration).not.toMatch(/DROP TABLE|DELETE FROM/); });
});

describe("Profile and email security", () => {
  const profile = source("app/api/profile/route.ts"); const admin = source("app/api/admin/users/[userId]/route.ts");
  it("does not expose self-service email mutation", () => { expect(profile).not.toContain("normalizedEmail:email"); expect(profile).not.toContain("externalIdentity"); });
  it("limits profile mutation to the authenticated owner's loaded profiles", () => { expect(profile).toContain("userId:access.user.id"); expect(profile).toContain("profiles.find"); expect(profile).toContain("PARTNER_EXISTS"); });
  it("deactivates historical partners instead of deleting them", () => { expect(profile).toContain("data:{active:false}"); expect(profile).not.toContain("volunteerProfile.delete"); });
  it("invalidates sessions and unlinks verification when an Admin changes email", () => { expect(admin).toContain("authVersion:{increment:1}"); expect(admin).toContain("externalIdentity.deleteMany"); expect(admin).toContain("DUPLICATE_EMAIL"); expect(admin).toContain("USER_EMAIL_CHANGED"); });
});

describe("Assignment person ownership", () => {
  it("requires owned active profiles for signup and stores VolunteerProfile", () => { const signup=source("app/api/shifts/[shiftId]/signup/route.ts"); expect(signup).toContain("userId: access.user.id, active: true"); expect(signup).toContain("PROFILE_REQUIRED"); expect(signup).toContain("volunteerProfileId: profile.id"); });
  it("authorizes removal through profile ownership", () => { const removal=source("app/api/assignments/[assignmentId]/route.ts"); expect(removal).toContain("assignment.volunteerProfile?.userId !== access.user.id"); });
  it("keeps replacement actor separate from selected person", () => { const replacement=source("app/api/assignments/[assignmentId]/replace/route.ts"); expect(replacement).toContain("volunteerProfileId: profile.id"); expect(replacement).toContain("actorUserId: access.user.id"); });
});

describe("Profile-aware notifications and imports", () => {
  it("names the actual volunteer while using the owning account recipient", () => { const removal=source("app/api/assignments/[assignmentId]/route.ts"); expect(removal).toContain("recipientEmail: access.user.normalizedEmail"); expect(removal).toContain("volunteerName: assignment.enteredName"); });
  it("creates one primary profile for imported users and matches schedules to profiles", () => { expect(source("lib/volunteer-import.ts")).toContain('relationship: "PRIMARY"'); expect(source("lib/schedule-import.ts")).toContain("volunteerProfileId: match.id"); });
});
