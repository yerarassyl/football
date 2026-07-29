import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { createRequestsIfAvailable } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { notifyAdminsAboutBooking } from "@/lib/telegram";
import {
  readJsonObject,
  validateBookingCreate,
  validateInitialAdminState,
  validateSalePrice,
  ValidationError,
} from "@/lib/validation";

const MAX_SERIES_SIZE = 366;

export async function POST(request: NextRequest) {
  if (!verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const body = await readJsonObject(request);
    if (!Array.isArray(body.bookings) || body.bookings.length === 0) {
      throw new ValidationError("Выберите хотя бы одну дату");
    }
    if (body.bookings.length > MAX_SERIES_SIZE) {
      throw new ValidationError(`За один раз можно создать не более ${MAX_SERIES_SIZE} бронирований`);
    }

    const settings = await getSettings();
    const entries = body.bookings.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new ValidationError("Данные бронирования указаны неверно");
      }
      const booking = raw as Record<string, unknown>;
      const input = validateBookingCreate(booking, { allowPast: true });
      const hourlyPrice = settings.prices[input.format];
      const listPrice = Math.round(hourlyPrice * (input.duration / 60));
      const salePrice = booking.salePrice === undefined ? listPrice : validateSalePrice(booking.salePrice);

      return {
        input: {
          ...input,
          listPrice,
          salePrice,
          price: salePrice,
        },
        initial: validateInitialAdminState(booking),
      };
    });

    const result = await createRequestsIfAvailable(entries);
    void Promise.allSettled(result.created.map((booking) => notifyAdminsAboutBooking(booking)));

    return NextResponse.json({
      created: result.created,
      conflicts: result.conflicts.map(({ candidate, conflict }) => ({
        date: candidate.date,
        requestedTime: candidate.time,
        requestedDuration: candidate.duration,
        client: conflict.name,
        time: conflict.time,
        duration: conflict.duration,
        format: conflict.format,
        sector: conflict.sector,
      })),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to create booking series", error);
    return NextResponse.json({ error: "Не удалось создать серию бронирований" }, { status: 500 });
  }
}
