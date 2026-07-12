import { NextRequest, NextResponse } from "next/server";
import { getRequests } from "@/lib/sheets";
import { bookingSlots } from "@/lib/time";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "Не указана дата" }, { status: 400 });

  try {
    const bookings = await getRequests();
    const occupied = bookings
      .filter((item) => item.date === date && item.status !== "cancelled")
      .flatMap((item) =>
        bookingSlots(item.time, item.duration).map((time) => ({
          time,
          sector: item.sector,
        })),
      );
    return NextResponse.json(occupied);
  } catch (error) {
    console.error("Failed to check availability", error);
    return NextResponse.json({ error: "Не удалось проверить доступность" }, { status: 500 });
  }
}
