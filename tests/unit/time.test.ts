import { describe, expect, it } from "vitest";
import { arenaDateValue, bookingEndTime, bookingSlots, isValidTime, timeToMinutes } from "@/lib/time";

describe("booking time helpers", () => {
  it("validates only half-hour booking boundaries", () => {
    expect(isValidTime("09:00")).toBe(true);
    expect(isValidTime("23:30")).toBe(true);
    expect(isValidTime("09:15")).toBe(false);
    expect(isValidTime("24:00")).toBe(false);
  });

  it("calculates slots and end time", () => {
    expect(timeToMinutes("19:30")).toBe(1170);
    expect(bookingSlots("19:00", 60)).toEqual(["19:00", "19:30"]);
    expect(bookingEndTime("19:00", 90)).toBe("20:30");
  });

  it("uses the arena timezone for calendar dates", () => {
    expect(arenaDateValue(new Date("2026-07-13T20:30:00.000Z"))).toBe("2026-07-14");
  });
});
