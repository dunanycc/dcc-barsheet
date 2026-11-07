import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminScheduleYearPicker } from "./admin-nav";
const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void>, setValue: vi.fn(), setYears: vi.fn() }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void) => hooks.effects.push(effect),
  useState: (initial: unknown) => [initial, Array.isArray(initial) ? hooks.setYears : hooks.setValue],
  useRef: () => ({ current: false }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));
beforeEach(() => {
  vi.clearAllMocks(); hooks.effects.length = 0;
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-07T17:00:00Z"));
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function settle() { for (let i = 0; i < 6; i++) await Promise.resolve(); }
describe("admin year picker synchronization", () => {
  it("defaults to the same upcoming year as the schedule", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ events: [{ date: "2026-10-01" }, { date: "2027-05-01" }] }) })));
    AdminScheduleYearPicker(); hooks.effects[0](); await settle();
    expect(hooks.setValue).toHaveBeenLastCalledWith("2027");
  });
  it.each([2027, "All Years"])("does not let a late fetch overwrite the displayed %s selection", async detail => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(done => { resolve = done; })));
    AdminScheduleYearPicker(); hooks.effects[0]();
    window.dispatchEvent(new CustomEvent("schedule-year-change", { detail }));
    resolve({ ok: true, json: async () => ({ events: [{ date: "2026-12-01" }, { date: "2027-05-01" }] }) });
    await settle();
    expect(hooks.setValue).toHaveBeenCalledTimes(1);
    expect(hooks.setValue).toHaveBeenLastCalledWith(detail === "All Years" ? "all" : "2027");
  });
});
