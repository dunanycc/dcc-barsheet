import { describe, expect, it } from "vitest";
import { defaultScheduleYear } from "./default-schedule-year";
const events = (...dates: string[]) => dates.map(date => ({ date }));
describe("default schedule year", () => {
  it("moves to next year when this year's events have passed", () => expect(defaultScheduleYear(events("2026-10-01", "2027-05-01"), "2026-11-07")).toBe("2027"));
  it("stays this year if next year has no events", () => expect(defaultScheduleYear(events("2026-10-01"), "2026-11-07")).toBe("2026"));
  it("keeps events happening today visible", () => expect(defaultScheduleYear(events("2026-11-07", "2027-05-01"), "2026-11-07")).toBe("2026"));
  it("stays this year while future events remain", () => expect(defaultScheduleYear(events("2026-12-01", "2027-05-01"), "2026-11-07")).toBe("2026"));
  it("does not jump over an empty next year", () => expect(defaultScheduleYear(events("2028-05-01"), "2026-11-07")).toBe("2026"));
  it("uses current year for an empty schedule", () => expect(defaultScheduleYear([], "2026-11-07")).toBe("2026"));
  it("uses next year when it has events and current year is empty", () => expect(defaultScheduleYear(events("2027-05-01"), "2026-11-07")).toBe("2027"));
});
