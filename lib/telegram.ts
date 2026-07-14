import { FIELD_OPTIONS, formatPrice } from "./constants";
import { getTelegramChats } from "./sheets";
import { bookingEndTime, formatDuration } from "./time";
import { BookingRequest } from "./types";

function adminUrl() {
  const site = (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://football-iota-eight.vercel.app")
  ).replace(/\/$/, "");
  return `${site}/admin`;
}

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_ADMIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanValue(value: string | number | undefined) {
  return String(value || "").replace(/^'+/, "").trim();
}

export function bookingMessage(booking: BookingRequest) {
  const admin = adminUrl();
  const format = FIELD_OPTIONS.find((item) => item.id === booking.format)?.shortLabel || booking.format;
  const date = cleanValue(booking.date);
  const time = cleanValue(booking.time);
  const phone = cleanValue(booking.phone);
  const source = cleanValue(booking.source || "Сайт");
  const sourceDetail = cleanValue(booking.sourceDetail);
  const endTime = bookingEndTime(time, booking.duration);

  return [
    "<b>Новая заявка Air Arena</b>",
    "",
    `<b>ID:</b> ${escapeHtml(booking.id)}`,
    `<b>Дата:</b> ${escapeHtml(date)}`,
    `<b>Время:</b> ${escapeHtml(time)}-${escapeHtml(endTime)} (${formatDuration(booking.duration)})`,
    `<b>Формат:</b> ${escapeHtml(format)}`,
    `<b>Сектор:</b> ${escapeHtml(booking.sector)}`,
    `<b>Стоимость:</b> ${escapeHtml(formatPrice(booking.salePrice || booking.price))}`,
    "",
    `<b>Клиент:</b> ${escapeHtml(booking.name)}`,
    `<b>Телефон:</b> ${escapeHtml(phone)}`,
    booking.team ? `<b>Команда:</b> ${escapeHtml(booking.team)}` : "",
    `<b>Источник:</b> ${escapeHtml(source)}${sourceDetail ? ` (${escapeHtml(sourceDetail)})` : ""}`,
    `<b>Админка:</b> ${escapeHtml(admin)}`,
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
  const admin = adminUrl();
  await Promise.allSettled(
    chatIds.map((chatId) =>
      telegramApi("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[{ text: "Открыть админку", url: admin }]],
        },
      }),
    ),
  );
}
