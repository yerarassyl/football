import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, createAuthToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { login, password } = await request.json();
  const expectedLogin = process.env.ADMIN_LOGIN || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD || "admin123";

  if (login !== expectedLogin || password !== expectedPassword) {
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  const isHttps =
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  response.cookies.set(AUTH_COOKIE, createAuthToken(login), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return response;
}
