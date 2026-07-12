import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { searchRequests } from "@/lib/sheets";

export async function GET(request: NextRequest) {
  if (!verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  const q = request.nextUrl.searchParams.get("q") || "";
  try {
    const results = await searchRequests(q);
    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to search bookings", error);
    return NextResponse.json({ error: "Не удалось выполнить поиск" }, { status: 500 });
  }
}
