import { FIELD_OPTIONS, formatPrice } from "./constants";
import { getTelegramChats } from "./sheets";
import { bookingEndTime, formatDuration } from "./time";
import { BookingRequest } from "./types";

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_ADMIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function bookingMessage(booking: BookingRequest) {
  const format = FIELD_OPTIONS.find((item) => item.id === booking.format)?.shortLabel || booking.format;
  const endTime = bookingEndTime(booking.time, booking.duration);
  const adminUrl = "https://football-iota-eight.vercel.app/admin";

  return [
    "<b>Новая заявка Air Arena</b>",
    "",
    `<b>ID:</b> ${escapeHtml(booking.id)}`,
    `<b>Дата:</b> ${escapeHtml(booking.date)}`,
    `<b>Время:</b> ${escapeHtml(booking.time)}-${escapeHtml(endTime)} (${formatDuration(booking.duration)})`,
    `<b>Формат:</b> ${escapeHtml(format)}`,
    `<b>Сектор:</b> ${escapeHtml(booking.sector)}`,
    `<b>Стоимость:</b> ${escapeHtml(formatPrice(booking.price))}`,
    "",
    `<b>Клиент:</b> ${escapeHtml(booking.name)}`,
    `<b>Телефон:</b> ${escapeHtml(booking.phone)}`,
    booking.team ? `<b>Команда:</b> ${escapeHtml(booking.team)}` : "",
    `<b>Источник:</b> ${escapeHtml(booking.source || "Сайт")}${booking.sourceDetail ? ` (${escapeHtml(booking.sourceDetail)})` : ""}`,
    "",
    `<a href="${adminUrl}">Открыть веб-админку</a>`,
  ].filter(Boolean).join("\n");
}

export async function telegramApi<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<T | null> {
  const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function notifyAdminsAboutBooking(booking: BookingRequest) {
  if (!telegramConfigured()) return;
  const chatIds = (await getTelegramChats()).map((chat) => chat.chatId);
  if (chatIds.length === 0) return;

  const text = bookingMessage(booking);
  await Promise.allSettled(
    chatIds.map((chatId) =>
      telegramApi("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    ),
  );
}
