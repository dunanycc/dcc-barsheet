import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("schedule year cloning policy", () => {
  it("does not treat archived history as an existing target schedule", () => {
    const route = readFileSync("app/api/admin/schedule/clone-year/route.ts", "utf8");
    expect(route.match(/status: "ACTIVE"/g)).toHaveLength(2);
  });

  it("shows the explanatory API message in the create-year dialog", () => {
    const client = readFileSync("app/admin/admin-client.tsx", "utf8");
    expect(client).toContain("payload.message || payload.error");
    expect(client).toContain('message={notice}');
  });
});
