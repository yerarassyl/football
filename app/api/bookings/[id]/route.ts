import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { BookingConflictError, deleteRequest, updateRequest } from "@/lib/sheets";
import { readJsonObject, validateBookingPatch, ValidationError } from "@/lib/validation";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const patch = validateBookingPatch(await readJsonObject(request));
    const updated = await updateRequest(id, patch);
    if (!updated) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof BookingConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to update booking", error);
    return NextResponse.json({ error: "Не удалось обновить заявку" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const deleted = await deleteRequest(id);
    if (!deleted) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete booking", error);
    return NextResponse.json({ error: "Не удалось удалить заявку" }, { status: 500 });
  }
}
