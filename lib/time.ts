import { TIME_SLOTS } from "./constants";

const SLOT_MINUTES = 30;

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function bookingSlots(time: string, duration: number) {
  const start = TIME_SLOTS.indexOf(time);
  if (start === -1) return [time];
  const slots = Math.max(2, Math.ceil(duration / SLOT_MINUTES));
  return TIME_SLOTS.slice(start, start + slots);
}

export function bookingEndTime(time: string, duration: number) {
  const endMinutes = timeToMinutes(time) + duration;
  const normalized = ((endMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function formatDuration(duration: number) {
  const hours = duration / 60;
  return Number.isInteger(hours) ? `${hours} ч.` : `${String(hours).replace(".", ",")} ч.`;
}
