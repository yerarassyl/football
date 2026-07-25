import { TIME_SLOTS } from "./constants";

const SLOT_MINUTES = 30;
export const ARENA_TIME_ZONE = "Asia/Almaty";

export function arenaDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARENA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeTimeInput(time: string) {
  return String(time || "").replace(/^'+/, "").trim();
}

export function timeToMinutes(time: string) {
  const [hours, minutes] = normalizeTimeInput(time).split(":").map(Number);
  return hours * 60 + minutes;
}

export function isValidTime(time: string) {
  if (!/^([01]\d|2[0-3]):(00|30)$/.test(normalizeTimeInput(time))) return false;
  return Number.isFinite(timeToMinutes(time));
}

export function bookingSlots(time: string, duration: number) {
  const start = TIME_SLOTS.indexOf(time);
  if (start === -1) return [time];
  const slots = Math.max(2, Math.ceil(duration / SLOT_MINUTES));
  return TIME_SLOTS.slice(start, start + slots);
}

export function bookingEndTime(time: string, duration: number) {
  const endMinutes = timeToMinutes(time) + duration;
  if (!Number.isFinite(endMinutes)) return normalizeTimeInput(time) || "--:--";
  const normalized = ((endMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function formatDuration(duration: number) {
  const hours = duration / 60;
  return Number.isInteger(hours) ? `${hours} ч.` : `${String(hours).replace(".", ",")} ч.`;
}
