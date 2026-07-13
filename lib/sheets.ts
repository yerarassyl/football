import { google } from "googleapis";
import { conflictMessage, enrichBooking, findBookingConflict } from "./booking";
import { mockRequests } from "./mock-data";
import { BookingInput, BookingRequest, PaymentRecord } from "./types";

const HEADERS = [
  "ID",
  "Создано",
  "Дата",
  "Время",
  "Длительность",
  "Формат",
  "Сектор",
  "Стоимость по прайсу",
  "Фактическая стоимость",
  "Имя",
  "Телефон",
  "Команда",
  "Канал привлечения",
  "Метка ссылки",
  "Статус",
  "Статус оплаты",
  "Предоплата",
  "Остаток к оплате",
  "Способ оплаты",
  "Получатель платежа",
  "Дата оплаты",
  "Комментарий",
  "Удалено",
  "История оплат JSON",
];

const BOOKINGS_CACHE_TTL = 15_000;
const TELEGRAM_CHATS_CACHE_TTL = 5 * 60_000;

type TelegramChat = {
  chatId: string;
  name: string;
  username: string;
  activatedAt: string;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __airArenaBookingsCache: CacheEntry<BookingRequest[]> | undefined;
  // eslint-disable-next-line no-var
  var __airArenaTelegramChatsCache: CacheEntry<TelegramChat[]> | undefined;
}

const isConfigured = () =>
  Boolean(
    process.env.GOOGLE_SHEET_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY,
  );

const isAppsScriptConfigured = () =>
  Boolean(
    process.env.GOOGLE_APPS_SCRIPT_URL &&
      process.env.GOOGLE_APPS_SCRIPT_SECRET,
  );

async function appsScriptRequest<T>(
  action:
    | "list"
    | "create"
    | "createIfAvailable"
    | "update"
    | "delete"
    | "registerTelegramChat"
    | "listTelegramChats",
  payload: Record<string, unknown> = {},
): Promise<T> {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL!;
  const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET!;
  const response =
    action === "list"
      ? await fetch(`${url}?secret=${encodeURIComponent(secret)}`, { cache: "no-store" })
      : await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action, secret, ...payload }),
          cache: "no-store",
        });

  if (!response.ok) {
    throw new Error(`Apps Script returned ${response.status}`);
  }
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Apps Script request failed");
  return result as T;
}

export class BookingConflictError extends Error {
  constructor(message = "На это время уже есть конфликтующая бронь.") {
    super(message);
    this.name = "BookingConflictError";
  }
}

function getCachedBookings() {
  const cache = globalThis.__airArenaBookingsCache;
  if (!cache || cache.expiresAt < Date.now()) return null;
  return cache.value;
}

function setCachedBookings(bookings: BookingRequest[]) {
  globalThis.__airArenaBookingsCache = {
    value: bookings,
    expiresAt: Date.now() + BOOKINGS_CACHE_TTL,
  };
}

function upsertCachedBooking(booking: BookingRequest) {
  const cached = getCachedBookings();
  if (!cached) return;
  const exists = cached.some((item) => item.id === booking.id);
  setCachedBookings(
    exists ? cached.map((item) => (item.id === booking.id ? booking : item)) : [booking, ...cached],
  );
}

function removeCachedBooking(id: string) {
  const cached = getCachedBookings();
  if (!cached) return;
  setCachedBookings(cached.filter((item) => item.id !== id));
}

export async function getTelegramChats() {
  if (!isAppsScriptConfigured()) return [];
  const cache = globalThis.__airArenaTelegramChatsCache;
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const result = await appsScriptRequest<{ chats: TelegramChat[] }>("listTelegramChats");
  globalThis.__airArenaTelegramChatsCache = {
    value: result.chats,
    expiresAt: Date.now() + TELEGRAM_CHATS_CACHE_TTL,
  };
  return result.chats;
}

export async function registerTelegramChat(chat: {
  chatId: string;
  name: string;
  username: string;
}) {
  if (!isAppsScriptConfigured()) return;
  await appsScriptRequest("registerTelegramChat", { chat });
  globalThis.__airArenaTelegramChatsCache = undefined;
}

function client() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function normalizeStatus(value: string): BookingRequest["status"] {
  return ["new", "in_progress", "confirmed", "cancelled", "deleted"].includes(value)
    ? (value as BookingRequest["status"])
    : "new";
}

function normalizePaymentStatus(value: string): BookingRequest["paymentStatus"] {
  return ["unpaid", "deposit", "paid"].includes(value)
    ? (value as BookingRequest["paymentStatus"])
    : "unpaid";
}

function fromRow(row: string[]): BookingRequest {
  const hasFinanceColumns = ["new", "in_progress", "confirmed", "cancelled", "deleted"].includes(row[14]);
  const hasSourceColumns = ["new", "in_progress", "confirmed", "cancelled", "deleted"].includes(row[13]);
  const oldPrice = Number(row[7]) || 0;
  const listPrice = hasFinanceColumns ? Number(row[7]) || oldPrice : oldPrice;
  const salePrice = hasFinanceColumns ? Number(row[8]) || listPrice : oldPrice;
  const prepayment = Number(hasFinanceColumns ? row[16] : hasSourceColumns ? row[15] : row[13]) || 0;
  const paymentMethod = hasFinanceColumns ? row[18] : hasSourceColumns ? row[16] : row[14];
  const paymentRecipient = hasFinanceColumns ? row[19] : "";
  const paidAt = hasFinanceColumns ? row[20] : "";
  const paymentsRaw = hasFinanceColumns ? row[23] : "";
  let payments: PaymentRecord[] = [];
  if (paymentsRaw) {
    try {
      payments = JSON.parse(paymentsRaw) as PaymentRecord[];
    } catch {
      payments = [];
    }
  }

  return enrichBooking({
    id: row[0],
    createdAt: row[1],
    date: row[2],
    time: row[3],
    duration: Number(row[4]) || 60,
    format: row[5] as BookingRequest["format"],
    sector: row[6],
    price: salePrice,
    listPrice,
    salePrice,
    name: hasFinanceColumns ? row[9] : row[8],
    phone: hasFinanceColumns ? row[10] : row[9],
    team: hasFinanceColumns ? row[11] : row[10],
    source: hasFinanceColumns ? row[12] || "Сайт" : hasSourceColumns ? row[11] || "Сайт" : "Сайт",
    sourceDetail: hasFinanceColumns ? row[13] || "" : hasSourceColumns ? row[12] || "" : "",
    status: normalizeStatus(hasFinanceColumns ? row[14] : hasSourceColumns ? row[13] : row[11]),
    paymentStatus: normalizePaymentStatus(hasFinanceColumns ? row[15] : hasSourceColumns ? row[14] : row[12]),
    prepayment,
    balance: Math.max(0, salePrice - prepayment),
    paymentMethod,
    paymentRecipient,
    paidAt,
    comment: hasFinanceColumns ? row[21] : hasSourceColumns ? row[17] : row[15],
    deletedAt: hasFinanceColumns ? row[22] : "",
    payments,
  });
}

function toRow(request: BookingRequest) {
  const enriched = enrichBooking(request);
  return [
    enriched.id,
    enriched.createdAt,
    enriched.date,
    enriched.time,
    enriched.duration,
    enriched.format,
    enriched.sector,
    enriched.listPrice,
    enriched.salePrice,
    enriched.name,
    enriched.phone,
    enriched.team,
    enriched.source,
    enriched.sourceDetail,
    enriched.status,
    enriched.paymentStatus,
    enriched.prepayment,
    enriched.balance,
    enriched.paymentMethod,
    enriched.paymentRecipient,
    enriched.paidAt,
    enriched.comment,
    enriched.deletedAt,
    JSON.stringify(enriched.payments),
  ];
}

function forAppsScript(request: BookingRequest): BookingRequest {
  return {
    ...request,
    createdAt: `'${request.createdAt}`,
    date: `'${request.date}`,
    time: `'${request.time}`,
    phone: `'${request.phone}`,
  };
}

function baseRequest(input: BookingInput): BookingRequest {
  const listPrice = input.listPrice || input.price;
  const salePrice = input.salePrice || input.price;
  return enrichBooking({
    ...input,
    id: `REQ-${Date.now().toString().slice(-6)}`,
    createdAt: new Date().toISOString(),
    price: salePrice,
    listPrice,
    salePrice,
    source: input.source || "Сайт",
    sourceDetail: input.sourceDetail || "",
    status: "new",
    paymentStatus: "unpaid",
    prepayment: 0,
    balance: salePrice,
    paymentMethod: "Не выбран",
    paymentRecipient: "",
    paidAt: "",
    comment: "",
    deletedAt: "",
    payments: [],
  });
}

export async function getRequests(options: { fresh?: boolean } = {}): Promise<BookingRequest[]> {
  if (isAppsScriptConfigured()) {
    if (!options.fresh) {
      const cached = getCachedBookings();
      if (cached) return cached;
    }
    const result = await appsScriptRequest<{ bookings: BookingRequest[] }>("list");
    const bookings = result.bookings.map(enrichBooking);
    setCachedBookings(bookings);
    return bookings;
  }
  if (!isConfigured()) return mockRequests.map(enrichBooking);
  const sheets = client();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Брони!A2:X",
  });
  return (response.data.values || []).map((row) => fromRow(row as string[]));
}

function ensureNoConflict(existing: BookingRequest[], booking: BookingRequest) {
  const conflict = findBookingConflict(existing, booking);
  if (conflict) throw new BookingConflictError(conflictMessage(conflict));
}

export async function createRequest(input: BookingInput): Promise<BookingRequest> {
  const request = baseRequest(input);
  if (isAppsScriptConfigured()) {
    await appsScriptRequest("create", { booking: forAppsScript(request) });
    upsertCachedBooking(request);
    return request;
  }
  if (!isConfigured()) return request;
  const sheets = client();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Брони!A:X",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [toRow(request)] },
  });
  return request;
}

export async function createRequestIfAvailable(input: BookingInput): Promise<BookingRequest> {
  const request = baseRequest(input);

  if (isAppsScriptConfigured()) {
    const result = await appsScriptRequest<{ booking: BookingRequest }>("createIfAvailable", {
      booking: forAppsScript(request),
    });
    const booking = enrichBooking(result.booking);
    upsertCachedBooking(booking);
    return booking;
  }

  const existing = await getRequests();
  ensureNoConflict(existing, request);
  return createRequest(input);
}

export async function updateRequest(
  id: string,
  patch: Partial<BookingRequest>,
): Promise<BookingRequest | null> {
  if (isAppsScriptConfigured()) {
    const result = await appsScriptRequest<{ booking: BookingRequest }>("update", {
      id,
      patch,
    });
    const booking = enrichBooking(result.booking);
    upsertCachedBooking(booking);
    return booking;
  }

  const requests = await getRequests();
  const index = requests.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const updated = enrichBooking({ ...requests[index], ...patch, id });
  ensureNoConflict(requests, updated);

  if (!isConfigured()) return updated;
  const sheets = client();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `Брони!A${index + 2}:X${index + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [toRow(updated)] },
  });
  upsertCachedBooking(updated);
  return updated;
}

export async function deleteRequest(id: string): Promise<boolean> {
  if (isAppsScriptConfigured()) {
    await appsScriptRequest("delete", { id });
    removeCachedBooking(id);
    return true;
  }

  const requests = await getRequests();
  const index = requests.findIndex((item) => item.id === id);
  if (index === -1) return false;
  if (!isConfigured()) {
    removeCachedBooking(id);
    return true;
  }

  const sheets = client();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID! });
  const sheetId = meta.data.sheets?.find((sheet) => sheet.properties?.title === "Брони")?.properties?.sheetId;
  if (sheetId == null) return false;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: index + 1,
            endIndex: index + 2,
          },
        },
      }],
    },
  });
  removeCachedBooking(id);
  return true;
}

export async function ensureSheet() {
  if (!isConfigured()) return;
  const sheets = client();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((sheet) => sheet.properties?.title === "Брони");
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: "Брони" } } }] },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Брони!A1:X1",
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });
}
