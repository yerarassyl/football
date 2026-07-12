import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { addPayment, deletePayment, getRequests } from "@/lib/sheets";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { amount: number; date: string; method: string; recipient: string };
    const updated = await addPayment(id, {
      amount: Number(body.amount) || 0,
      date: body.date || new Date().toISOString().slice(0, 10),
      method: body.method || "Не выбран",
      recipient: body.recipient || "Не выбран",
    });
    if (!updated) return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to add payment", error);
    return NextResponse.json({ error: "Не удалось добавить оплату" }, { status: 500 });
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
    const url = new URL(request.url);
    const paymentId = url.searchParams.get("paymentId");
    if (!paymentId) return NextResponse.json({ error: "Не указан paymentId" }, { status: 400 });
    const updated = await deletePayment(id, paymentId);
    if (!updated) return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to delete payment", error);
    return NextResponse.json({ error: "Не удалось удалить оплату" }, { status: 500 });
  }
}
