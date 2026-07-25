import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, createAuthToken, getAuthConfig } from "@/lib/auth";
import { clientIp, consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { readJsonObject, ValidationError } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const rateKey = `admin-login:${clientIp(request)}`;
  const rate = consumeRateLimit(rateKey, 10, 15 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const config = getAuthConfig();
  if (!config) {
    return NextResponse.json({ error: "Авторизация администратора не настроена" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const login = typeof body.login === "string" ? body.login.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (login !== config.login || password !== config.password) {
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  resetRateLimit(rateKey);
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
    priority: "high",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
