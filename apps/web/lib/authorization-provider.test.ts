import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "./authorization";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn() }));
vi.mock("../auth", () => ({ auth: mocks.auth }));
vi.mock("./prisma", () => ({ default: { user: { findUnique: mocks.findUnique } } }));

beforeEach(() => vi.resetAllMocks());

describe("administrator session provider enforcement", () => {
  it.each([
    ["ADMIN", "google", true],
    ["ADMIN", "yahoo", true],
    ["ADMIN", "approved-email", false],
    ["ADMIN", undefined, false],
    ["MEMBER", "approved-email", true],
    ["MEMBER", undefined, true],
  ])("role %s and provider %s: access=%s", async (role, authProvider, allowed) => {
    const user = { id: "user-1", role, status: "ACTIVE", authVersion: 1 };
    mocks.auth.mockResolvedValue({ user: { id: user.id, authVersion: 1, authProvider } });
    mocks.findUnique.mockResolvedValue(user);
    expect(await getCurrentUser()).toEqual(allowed ? user : null);
  });
});
