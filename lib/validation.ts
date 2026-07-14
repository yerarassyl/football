import { SECTORS } from "./constants";
import { arenaDateValue, isValidTime, timeToMinutes } from "./time";
import { BookingRequest, FieldFormat, PaymentRecord, RequestStatus } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FORMATS: FieldFormat[] = ["quarter", "half", "full"];
const STATUSES: RequestStatus[] = ["new", "in_progress", "confirmed", "cancelled", "deleted"];
const INITIAL_STATUSES: RequestStatus[] = ["new", "in_progress", "confirmed", "cancelled"];
const MAX_PRICE = 100_000_000;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export async function readJsonObject(request: Request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ValidationError("Некорректный JSON");
  }
}

function cleanString(value: unknown, label: string, maxLength: number, required = false) {
  const result = String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (required && !result) throw new ValidationError(`Не заполнено поле «${label}»`);
  if (result.length > maxLength) throw new ValidationError(`Поле «${label}» слишком длинное`);
  return result;
}

export function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validDate(value: unknown, label = "Дата") {
  const result = cleanString(value, label, 10, true);
  if (!isValidDate(result)) throw new ValidationError(`${label} указана неверно`);
  return result;
}

function validPositiveMoney(value: unknown, label: string) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0 || result > MAX_PRICE) {
    throw new ValidationError(`${label} должна быть больше нуля`);
  }
  return Math.round(result);
}

export function validateSalePrice(value: unknown) {
  return validPositiveMoney(value, "Фактическая стоимость");
}

function validFormat(value: unknown): FieldFormat {
  if (!FORMATS.includes(value as FieldFormat)) throw new ValidationError("Неизвестный формат поля");
  return value as FieldFormat;
}

function validStatus(value: unknown): RequestStatus {
  if (!STATUSES.includes(value as RequestStatus)) throw new ValidationError("Неизвестный статус заявки");
  return value as RequestStatus;
}

function validSector(value: unknown, format?: FieldFormat) {
  const sector = cleanString(value, "Сектор", 20, true).toUpperCase();
  if (format && !SECTORS[format].some((item) => item.id === sector)) {
    throw new ValidationError("Сектор не соответствует формату поля");
  }
  if (!format && !/^[A-D](\+[A-D]){0,3}$/.test(sector)) {
    throw new ValidationError("Сектор указан неверно");
  }
  return sector;
}

function validDuration(value: unknown, time?: string) {
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 60 || duration > 720 || duration % 30 !== 0) {
    throw new ValidationError("Длительность должна быть от 1 до 12 часов с шагом 30 минут");
  }
  if (time && timeToMinutes(time) + duration > 24 * 60) {
    throw new ValidationError("Бронь должна завершиться до конца выбранного дня");
  }
  return duration;
}

function validPhone(value: unknown) {
  const phone = cleanString(value, "Телефон", 40, true);
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) throw new ValidationError("Телефон указан неверно");
  return phone;
}

export function validateBookingCreate(body: Record<string, unknown>, options: { allowPast?: boolean } = {}) {
  const date = validDate(body.date);
  if (!options.allowPast && date < arenaDateValue()) throw new ValidationError("Нельзя забронировать прошедшую дату");
  const time = cleanString(body.time, "Время", 5, true);
  if (!isValidTime(time)) throw new ValidationError("Время должно быть указано с шагом 30 минут");
  const duration = validDuration(body.duration ?? 60, time);
  const format = validFormat(body.format);
  const sector = validSector(body.sector, format);
  const name = cleanString(body.name, "Имя", 100, true);
  if (name.length < 2) throw new ValidationError("Имя должно содержать минимум 2 символа");

  return {
    date,
    time,
    duration,
    format,
    sector,
    name,
    phone: validPhone(body.phone),
    team: cleanString(body.team, "Команда", 120),
    source: cleanString(body.source || "Сайт", "Источник", 80),
    sourceDetail: cleanString(body.sourceDetail, "Деталь источника", 180),
  };
}

export function validateInitialAdminState(body: Record<string, unknown>) {
  const result: { status?: RequestStatus; comment?: string } = {};
  if (body.status !== undefined) {
    const status = validStatus(body.status);
    if (!INITIAL_STATUSES.includes(status)) throw new ValidationError("Нельзя создать заявку сразу в корзине");
    result.status = status;
  }
  if (body.comment !== undefined) result.comment = cleanString(body.comment, "Комментарий", 1000);
  return result;
}

function validatePayments(value: unknown): PaymentRecord[] {
  if (!Array.isArray(value) || value.length > 500) throw new ValidationError("История оплат указана неверно");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ValidationError("Оплата указана неверно");
    const payment = item as Record<string, unknown>;
    return {
      id: cleanString(payment.id || `PAY-${index + 1}`, "ID оплаты", 100, true),
      amount: validPositiveMoney(payment.amount, "Сумма оплаты"),
      date: validDate(payment.date, "Дата оплаты"),
      method: cleanString(payment.method, "Способ оплаты", 80, true),
      recipient: cleanString(payment.recipient, "Получатель", 100, true),
    };
  });
}

export function validateBookingPatch(body: Record<string, unknown>): Partial<BookingRequest> {
  const patch: Partial<BookingRequest> = {};
  if (body.date !== undefined) patch.date = validDate(body.date);
  if (body.time !== undefined) {
    patch.time = cleanString(body.time, "Время", 5, true);
    if (!isValidTime(patch.time)) throw new ValidationError("Время должно быть указано с шагом 30 минут");
  }
  if (body.duration !== undefined) patch.duration = validDuration(body.duration, patch.time);
  if (body.format !== undefined) patch.format = validFormat(body.format);
  if (body.sector !== undefined) patch.sector = validSector(body.sector, patch.format);
  if (body.name !== undefined) patch.name = cleanString(body.name, "Имя", 100, true);
  if (body.phone !== undefined) patch.phone = validPhone(body.phone);
  if (body.team !== undefined) patch.team = cleanString(body.team, "Команда", 120);
  if (body.source !== undefined) patch.source = cleanString(body.source, "Источник", 80);
  if (body.sourceDetail !== undefined) patch.sourceDetail = cleanString(body.sourceDetail, "Деталь источника", 180);
  if (body.comment !== undefined) patch.comment = cleanString(body.comment, "Комментарий", 1000);
  if (body.status !== undefined) patch.status = validStatus(body.status);
  if (body.deletedAt !== undefined) patch.deletedAt = cleanString(body.deletedAt, "Дата удаления", 40);
  if (body.listPrice !== undefined) patch.listPrice = validPositiveMoney(body.listPrice, "Стоимость по прайсу");
  if (body.salePrice !== undefined) patch.salePrice = validPositiveMoney(body.salePrice, "Фактическая стоимость");
  if (body.price !== undefined) patch.price = validPositiveMoney(body.price, "Стоимость");
  if (body.payments !== undefined) patch.payments = validatePayments(body.payments);
  if (Object.keys(patch).length === 0) throw new ValidationError("Нет данных для обновления");
  return patch;
}

export function validateSettings(body: Record<string, unknown>) {
  if (!body.prices || typeof body.prices !== "object" || Array.isArray(body.prices)) {
    throw new ValidationError("Не указаны цены");
  }
  const prices = body.prices as Record<string, unknown>;
  return {
    prices: {
      quarter: validPositiveMoney(prices.quarter, "Цена четверти поля"),
      half: validPositiveMoney(prices.half, "Цена половины поля"),
      full: validPositiveMoney(prices.full, "Цена полного поля"),
    },
  };
}
