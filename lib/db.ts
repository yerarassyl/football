import { randomUUID } from "crypto";
import { conflictMessage, enrichBooking, findBookingConflict } from "./booking";
import { mockRequests } from "./mock-data";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import type { BookingInput, BookingRequest, PaymentRecord } from "./types";

export type InitialBookingState = Pick<BookingRequest, "status" | "comment">;

// ── Cache (same pattern as sheets.ts) ────────────────────────────────────────
const BOOKINGS_CACHE_TTL = 15_000;
const TELEGRAM_CHATS_CACHE_TTL = 5 * 60_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

declare global {
  var __airArenaBookingsCache: CacheEntry<BookingRequest[]> | undefined;
  var __airArenaTelegramChatsCache: CacheEntry<TelegramChat[]> | undefined;
}

type TelegramChat = {
  chatId: string;
  name: string;
  username: string;
  activatedAt: string;
};

export class BookingConflictError extends Error {
  constructor(message = "На это время уже есть конфликтующая бронь.") {
    super(message);
    this.name = "BookingConflictError";
  }
}

// ── Cache helpers ────────────────────────────────────────────────────────────
function getCachedBookings(): BookingRequest[] | null {
  const cache = globalThis.__airArenaBookingsCache;
  if (!cache || cache.expiresAt < Date.now()) return null;
  return cache.value;
}

function setCachedBookings(bookings: BookingRequest[]): void {
  globalThis.__airArenaBookingsCache = { value: bookings, expiresAt: Date.now() + BOOKINGS_CACHE_TTL };
}

function upsertCachedBooking(booking: BookingRequest): void {
  const cached = getCachedBookings();
  if (!cached) return;
  const exists = cached.some((item) => item.id === booking.id);
  setCachedBookings(
    exists ? cached.map((item) => (item.id === booking.id ? booking : item)) : [booking, ...cached],
  );
}

function removeCachedBooking(id: string): void {
  const cached = getCachedBookings();
  if (!cached) return;
  setCachedBookings(cached.filter((item) => item.id !== id));
}

// ── Row mappers (Supabase snake_case ↔ camelCase) ────────────────────────────

type BookingRow = {
  id: string;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  date: string;
  time: string;
  duration: number;
  format: string;
  sector: string;
  price: number;
  list_price: number;
  sale_price: number;
  old_price: number;
  name: string;
  phone: string;
  team: string;
  source: string;
  source_detail: string;
  status: string;
  payment_status: string;
  prepayment: number;
  balance: number;
  payment_method: string;
  payment_recipient: string;
  paid_at: string;
  comment: string;
  deleted_at: string;
  payments: PaymentRecord[] | unknown;
};

function fromDbRow(row: BookingRow): BookingRequest {
  const payments = Array.isArray(row.payments) ? row.payments as PaymentRecord[] : [];

  return enrichBooking({
    id: row.id,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || "",
    confirmedAt: row.confirmed_at || "",
    cancelledAt: row.cancelled_at || "",
    date: row.date,
    time: row.time,
    duration: Number(row.duration) || 60,
    format: row.format as BookingRequest["format"],
    sector: row.sector,
    price: Number(row.sale_price || row.price) || 0,
    listPrice: Number(row.list_price) || 0,
    salePrice: Number(row.sale_price) || 0,
    oldPrice: Number(row.old_price) || 0,
    name: row.name || "",
    phone: row.phone || "",
    team: row.team || "",
    source: row.source || "Сайт",
    sourceDetail: row.source_detail || "",
    status: normalizeStatus(row.status),
    paymentStatus: normalizePaymentStatus(row.payment_status),
    prepayment: Number(row.prepayment) || 0,
    balance: Number(row.balance) || 0,
    paymentMethod: row.payment_method || "",
    paymentRecipient: row.payment_recipient || "",
    paidAt: row.paid_at || "",
    comment: row.comment || "",
    deletedAt: row.deleted_at || "",
    payments,
  });
}

function toDbRow(request: BookingRequest): Record<string, unknown> {
  const enriched = enrichBooking(request);
  return {
    id: enriched.id,
    created_at: enriched.createdAt,
    updated_at: enriched.updatedAt,
    confirmed_at: enriched.confirmedAt || null,
    cancelled_at: enriched.cancelledAt || null,
    date: enriched.date,
    time: enriched.time,
    duration: enriched.duration,
    format: enriched.format,
    sector: enriched.sector,
    price: enriched.salePrice,
    list_price: enriched.listPrice,
    sale_price: enriched.salePrice,
    old_price: enriched.oldPrice,
    name: enriched.name,
    phone: enriched.phone,
    team: enriched.team,
    source: enriched.source,
    source_detail: enriched.sourceDetail,
    status: enriched.status,
    payment_status: enriched.paymentStatus,
    prepayment: enriched.prepayment,
    balance: enriched.balance,
    payment_method: enriched.paymentMethod,
    payment_recipient: enriched.paymentRecipient,
    paid_at: enriched.paidAt,
    comment: enriched.comment,
    deleted_at: enriched.deletedAt,
    payments: JSON.stringify(enriched.payments),
  };
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

// ── ID generation ────────────────────────────────────────────────────────────
function generateId(): string {
  return `REQ-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

// ── Base request factory ─────────────────────────────────────────────────────
function baseRequest(input: BookingInput, initial: Partial<InitialBookingState> = {}): BookingRequest {
  const listPrice = input.listPrice || input.price;
  const salePrice = input.salePrice || input.price;
  const now = new Date().toISOString();
  return enrichBooking({
    ...input,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    confirmedAt: initial.status === "confirmed" ? now : "",
    cancelledAt: initial.status === "cancelled" ? now : "",
    price: salePrice,
    listPrice,
    salePrice,
    oldPrice: 0,
    source: input.source || "Сайт",
    sourceDetail: input.sourceDetail || "",
    status: initial.status || "new",
    paymentStatus: "unpaid",
    prepayment: 0,
    balance: salePrice,
    paymentMethod: "",
    paymentRecipient: "",
    paidAt: "",
    comment: initial.comment || "",
    deletedAt: "",
    payments: [],
  });
}

// ── Public API (same signatures as sheets.ts) ────────────────────────────────

export async function getRequests(options: { fresh?: boolean } = {}): Promise<BookingRequest[]> {
  if (!isSupabaseConfigured()) return mockRequests.map(enrichBooking);

  if (!options.fresh) {
    const cached = getCachedBookings();
    if (cached) return cached;
  }

  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load bookings from Supabase", error);
    return [];
  }

  const bookings = (data as BookingRow[]).map(fromDbRow);
  setCachedBookings(bookings);
  return bookings;
}

export async function getTelegramChats(): Promise<TelegramChat[]> {
  if (!isSupabaseConfigured()) return [];

  const cache = globalThis.__airArenaTelegramChatsCache;
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const supabase = getSupabase()!;
  const { data, error } = await supabase.from("telegram_chats").select("*");

  if (error) {
    console.error("Failed to load telegram chats", error);
    return [];
  }

  const chats: TelegramChat[] = (data || []).map((row: Record<string, unknown>) => ({
    chatId: String(row.chat_id || ""),
    name: String(row.name || ""),
    username: String(row.username || ""),
    activatedAt: String(row.activated_at || ""),
  }));

  globalThis.__airArenaTelegramChatsCache = {
    value: chats,
    expiresAt: Date.now() + TELEGRAM_CHATS_CACHE_TTL,
  };
  return chats;
}

export async function registerTelegramChat(chat: {
  chatId: string;
  name: string;
  username: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = getSupabase()!;
  const { error } = await supabase.from("telegram_chats").upsert({
    chat_id: chat.chatId,
    name: chat.name,
    username: chat.username,
    activated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Failed to register telegram chat", error);
    return;
  }

  globalThis.__airArenaTelegramChatsCache = undefined;
}

function applyLifecyclePatch(current: BookingRequest, patch: Partial<BookingRequest>) {
  const nextStatus = patch.status ?? current.status;
  const now = new Date().toISOString();
  const nextCancelledAt =
    nextStatus === "cancelled"
      ? patch.cancelledAt || current.cancelledAt || now
      : patch.status && patch.status !== current.status
        ? ""
        : patch.cancelledAt ?? current.cancelledAt;
  return {
    ...patch,
    updatedAt: patch.updatedAt || now,
    confirmedAt:
      nextStatus === "confirmed"
        ? patch.confirmedAt || current.confirmedAt || now
        : patch.confirmedAt ?? current.confirmedAt,
    cancelledAt: nextCancelledAt,
  };
}

function ensureNoConflict(existing: BookingRequest[], booking: BookingRequest): void {
  const conflict = findBookingConflict(existing, booking);
  if (conflict) throw new BookingConflictError(conflictMessage(conflict));
}

export async function createRequest(
  input: BookingInput,
  initial: Partial<InitialBookingState> = {},
): Promise<BookingRequest> {
  const request = baseRequest(input, initial);

  if (!isSupabaseConfigured()) {
    upsertCachedBooking(request);
    return request;
  }

  const supabase = getSupabase()!;
  const { error } = await supabase.from("bookings").insert(toDbRow(request));
  if (error) {
    console.error("Failed to create booking", error);
    throw new Error("Не удалось создать заявку");
  }

  upsertCachedBooking(request);
  return request;
}

export async function createRequestIfAvailable(
  input: BookingInput,
  initial: Partial<InitialBookingState> = {},
): Promise<BookingRequest> {
  const request = baseRequest(input, initial);

  if (!isSupabaseConfigured()) {
    upsertCachedBooking(request);
    return request;
  }

  const existing = await getRequests();
  ensureNoConflict(existing, request);

  const supabase = getSupabase()!;
  const { error } = await supabase.from("bookings").insert(toDbRow(request));
  if (error) {
    console.error("Failed to create booking", error);
    throw new Error("Не удалось создать заявку");
  }

  upsertCachedBooking(request);
  return request;
}

export async function updateRequest(
  id: string,
  patch: Partial<BookingRequest>,
): Promise<BookingRequest | null> {
  if (!isSupabaseConfigured()) {
    const requests = await getRequests();
    const index = requests.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const lifecyclePatch = applyLifecyclePatch(requests[index], patch);
    const updated = enrichBooking({ ...requests[index], ...lifecyclePatch, id });
    upsertCachedBooking(updated);
    return updated;
  }

  const requests = await getRequests();
  const current = requests.find((item) => item.id === id);
  if (!current) return null;

  const lifecyclePatch = applyLifecyclePatch(current, patch);
  const updated = enrichBooking({ ...current, ...lifecyclePatch, id });
  ensureNoConflict(requests, updated);

  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("bookings")
    .update(toDbRow(updated))
    .eq("id", id);

  if (error) {
    console.error("Failed to update booking", error);
    throw new Error("Не удалось обновить заявку");
  }

  upsertCachedBooking(updated);
  return updated;
}

export async function deleteRequest(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    removeCachedBooking(id);
    return true;
  }

  const supabase = getSupabase()!;
  const { error } = await supabase.from("bookings").delete().eq("id", id);

  if (error) {
    console.error("Failed to delete booking", error);
    return false;
  }

  removeCachedBooking(id);
  return true;
}

/** No-op for Supabase — migrations handle table creation. Kept for API compatibility. */
export async function ensureSheet(): Promise<void> {
  // Table creation is handled by supabase/migration.sql
}
