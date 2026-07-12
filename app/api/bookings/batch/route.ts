import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { batchCreateRequests } from "@/lib/sheets";
import { BookingInput } from "@/lib/types";

export async function POST(request: NextRequest) {
  if (!verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { bookings: BookingInput[] };
    if (!Array.isArray(body.bookings) || body.bookings.length === 0) {
      return NextResponse.json({ error: "Не указаны бронирования" }, { status: 400 });
    }
    const result = await batchCreateRequests(body.bookings);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to batch create bookings", error);
    return NextResponse.json({ error: "Не удалось создать бронирования" }, { status: 500 });
  }
}
