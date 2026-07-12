import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { updateRequest } from "@/lib/sheets";
import { BookingRequest } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const patch = (await request.json()) as Partial<BookingRequest>;
    const updated = await updateRequest(id, patch);
    if (!updated) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update booking", error);
    return NextResponse.json({ error: "Не удалось обновить заявку" }, { status: 500 });
  }
}
