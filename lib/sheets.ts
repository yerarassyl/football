import { google } from "googleapis";
import { mockRequests } from "./mock-data";
import { bookingSlots } from "./time";
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
  "Платежи",
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
  action: "list" | "create" | "createIfAvailable" | "update" | "batchCreate" | "registerTelegramChat" | "listTelegramChats",
  payload: Record<string, unknown> = {},
): Promise<T> {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL!;
  const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET!;
  const response =
    action === "list"
      ? await fetch(`${url}?secret=${encodeURIComponent(secret)}`, {
          cache: "no-store",
        })
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
  conflicts: Array<{ date: string; time: string; existingId: string }>;
  constructor(conflicts: Array<{ date: string; time: string; existingId: string }> = []) {
    super("На это время уже есть активная заявка или подтвержденная бронь.");
    this.name = "BookingConflictError";
    this.conflicts = conflicts;
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
  setCachedBookings(exists ? cached.map((item) => (item.id === booking.id ? booking : item)) : [booking, ...cached]);
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
    ? value as BookingRequest["status"]
    : "new";
}

function normalizePaymentStatus(value: string): BookingRequest["paymentStatus"] {
  return ["unpaid", "deposit", "paid"].includes(value)
    ? value as BookingRequest["paymentStatus"]
    : "unpaid";
}

function parsePayments(value: string): PaymentRecord[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function enrichRequest(request: BookingRequest): BookingRequest {
  const listPrice = request.listPrice || request.price;
  const salePrice = request.salePrice || request.price;
  const payments = request.payments || [];
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const prepayment = request.prepayment || totalPaid;
  const balance = Math.max(0, salePrice - prepayment);
  let paymentStatus: BookingRequest["paymentStatus"] = "unpaid";
  if (prepayment >= salePrice && salePrice > 0) paymentStatus = "paid";
  else if (prepayment > 0) paymentStatus = "deposit";

  return {
    ...request,
    price: salePrice,
    listPrice,
    salePrice,
    prepayment,
    balance,
    paymentStatus,
    payments,
    comment: request.comment || "",
    deletedAt: request.deletedAt || "",
  };
}

function fromRow(row: string[]): BookingRequest {
  const hasFinanceColumns = ["new", "in_progress", "confirmed", "cancelled", "deleted"].includes(row[14]);
  const hasSourceColumns = ["new", "in_progress", "confirmed", "cancelled", "deleted"].includes(row[13]);
  const oldPrice = Number(row[7]) || 0;
  const listPrice = hasFinanceColumns ? Number(row[7]) || oldPrice : oldPrice;
  const salePrice = hasFinanceColumns ? Number(row[8]) || listPrice : oldPrice;

  const payments: PaymentRecord[] = hasFinanceColumns && row[23] ? parsePayments(String(row[23])) : [];
  const totalFromPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const prepayment = totalFromPayments > 0 ? totalFromPayments : (hasFinanceColumns ? Number(row[16]) || 0 : hasSourceColumns ? Number(row[15]) || 0 : Number(row[13]) || 0);

  const result: BookingRequest = {
    id: row[0],
    createdAt: row[1],
    date: row[2],
    time: row[3],
    duration: Number(row[4]),
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
    paymentStatus: "unpaid",
    prepayment,
    balance: Math.max(0, salePrice - prepayment),
    payments,
    comment: hasFinanceColumns ? row[21] : hasSourceColumns ? row[17] : row[15],
    deletedAt: hasFinanceColumns ? row[22] : "",
  };

  return enrichRequest(result);
}

function toRow(request: BookingRequest) {
  const enriched = enrichRequest(request);
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
    enriched.payments?.[0]?.method || "",
    enriched.payments?.[0]?.recipient || "",
    enriched.payments?.[0]?.date || "",
    enriched.comment,
    enriched.deletedAt,
    JSON.stringify(enriched.payments || []),
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
  return {
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
    payments: [],
    comment: "",
    deletedAt: "",
  };
}

export async function getRequests(options: { fresh?: boolean } = {}): Promise<BookingRequest[]> {
  if (isAppsScriptConfigured()) {
    if (!options.fresh) {
      const cached = getCachedBookings();
      if (cached) return cached;
    }
    const result = await appsScriptRequest<{ bookings: BookingRequest[] }>("list");
    const bookings = result.bookings.map(enrichRequest);
    setCachedBookings(bookings);
    return bookings;
  }
  if (!isConfigured()) return mockRequests.map(enrichRequest);
  const sheets = client();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Брони!A2:X",
  });
  return (response.data.values || []).map((row) => fromRow(row as string[]));
}

export async function searchRequests(query: string): Promise<BookingRequest[]> {
  const all = await getRequests();
  const q = query.toLowerCase().trim();
  if (!q) return all;
  return all.filter((item) =>
    [item.name, item.phone, item.team, item.source, item.sourceDetail, item.id]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
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

export async function batchCreateRequests(inputs: BookingInput[]): Promise<{ created: BookingRequest[]; conflicts: Array<{ date: string; time: string; inputIndex: number }> }> {
  const existing = await getRequests({ fresh: true });
  const created: BookingRequest[] = [];
  const conflicts: Array<{ date: string; time: string; inputIndex: number }> = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const allBookings = [...existing, ...created];
    const conflict = findConflict(allBookings, input);
    if (conflict) {
      conflicts.push({ date: input.date, time: input.time, inputIndex: i });
      continue;
    }
    const request = baseRequest(input);
    if (isAppsScriptConfigured()) {
      await appsScriptRequest("create", { booking: forAppsScript(request) });
    } else if (isConfigured()) {
      const sheets = client();
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Брони!A:X",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [toRow(request)] },
      });
    }
    upsertCachedBooking(request);
    created.push(request);
  }

  return { created, conflicts };
}

function findConflict(existing: BookingRequest[], input: BookingInput): { date: string; time: string; id: string } | null {
  const requestedSectors = input.sector.split("+");
  const requestedSlots = bookingSlots(input.time, input.duration || 60);
  for (const item of existing) {
    if (item.date !== input.date) continue;
    if (["cancelled", "deleted"].includes(item.status)) continue;
    const itemSlots = bookingSlots(item.time, item.duration);
    const sectors = item.sector.split("+");
    const hasOverlap = itemSlots.some((slot) => requestedSlots.includes(slot)) &&
      sectors.some((sector) => requestedSectors.includes(sector));
    if (hasOverlap) return { date: item.date, time: item.time, id: item.id };
  }
  return null;
}

function hasConflict(existing: BookingRequest[], input: BookingInput) {
  return findConflict(existing, input) !== null;
}

export async function createRequestIfAvailable(input: BookingInput): Promise<BookingRequest> {
  const request = baseRequest(input);

  if (isAppsScriptConfigured()) {
    try {
      const result = await appsScriptRequest<{ booking: BookingRequest; conflict?: boolean }>(
        "createIfAvailable",
        { booking: forAppsScript(request) },
      );
      if (result.conflict) throw new BookingConflictError();
      upsertCachedBooking(request);
      return request;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("Неизвестное действие")) throw error;
    }
  }

  const existing = await getRequests();
  if (hasConflict(existing, input)) throw new BookingConflictError();
  return createRequest(input);
}

export async function updateRequest(
  id: string,
  patch: Partial<BookingRequest>,
): Promise<BookingRequest | null> {
  if (isAppsScriptConfigured()) {
    const result = await appsScriptRequest<{ booking: BookingRequest }>("update", {
      id,
      patch: { ...patch, payments: undefined },
    });
    const booking = enrichRequest(result.booking);
    if (patch.payments) booking.payments = patch.payments;
    upsertCachedBooking(booking);
    return booking;
  }

  const requests = await getRequests();
  const index = requests.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const updated = enrichRequest({ ...requests[index], ...patch, id });
  if (!isConfigured()) return updated;
  const sheets = client();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `Брони!A${index + 2}:X${index + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [toRow(updated)] },
  });
  return updated;
}

export async function addPayment(
  bookingId: string,
  payment: Omit<PaymentRecord, "id" | "createdAt">,
): Promise<BookingRequest | null> {
  const booking = (await getRequests()).find((b) => b.id === bookingId);
  if (!booking) return null;

  const newPayment: PaymentRecord = {
    ...payment,
    id: `PAY-${Date.now().toString().slice(-6)}`,
    createdAt: new Date().toISOString(),
  };

  const payments = [...(booking.payments || []), newPayment];
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return updateRequest(bookingId, {
    payments,
    prepayment: totalPaid,
  });
}

export async function deletePayment(
  bookingId: string,
  paymentId: string,
): Promise<BookingRequest | null> {
  const booking = (await getRequests()).find((b) => b.id === bookingId);
  if (!booking) return null;

  const payments = (booking.payments || []).filter((p) => p.id !== paymentId);
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return updateRequest(bookingId, {
    payments,
    prepayment: totalPaid,
  });
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
