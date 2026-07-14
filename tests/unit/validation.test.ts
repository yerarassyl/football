import { describe, expect, it } from "vitest";
import {
  ValidationError,
  validateBookingCreate,
  validateBookingPatch,
  validateSettings,
} from "@/lib/validation";

const validBooking = {
  date: "2099-07-14",
  time: "19:00",
  duration: 60,
  format: "quarter",
  sector: "A",
  name: "QA Client",
  phone: "+7 700 000 00 00",
  team: "QA Team",
  source: "Test",
};

describe("booking validation", () => {
  it("normalizes a valid booking", () => {
    expect(validateBookingCreate(validBooking)).toMatchObject({
      time: "19:00",
      duration: 60,
      format: "quarter",
      sector: "A",
    });
  });

  it.each([
    [{ ...validBooking, time: "19:15" }, "Время"],
    [{ ...validBooking, format: "unknown" }, "формат"],
    [{ ...validBooking, sector: "A+B" }, "Сектор"],
    [{ ...validBooking, phone: "123" }, "Телефон"],
    [{ ...validBooking, time: "23:30", duration: 60 }, "завершиться"],
  ])("rejects invalid payload %#", (payload, message) => {
    expect(() => validateBookingCreate(payload)).toThrow(message);
  });

  it("rejects invalid payments before persistence", () => {
    expect(() => validateBookingPatch({
      payments: [{ id: "P-1", amount: -1, date: "2099-07-14", method: "Cash", recipient: "Arena" }],
    })).toThrow(ValidationError);
  });

  it("rejects zero prices", () => {
    expect(() => validateSettings({ prices: { quarter: 0, half: 1, full: 1 } })).toThrow(ValidationError);
  });
});
