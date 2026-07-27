import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { BookingConflictError, createRequestIfAvailable, getRequests } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { notifyAdminsAboutBooking } from "@/lib/telegram";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";
import {
  readJsonObject,
  validateBookingCreate,
  validateInitialAdminState,
  validateSalePrice,
  ValidationError,
} from "@/lib/validation";
import type { BookingRequest } from "@/lib/types";

export async function GET(request: NextRequest) {
  if (!verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  try {
    const bookings = await getRequests();
    return NextResponse.json(bookings);
  } catch (error) {
    console.error("Failed to load bookings", error);
    return NextResponse.json({ error: "Не удалось загрузить брони" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rate = consumeRateLimit(`booking-create:${clientIp(request)}`, 10, 10 * 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Слишком много заявок. Попробуйте позже" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
      );
    }

    const body = await readJsonObject(request);
    const isAdmin = verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value);
    const input = validateBookingCreate(body, { allowPast: isAdmin });
    const settings = await getSettings();
    const hourlyPrice = settings.prices[input.format];
    const listPrice = Math.round(hourlyPrice * (input.duration / 60));
    const salePrice = isAdmin && body.salePrice !== undefined ? validateSalePrice(body.salePrice) : listPrice;

    // For admin-created bookings, force status to be "confirmed"
    const initialState = isAdmin
      ? ({
          status: "confirmed" as BookingRequest["status"],
          ...(body.comment !== undefined && body.comment !== null ? { comment: String(body.comment) } : {}),
        } as { status: BookingRequest["status"]; comment?: string })
      : validateInitialAdminState(body);

    const booking = await createRequestIfAvailable({
      ...input,
      listPrice,
      salePrice,
      price: salePrice,
    }, initialState);
    void notifyAdminsAboutBooking(booking).catch((error) => {
      console.error("Telegram notification failed", error);
    });

    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof BookingConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to create booking", error);
    return NextResponse.json({ error: "Не удалось создать заявку" }, { status: 500 });
  }
}
