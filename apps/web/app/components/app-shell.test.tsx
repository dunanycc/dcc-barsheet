import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AccessUser } from "../../lib/auth-policy";
import AccountMenu from "./account-menu";
import { adminNavigation } from "../admin/admin-nav";

vi.mock("../sign-out-form", () => ({ default: () => <button type="button">Sign out</button> }));

const member: AccessUser = { id: "member-1", email: "member@example.com", normalizedEmail: "member@example.com", firstName: "Mae", lastName: "Member", status: "ACTIVE", role: "MEMBER" };
const admin: AccessUser = { ...member, id: "admin-1", firstName: "Ada", lastName: "Admin", role: "ADMIN" };

describe("authenticated application shell", () => {
  it("shows account identity and keeps navigation out of the account menu", () => {
    const adminMarkup = renderToStaticMarkup(<AccountMenu user={admin} />);
    const memberMarkup = renderToStaticMarkup(<AccountMenu user={member} />);
    expect(adminMarkup).toContain("Ada Admin"); expect(adminMarkup).toContain("Administrator");
    expect(adminMarkup).not.toContain("My profile"); expect(adminMarkup).not.toContain("href=");
    expect(memberMarkup).toContain("Mae Member"); expect(memberMarkup).not.toContain("Administrator");
  });

  it("marks exactly one primary admin destination active", () => {
    const navigation = adminNavigation("/admin/history");
    expect(navigation.filter((item) => item.active)).toEqual([expect.objectContaining({ label: "History" })]);
    expect(navigation[1]).toEqual(expect.objectContaining({ href: "/admin/users", label: "Users", active: false }));
    expect(navigation[2]).toEqual(expect.objectContaining({ href: "/", label: "Volunteer View", active: false }));
  });

  it("keeps responsive structures on dense mobile surfaces", () => {
    const admin = readFileSync("app/admin/admin-client.tsx", "utf8");
    const users = readFileSync("app/admin/users/users-client.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");
    expect(admin).toContain('aria-labelledby="add-event-title"');
    expect(admin).toContain('role="dialog"');
    expect(users).toContain('data-label="Email"');
    expect(css).toContain("calc(100vw - 1.5rem)");
    expect(css).toContain(".slot-admin-table thead { display: none; }");
  });
});
