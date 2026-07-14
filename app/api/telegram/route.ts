import { NextRequest, NextResponse } from "next/server";
import { getTelegramChats, registerTelegramChat } from "@/lib/sheets";
import { telegramApi } from "@/lib/telegram";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { first_name?: string; last_name?: string; username?: string };
  };
};

function validateSecret(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  return request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

async function isRegisteredChat(chatId: number) {
  const chats = await getTelegramChats();
  return chats.some((chat) => chat.chatId === String(chatId));
}

async function sendAdminConnected(chatId: number) {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text:
      "Уведомления Air Arena подключены для этого чата.\n\n" +
      "Новые заявки будут приходить сюда обычным сообщением без кнопок.",
  });
}

async function handleMessage(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.chat.id) return;

  if (!(await isRegisteredChat(message.chat.id))) {
    const name = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ");
    await registerTelegramChat({
      chatId: String(message.chat.id),
      name,
      username: message.from?.username || "",
    });
  }

  if (message.text === "/start" || message.text === "/help") {
    await sendAdminConnected(message.chat.id);
    return;
  }

  await telegramApi("sendMessage", {
    chat_id: message.chat.id,
    text: "Чат подключён. Новые заявки будут приходить сюда автоматически.",
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (!validateSecret(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  try {
    await handleMessage(update);
  } catch (error) {
    console.error("Telegram webhook failed", error);
  }
  return NextResponse.json({ ok: true });
}
