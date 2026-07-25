import { BookingRequest, FieldFormat, PaymentRecord, PaymentStatus, RequestStatus } from "./types";
import { bookingEndTime, bookingSlots } from "./time";

const ACTIVE_STATUSES: RequestStatus[] = ["new", "in_progress", "confirmed"];
const QUARTERS = ["A", "B", "C", "D"] as const;

export function formatLabel(format: FieldFormat) {
  if (format === "quarter") return "1/4 поля";
  if (format === "half") return "1/2 поля";
  return "Поле целиком";
}

export function normalizeSectorParts(sector: string) {
  return sector
    .split("+")
    .map((part) => part.trim().toUpperCase())
    .filter((part): part is typeof QUARTERS[number] => QUARTERS.includes(part as typeof QUARTERS[number]));
}

export function occupiedQuarters(format: FieldFormat, sector: string) {
  const parts = normalizeSectorParts(sector);
  if (format === "full") return [...QUARTERS];
  if (parts.length > 0) return Array.from(new Set(parts));
  if (format === "half") return ["A", "B"];
  return ["A"];
}

export function isActiveBooking(status: RequestStatus) {
  return ACTIVE_STATUSES.includes(status);
}

export function paymentStatusFor(price: number, paid: number): PaymentStatus {
  if (paid <= 0) return "unpaid";
  if (paid >= price) return "paid";
  return "deposit";
}

export function totalPaid(payments: PaymentRecord[]) {
  return payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

export function normalizePayments(
  payments: unknown,
  fallbackAmount = 0,
  fallbackDate = "",
  fallbackMethod = "",
  fallbackRecipient = "",
) {
  const parsed = Array.isArray(payments) ? payments : [];
  const normalized = parsed
    .map((payment, index) => {
      const item = payment as Partial<PaymentRecord>;
      const amount = Number(item.amount) || 0;
      if (amount <= 0) return null;
      return {
        id: String(item.id || `PAY-${index + 1}-${Date.now()}`),
        amount,
        date: String(item.date || fallbackDate || "").slice(0, 10),
        method: String(item.method || fallbackMethod || "Не выбран"),
        recipient: String(item.recipient || fallbackRecipient || "Не выбран"),
      };
    })
    .filter((payment): payment is PaymentRecord => Boolean(payment));

  if (normalized.length > 0) return normalized;
  if ((Number(fallbackAmount) || 0) <= 0) return [];

  return [{
    id: `PAY-LEGACY-${Date.now()}`,
    amount: Number(fallbackAmount) || 0,
    date: String(fallbackDate || "").slice(0, 10),
    method: String(fallbackMethod || "Не выбран"),
    recipient: String(fallbackRecipient || "Не выбран"),
  }];
}

export function enrichBooking(request: BookingRequest): BookingRequest {
  const listPrice = Number(request.listPrice || request.price) || 0;
  const salePrice = Number(request.salePrice || request.price || listPrice) || 0;
  const payments = normalizePayments(
    request.payments,
    request.prepayment,
    request.paidAt,
    request.paymentMethod,
    request.paymentRecipient,
  );
  const prepayment = totalPaid(payments);
  const balance = Math.max(0, salePrice - prepayment);
  const latestPayment = payments.at(-1);

  return {
    ...request,
    price: salePrice,
    listPrice,
    salePrice,
    updatedAt: request.updatedAt || request.createdAt || "",
    confirmedAt: request.confirmedAt || "",
    cancelledAt: request.cancelledAt || "",
    payments,
    prepayment,
    balance,
    paymentStatus: paymentStatusFor(salePrice, prepayment),
    paymentMethod: latestPayment?.method || request.paymentMethod || "Не выбран",
    paymentRecipient: latestPayment?.recipient || request.paymentRecipient || "Не выбран",
    paidAt: latestPayment?.date || request.paidAt || "",
    comment: request.comment || "",
    deletedAt: request.deletedAt || "",
    source: request.source || "Сайт",
    sourceDetail: request.sourceDetail || "",
  };
}

export function findBookingConflict(
  bookings: BookingRequest[],
  candidate: Pick<BookingRequest, "id" | "date" | "time" | "duration" | "format" | "sector">,
) {
  const candidateSlots = bookingSlots(candidate.time, Number(candidate.duration) || 60);
  const candidateQuarters = occupiedQuarters(candidate.format, candidate.sector);

  return bookings.find((booking) => {
    if (booking.id === candidate.id) return false;
    if (booking.date !== candidate.date) return false;
    if (!isActiveBooking(booking.status)) return false;

    const sameTime = bookingSlots(booking.time, booking.duration).some((slot) => candidateSlots.includes(slot));
    if (!sameTime) return false;

    return occupiedQuarters(booking.format, booking.sector).some((part) => candidateQuarters.includes(part));
  });
}

export function conflictMessage(conflict: BookingRequest) {
  return `Конфликт с бронью ${conflict.time}-${bookingEndTime(conflict.time, conflict.duration)} · ${conflict.name} · ${formatLabel(conflict.format)} · ${conflict.sector}`;
}
