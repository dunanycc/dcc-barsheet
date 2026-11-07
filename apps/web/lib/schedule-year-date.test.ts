import { describe, expect, it } from "vitest";
import { nearestMatchingWeekday } from "./schedule-year-date";

describe("nearestMatchingWeekday", () => {
  it("moves an event to the closest matching weekday", () => {
    expect(nearestMatchingWeekday("2026-08-28", 2027)).toBe("2027-08-27");
  });

  it("handles leap-day events", () => {
    expect(nearestMatchingWeekday("2024-02-29", 2025)).toBe("2025-02-27");
  });

  it("keeps the cloned date inside the target year", () => {
    expect(nearestMatchingWeekday("2022-01-01", 2023)).toBe("2023-01-07");
  });

  it("preserves an anniversary that already falls on the same weekday", () => {
    expect(nearestMatchingWeekday("2023-03-15", 2028)).toBe("2028-03-15");
  });
});
