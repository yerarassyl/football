import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { BookingConflictError, createRequestIfAvailable, getRequests } from "@/lib/sheets";
import { getSettings } from "@/lib/settings";
import { notifyAdminsAboutBooking } from "@/lib/telegram";
import { BookingInput } from "@/lib/types";

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
    const body = (await request.json()) as Partial<BookingInput>;
    if (!body.date || !body.time || !body.format || !body.sector || !body.name || !body.phone) {
      return NextResponse.json({ error: "Заполнены не все обязательные поля" }, { status: 400 });
    }

    const settings = await getSettings();
    const duration = Number(body.duration) || 60;
    if (duration < 60 || duration % 30 !== 0) {
      return NextResponse.json({ error: "Длительность должна быть от 1 часа с шагом 30 минут" }, { status: 400 });
    }
    const hourlyPrice = settings.prices[body.format];
    const listPrice = Math.round(hourlyPrice * (duration / 60));
    const isAdmin = verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value);
    const salePrice = isAdmin && Number(body.salePrice) > 0 ? Number(body.salePrice) : listPrice;
    const booking = await createRequestIfAvailable({
      ...(body as BookingInput),
      duration,
      listPrice,
      salePrice,
      price: salePrice,
    });
    void notifyAdminsAboutBooking(booking).catch((error) => {
      console.error("Telegram notification failed", error);
    });

    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    if (error instanceof BookingConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to create booking", error);
    return NextResponse.json({ error: "Не удалось создать заявку" }, { status: 500 });
  }
}
