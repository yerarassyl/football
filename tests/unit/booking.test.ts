import { describe, expect, it } from "vitest";
import {
  enrichBooking,
  findBookingConflict,
  occupiedQuarters,
  paymentStatusFor,
  totalPaid,
} from "@/lib/booking";
import { BookingRequest } from "@/lib/types";

function booking(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id: "REQ-1",
    createdAt: "2099-07-14T10:00:00.000Z",
    updatedAt: "",
    confirmedAt: "",
    cancelledAt: "",
    date: "2099-07-14",
    time: "19:00",
    duration: 60,
    format: "quarter",
    sector: "A",
    price: 10000,
    listPrice: 10000,
    salePrice: 10000,
    name: "QA Client",
    phone: "+77000000000",
    team: "QA",
    source: "Test",
    sourceDetail: "",
    status: "confirmed",
    paymentStatus: "unpaid",
    prepayment: 0,
    balance: 10000,
    paymentMethod: "",
    paymentRecipient: "",
    paidAt: "",
    comment: "",
    deletedAt: "",
    payments: [],
    ...overrides,
  };
}

describe("booking business rules", () => {
  it("maps field formats to physical quarters", () => {
    expect(occupiedQuarters("quarter", "C")).toEqual(["C"]);
    expect(occupiedQuarters("half", "A+B")).toEqual(["A", "B"]);
    expect(occupiedQuarters("full", "A")).toEqual(["A", "B", "C", "D"]);
  });

  it("detects overlapping active bookings", () => {
    const existing = booking();
    const conflict = findBookingConflict([existing], booking({ id: "REQ-2", time: "19:30", sector: "A" }));
    expect(conflict?.id).toBe(existing.id);
  });

  it("ignores cancelled bookings and non-overlapping sectors", () => {
    expect(findBookingConflict([booking({ status: "cancelled" })], booking({ id: "REQ-2" }))).toBeUndefined();
    expect(findBookingConflict([booking()], booking({ id: "REQ-2", sector: "B" }))).toBeUndefined();
  });

  it("recalculates payments, balance and payment status", () => {
    const payments = [
      { id: "P-1", amount: 4000, date: "2099-07-14", method: "Cash", recipient: "Arena" },
      { id: "P-2", amount: 6000, date: "2099-07-14", method: "Card", recipient: "Arena" },
    ];
    expect(totalPaid(payments)).toBe(10000);
    expect(paymentStatusFor(10000, 4000)).toBe("deposit");
    expect(enrichBooking(booking({ payments })).paymentStatus).toBe("paid");
    expect(enrichBooking(booking({ payments })).balance).toBe(0);
  });
});
