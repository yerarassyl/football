import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { enrichBooking, paymentStatusFor, totalPaid } from "@/lib/booking";
import { getRequests } from "@/lib/db";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { BookingRequest } from "@/lib/types";

/**
 * PATCH /api/bookings/batch/client-debt
 *
 * Adjusts the debt of all confirmed bookings for a client (grouped by phone).
 * Body: { phone: string; newBalance: number }
 *
 * - newBalance === 0: zeroes all balances, marks every booking as paid.
 * - newBalance > 0: distributes proportionally across bookings with balance > 0.
 */
export async function PATCH(request: NextRequest) {
  if (!verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const phone = String(body.phone || "").replace(/\D/g, "");
    if (phone.length < 10) {
      return NextResponse.json({ error: "Телефон указан неверно" }, { status: 400 });
    }

    const newBalance = Number(body.newBalance);
    if (!Number.isFinite(newBalance) || newBalance < 0) {
      return NextResponse.json({ error: "Сумма долга указана неверно" }, { status: 400 });
    }

    const bookings = await getRequests({ fresh: true });
    const phoneKey = phone.replace(/\D/g, "");

    // Find all confirmed bookings for this client with positive balance
    const clientBookings = bookings.filter((b) => {
      if (b.status !== "confirmed") return false;
      return b.phone.replace(/\D/g, "") === phoneKey;
    });

    if (clientBookings.length === 0) {
      return NextResponse.json({ error: "Брони клиента не найдены" }, { status: 404 });
    }

    const updated: BookingRequest[] = [];
    const now = new Date().toISOString();

    if (newBalance === 0) {
      // Zero out all balances — client is fully paid
      for (const booking of clientBookings) {
        const enriched = enrichBooking(booking);
        const paymentAmount = enriched.balance;
        if (paymentAmount <= 0) {
          updated.push(booking);
          continue;
        }

        const newPayment = {
          id: `PAY-ADJ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          amount: paymentAmount,
          date: now.slice(0, 10),
          method: "",
          recipient: "",
        };

        const payments = [...(Array.isArray(enriched.payments) ? enriched.payments : []), newPayment];
        const prepayment = totalPaid(payments);
        const salePrice = enriched.salePrice;
        const balance = Math.max(0, salePrice - prepayment);

        const patched = enrichBooking({
          ...booking,
          payments,
          prepayment,
          balance,
          paymentStatus: paymentStatusFor(salePrice, prepayment),
          updatedAt: now,
        });

        updated.push(patched);
      }
    } else {
      // Distribute newBalance proportionally
      const totalCurrentDebt = clientBookings.reduce((sum, b) => sum + (Number(b.balance) || 0), 0);
      if (totalCurrentDebt <= 0) {
        return NextResponse.json({ error: "Нет долга для распределения" }, { status: 400 });
      }

      // Calculate new target balance per booking
      const ratio = newBalance / totalCurrentDebt;
      const targetBalances = clientBookings.map((b) => ({
        booking: b,
        targetBalance: Math.round((Number(b.balance) || 0) * ratio),
      }));

      // Adjust rounding so sum equals newBalance
      let remainder = newBalance - targetBalances.reduce((sum, t) => sum + t.targetBalance, 0);
      for (const t of targetBalances) {
        if (remainder === 0) break;
        t.targetBalance += remainder > 0 ? 1 : -1;
        remainder += remainder > 0 ? -1 : 1;
      }

      for (const { booking, targetBalance } of targetBalances) {
        const enriched = enrichBooking(booking);
        const salePrice = enriched.salePrice;
        const prepayment = Math.max(0, salePrice - targetBalance);
        const balance = Math.max(0, salePrice - prepayment);

        // Rebuild payments to match the new prepayment
        const existingPayments = Array.isArray(enriched.payments) ? enriched.payments : [];
        const currentPaid = totalPaid(existingPayments);

        let payments = existingPayments;
        if (prepayment > currentPaid) {
          // Need to add a payment
          payments = [
            ...existingPayments,
            {
              id: `PAY-ADJ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              amount: prepayment - currentPaid,
              date: now.slice(0, 10),
              method: "",
              recipient: "",
            },
          ];
        } else if (prepayment < currentPaid && existingPayments.length > 0) {
          // Need to reduce — scale down proportionally
          const scale = currentPaid > 0 ? prepayment / currentPaid : 0;
          payments = existingPayments.map((p) => ({
            ...p,
            amount: Math.round((Number(p.amount) || 0) * scale),
          })).filter((p) => Number(p.amount) > 0);
        }

        const patched = enrichBooking({
          ...booking,
          payments,
          prepayment,
          balance,
          paymentStatus: paymentStatusFor(salePrice, prepayment),
          updatedAt: now,
        });

        updated.push(patched);
      }
    }

    // Persist to Supabase
    if (isSupabaseConfigured()) {
      const supabase = getSupabase()!;
      for (const booking of updated) {
        const row = {
          payments: JSON.stringify(booking.payments),
          prepayment: booking.prepayment,
          balance: booking.balance,
          payment_status: booking.paymentStatus,
          updated_at: booking.updatedAt,
        };
        const { error } = await supabase.from("bookings").update(row).eq("id", booking.id);
        if (error) {
          console.error("Failed to update booking", booking.id, error);
        }
      }
    }

    // Invalidate cache by setting fresh timestamp
    if (typeof globalThis !== "undefined") {
      const existing = globalThis.__airArenaBookingsCache;
      if (existing) {
        existing.expiresAt = 0;
      }
    }

    return NextResponse.json({ updated: updated.length, totalBookings: clientBookings.length });
  } catch (error) {
    console.error("Failed to adjust client debt", error);
    return NextResponse.json({ error: "Не удалось скорректировать долг" }, { status: 500 });
  }
}
