import { NextRequest, NextResponse } from "next/server";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { first_name?: string };
  };
};

function siteUrl() {
  return (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://football-iota-eight.vercel.app")
  ).replace(/\/$/, "");
}

async function userBotApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_USER_BOT_TOKEN;
  if (!token) return;

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Telegram user bot ${method} failed with ${response.status}`);
  }
}

async function handleMessage(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.chat.id) return;

  const url = siteUrl();
  const name = message.from?.first_name ? `, ${message.from.first_name}` : "";

  if (message.text === "/admin") {
    await userBotApi("sendMessage", {
      chat_id: message.chat.id,
      text: "Админские уведомления работают в отдельном боте Air Arena Admin.",
    });
    return;
  }

  await userBotApi("sendMessage", {
    chat_id: message.chat.id,
    text: `Здравствуйте${name}! Забронировать поле можно на сайте Air Arena:\n${url}`,
    disable_web_page_preview: true,
  });
}

export async function POST(request: NextRequest) {
  try {
    const update = (await request.json()) as TelegramUpdate;
    await handleMessage(update);
  } catch (error) {
    console.error("Telegram user webhook failed", error);
  }

  return NextResponse.json({ ok: true });
}
