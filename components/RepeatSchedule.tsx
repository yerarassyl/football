"use client";

import { useState, useEffect } from "react";
import { Repeat, Calendar, ArrowRight, AlertTriangle, Check, X, Copy } from "lucide-react";
import { FIELD_OPTIONS, SECTORS, TIME_SLOTS, WEEKDAY_NAMES } from "@/lib/constants";
import { BookingRequest, BookingInput, FieldFormat, RequestStatus } from "@/lib/types";
import { bookingEndTime, bookingSlots } from "@/lib/time";
import CalendarPicker from "./CalendarPicker";

type RepeatMode = "lastWeek" | "currentSchedule" | "forMonth" | "extendToDate" | "customPeriod";

type Props = {
  bookings: BookingRequest[];
  fieldOptions: { id: FieldFormat; shortLabel: string; price: number }[];
  onCreated: () => Promise<void>;
};

type PreviewBooking = {
  date: string;
  time: string;
  format: FieldFormat;
  name: string;
  phone: string;
  sector: string;
  duration: number;
  isConflict: boolean;
};

const REPEAT_MODES: { id: RepeatMode; label: string; description: string }[] = [
  { id: "lastWeek", label: "Повтор прошлой недели", description: "Скопировать все записи из прошлой недели на текущую" },
  { id: "currentSchedule", label: "Повтор текущего расписания", description: "Продолжить текущие записи на N недель" },
  { id: "forMonth", label: "Повтор на месяц", description: "Скопировать записи на 4 недели" },
  { id: "extendToDate", label: "Продлить до даты", description: "Копировать записи до указанной даты" },
  { id: "customPeriod", label: "Произвольный период", description: "Указать начальную и конечную даты" },
];

const ACTIVE_STATUSES: RequestStatus[] = ["confirmed", "in_progress"];

function parseDate(dateStr: string): Date {
  if (dateStr.includes("-")) {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const [day, month, year] = dateStr.split(".").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

function isWithinInterval(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

function shiftBookingByWeeks(booking: BookingRequest, weeks: number): string {
  const date = parseDate(booking.date);
  return toIsoDate(addWeeks(date, weeks));
}

function shiftBookingToTargetWeek(booking: BookingRequest, sourceWeekMonday: Date, targetWeekMonday: Date): string {
  const bookingDate = parseDate(booking.date);
  const dayOffset = Math.floor((bookingDate.getTime() - sourceWeekMonday.getTime()) / (1000 * 60 * 60 * 24));
  return toIsoDate(addDays(targetWeekMonday, dayOffset));
}

function bookingToPreview(booking: BookingRequest, newDate: string, isConflict: boolean): PreviewBooking {
  return {
    date: newDate,
    time: booking.time,
    format: booking.format,
    name: booking.name,
    phone: booking.phone,
    sector: booking.sector,
    duration: booking.duration,
    isConflict,
  };
}

export default function RepeatSchedule({ bookings, fieldOptions, onCreated }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<RepeatMode>("lastWeek");
  const [sourceDate, setSourceDate] = useState<string>("");
  const [targetWeeks, setTargetWeeks] = useState<number>(1);
  const [extendToDate, setExtendToDate] = useState<string>("");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [preview, setPreview] = useState<PreviewBooking[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [showConflictsOnly, setShowConflictsOnly] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<"source" | "extendTo" | "customStart" | "customEnd" | null>(null);

  const today = new Date();
  const currentMonday = getMonday(today);

  useEffect(() => {
    if (!isOpen) return;
    calculatePreview();
  }, [mode, sourceDate, targetWeeks, extendToDate, customStartDate, customEndDate, isOpen]);

  function calculatePreview() {
    const result: PreviewBooking[] = [];
    const existingDates = bookings
      .filter((b) => ACTIVE_STATUSES.includes(b.status))
      .map((b) => `${b.date}|${b.time}|${b.format}`);
    const existingSet = new Set(existingDates);

    if (mode === "lastWeek") {
      const lastWeekMonday = addWeeks(currentMonday, -1);
      const lastWeekSunday = addDays(lastWeekMonday, 6);
      const lastWeekBookings = bookings.filter((b) => {
        const d = parseDate(b.date);
        return isWithinInterval(d, lastWeekMonday, lastWeekSunday) && ACTIVE_STATUSES.includes(b.status);
      });

      lastWeekBookings.forEach((booking) => {
        const newDate = shiftBookingToTargetWeek(booking, lastWeekMonday, currentMonday);
        const key = `${newDate}|${booking.time}|${booking.format}`;
        result.push(bookingToPreview(booking, newDate, existingSet.has(key)));
      });
    } else if (mode === "currentSchedule") {
      const weeks = Math.max(1, targetWeeks);
      const weekBookings = bookings.filter((b) => {
        const d = parseDate(b.date);
        return isWithinInterval(d, currentMonday, addDays(currentMonday, 6)) && ACTIVE_STATUSES.includes(b.status);
      });

      for (let w = 1; w <= weeks; w++) {
        weekBookings.forEach((booking) => {
          const newDate = shiftBookingByWeeks(booking, w);
          const key = `${newDate}|${booking.time}|${booking.format}`;
          result.push(bookingToPreview(booking, newDate, existingSet.has(key)));
        });
      }
    } else if (mode === "forMonth") {
      const weekBookings = bookings.filter((b) => {
        const d = parseDate(b.date);
        return isWithinInterval(d, currentMonday, addDays(currentMonday, 6)) && ACTIVE_STATUSES.includes(b.status);
      });

      for (let w = 1; w <= 4; w++) {
        weekBookings.forEach((booking) => {
          const newDate = shiftBookingByWeeks(booking, w);
          const key = `${newDate}|${booking.time}|${booking.format}`;
          result.push(bookingToPreview(booking, newDate, existingSet.has(key)));
        });
      }
    } else if (mode === "extendToDate" && extendToDate) {
      const endDate = parseDate(extendToDate);
      const weekBookings = bookings.filter((b) => {
        const d = parseDate(b.date);
        return isWithinInterval(d, currentMonday, addDays(currentMonday, 6)) && ACTIVE_STATUSES.includes(b.status);
      });

      let weekOffset = 1;
      let targetMonday = addWeeks(currentMonday, weekOffset);
      while (targetMonday <= endDate) {
        weekBookings.forEach((booking) => {
          const newDate = shiftBookingToTargetWeek(booking, currentMonday, targetMonday);
          const newDateObj = parseDate(newDate);
          if (newDateObj <= endDate) {
            const key = `${newDate}|${booking.time}|${booking.format}`;
            result.push(bookingToPreview(booking, newDate, existingSet.has(key)));
          }
        });
        weekOffset++;
        targetMonday = addWeeks(currentMonday, weekOffset);
      }
    } else if (mode === "customPeriod" && customStartDate && customEndDate) {
      const start = parseDate(customStartDate);
      const end = parseDate(customEndDate);
      const sourceMonday = sourceDate ? getMonday(parseDate(sourceDate)) : currentMonday;

      const sourceBookings = sourceDate
        ? bookings.filter((b) => {
            const d = parseDate(b.date);
            const sourceSunday = addDays(sourceMonday, 6);
            return isWithinInterval(d, sourceMonday, sourceSunday) && ACTIVE_STATUSES.includes(b.status);
          })
        : bookings.filter((b) => {
            const d = parseDate(b.date);
            return isWithinInterval(d, currentMonday, addDays(currentMonday, 6)) && ACTIVE_STATUSES.includes(b.status);
          });

      const allDatesInRange = getDateRange(start, end);
      const targetMondays = new Set<string>();
      allDatesInRange.forEach((d) => {
        targetMondays.add(toIsoDate(getMonday(d)));
      });

      targetMondays.forEach((mondayStr) => {
        const targetMonday = parseDate(mondayStr);
        if (targetMonday >= start) {
          sourceBookings.forEach((booking) => {
            const newDate = shiftBookingToTargetWeek(booking, sourceMonday, targetMonday);
            const newDateObj = parseDate(newDate);
            if (newDateObj >= start && newDateObj <= end) {
              const key = `${newDate}|${booking.time}|${booking.format}`;
              result.push(bookingToPreview(booking, newDate, existingSet.has(key)));
            }
          });
        }
      });
    }

    const uniqueResult: PreviewBooking[] = [];
    const seenKeys = new Set<string>();
    result.forEach((b) => {
      const key = `${b.date}|${b.time}|${b.format}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueResult.push(b);
      }
    });

    setPreview(uniqueResult);
  }

  const conflicts = preview.filter((b) => b.isConflict);
  const nonConflicts = preview.filter((b) => !b.isConflict);

  async function handleCreate(skipConflicts: boolean) {
    const toCreate = skipConflicts ? nonConflicts : preview;
    if (toCreate.length === 0) return;

    setIsCreating(true);
    try {
      const bookingsToCreate: BookingInput[] = toCreate.map((b) => ({
        date: b.date,
        time: b.time,
        duration: b.duration,
        format: b.format,
        sector: b.sector,
        price: fieldOptions.find((f) => f.id === b.format)?.price || 0,
        listPrice: fieldOptions.find((f) => f.id === b.format)?.price || 0,
        salePrice: 0,
        name: b.name,
        phone: b.phone,
        team: "",
        source: "admin_repeat",
        sourceDetail: "",
      }));

      const response = await fetch("/api/bookings/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookings: bookingsToCreate }),
      });

      if (!response.ok) {
        throw new Error("Failed to create bookings");
      }

      await onCreated();
      setIsOpen(false);
      setPreview([]);
    } catch (error) {
      console.error("Error creating bookings:", error);
    } finally {
      setIsCreating(false);
    }
  }

  function getWeekdayName(dateStr: string): string {
    const date = parseDate(dateStr);
    const dayIndex = date.getDay();
    return WEEKDAY_NAMES[dayIndex === 0 ? 6 : dayIndex - 1];
  }

  function getSourceBookingsCount(): number {
    if (mode === "customPeriod" && sourceDate) {
      const monday = getMonday(parseDate(sourceDate));
      const sunday = addDays(monday, 6);
      return bookings.filter((b) => {
        const d = parseDate(b.date);
        return isWithinInterval(d, monday, sunday) && ACTIVE_STATUSES.includes(b.status);
      }).length;
    }

    const monday = currentMonday;
    const sunday = addDays(monday, 6);
    return bookings.filter((b) => {
      const d = parseDate(b.date);
      return isWithinInterval(d, monday, sunday) && ACTIVE_STATUSES.includes(b.status);
    }).length;
  }

  function getDateRange(start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  if (!isOpen) {
    return (
      <button className="repeat-schedule-trigger" onClick={() => setIsOpen(true)}>
        <Repeat size={18} />
        <span>Повторить расписание</span>
      </button>
    );
  }

  return (
    <div className="repeat-schedule">
      <div className="repeat-schedule-header">
        <div className="repeat-schedule-title">
          <Repeat size={20} />
          <h3>Повторение расписания</h3>
        </div>
        <button className="repeat-schedule-close" onClick={() => setIsOpen(false)}>
          <X size={18} />
        </button>
      </div>

      <div className="repeat-schedule-body">
        <div className="repeat-mode-section">
          <label className="repeat-section-label">Режим повторения</label>
          <div className="repeat-mode-grid">
            {REPEAT_MODES.map((m) => (
              <div
                key={m.id}
                className={`repeat-mode-card ${mode === m.id ? "active" : ""}`}
                onClick={() => setMode(m.id)}
              >
                <div className="repeat-mode-card-header">
                  <div className="repeat-mode-radio">
                    {mode === m.id && <div className="repeat-mode-radio-inner" />}
                  </div>
                  <span className="repeat-mode-label">{m.label}</span>
                </div>
                <p className="repeat-mode-description">{m.description}</p>
              </div>
            ))}
          </div>
        </div>

        {mode === "customPeriod" && (
          <div className="repeat-source-section">
            <label className="repeat-section-label">Исходная неделя</label>
            <div className="repeat-date-row">
              <div className="repeat-date-picker-wrapper">
                <Calendar size={16} />
                <input
                  type="text"
                  className="repeat-date-input"
                  placeholder="ДД.ММ.ГГГГ"
                  value={sourceDate}
                  onChange={(e) => setSourceDate(e.target.value)}
                  onFocus={() => setCalendarTarget("source")}
                />
                {calendarTarget === "source" && (
                  <CalendarPicker
                    value={sourceDate || toIsoDate(today)}
                    onChange={(date) => {
                      setSourceDate(date);
                      setCalendarTarget(null);
                    }}
                    allowPast
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {mode === "currentSchedule" && (
          <div className="repeat-target-section">
            <label className="repeat-section-label">Количество недель</label>
            <div className="repeat-weeks-selector">
              {[1, 2, 3, 4, 6, 8, 12].map((w) => (
                <button
                  key={w}
                  className={`repeat-weeks-btn ${targetWeeks === w ? "active" : ""}`}
                  onClick={() => setTargetWeeks(w)}
                >
                  {w}
                </button>
              ))}
              <div className="repeat-weeks-custom">
                <input
                  type="number"
                  min={1}
                  max={52}
                  className="repeat-weeks-input"
                  value={targetWeeks}
                  onChange={(e) => setTargetWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <span>нед.</span>
              </div>
            </div>
          </div>
        )}

        {mode === "extendToDate" && (
          <div className="repeat-target-section">
            <label className="repeat-section-label">До даты</label>
            <div className="repeat-date-row">
              <div className="repeat-date-picker-wrapper">
                <Calendar size={16} />
                <input
                  type="text"
                  className="repeat-date-input"
                  placeholder="ДД.ММ.ГГГГ"
                  value={extendToDate}
                  onChange={(e) => setExtendToDate(e.target.value)}
                  onFocus={() => setCalendarTarget("extendTo")}
                />
                {calendarTarget === "extendTo" && (
                  <CalendarPicker
                    value={extendToDate || toIsoDate(addWeeks(today, 4))}
                    onChange={(date) => {
                      setExtendToDate(date);
                      setCalendarTarget(null);
                    }}
                    allowPast
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {mode === "customPeriod" && (
          <div className="repeat-target-section">
            <label className="repeat-section-label">Период</label>
            <div className="repeat-date-range">
              <div className="repeat-date-picker-wrapper">
                <Calendar size={16} />
                <input
                  type="text"
                  className="repeat-date-input"
                  placeholder="Начало ДД.ММ.ГГГГ"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  onFocus={() => setCalendarTarget("customStart")}
                />
                {calendarTarget === "customStart" && (
                  <CalendarPicker
                    value={customStartDate || toIsoDate(today)}
                    onChange={(date) => {
                      setCustomStartDate(date);
                      setCalendarTarget(null);
                    }}
                    allowPast
                  />
                )}
              </div>
              <ArrowRight size={16} className="repeat-date-arrow" />
              <div className="repeat-date-picker-wrapper">
                <Calendar size={16} />
                <input
                  type="text"
                  className="repeat-date-input"
                  placeholder="Конец ДД.ММ.ГГГГ"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  onFocus={() => setCalendarTarget("customEnd")}
                />
                {calendarTarget === "customEnd" && (
                  <CalendarPicker
                    value={customEndDate || toIsoDate(addWeeks(today, 4))}
                    onChange={(date) => {
                      setCustomEndDate(date);
                      setCalendarTarget(null);
                    }}
                    allowPast
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <div className="repeat-source-info">
          <Copy size={16} />
          <span>
            Исходных записей на текущей неделе: <strong>{getSourceBookingsCount()}</strong>
          </span>
        </div>

        {preview.length > 0 && (
          <div className="repeat-preview">
            <div className="repeat-preview-header">
              <h4>Предпросмотр</h4>
              <div className="repeat-preview-stats">
                <span className="repeat-preview-total">
                  <Check size={14} />
                  Будет создано: <strong>{nonConflicts.length}</strong>
                </span>
                {conflicts.length > 0 && (
                  <span className="repeat-preview-conflicts">
                    <AlertTriangle size={14} />
                    Конфликтов: <strong>{conflicts.length}</strong>
                  </span>
                )}
              </div>
            </div>

            {conflicts.length > 0 && (
              <div className="repeat-conflicts-section">
                <div className="repeat-conflicts-toggle" onClick={() => setShowConflictsOnly(!showConflictsOnly)}>
                  <AlertTriangle size={14} />
                  <span>
                    {showConflictsOnly ? "Показать все" : "Показать только конфликты"} ({conflicts.length})
                  </span>
                </div>

                <div className="repeat-conflicts-list">
                  {(showConflictsOnly ? conflicts : conflicts).map((b, i) => (
                    <div key={`conflict-${i}`} className="repeat-conflict-item">
                      <span className="repeat-conflict-date">
                        {getWeekdayName(b.date)}, {b.date}
                      </span>
                      <span className="repeat-conflict-time">{b.time}</span>
                      <span className="repeat-conflict-field">
                        {fieldOptions.find((f) => f.id === b.format)?.shortLabel || b.format}
                      </span>
                      <span className="repeat-conflict-player">{b.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!showConflictsOnly && nonConflicts.length > 0 && (
              <div className="repeat-bookings-list">
                {nonConflicts.map((b, i) => (
                  <div key={`booking-${i}`} className="repeat-booking-item">
                    <span className="repeat-booking-date">
                      {getWeekdayName(b.date)}, {b.date}
                    </span>
                    <span className="repeat-booking-time">{b.time}</span>
                    <span className="repeat-booking-field">
                      {fieldOptions.find((f) => f.id === b.format)?.shortLabel || b.format}
                    </span>
                    <span className="repeat-booking-player">{b.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {preview.length === 0 && (
          <div className="repeat-empty">
            <Repeat size={32} />
            <p>Выберите режим для предпросмотра</p>
          </div>
        )}
      </div>

      <div className="repeat-schedule-footer">
        <button
          className="repeat-btn-cancel"
          onClick={() => {
            setIsOpen(false);
            setPreview([]);
          }}
          disabled={isCreating}
        >
          Отменить
        </button>
        {conflicts.length > 0 && nonConflicts.length > 0 && (
          <button
            className="repeat-btn-create-free"
            onClick={() => handleCreate(true)}
            disabled={isCreating || nonConflicts.length === 0}
          >
            <Check size={16} />
            Создать только свободные ({nonConflicts.length})
          </button>
        )}
        {nonConflicts.length > 0 && conflicts.length === 0 && (
          <button
            className="repeat-btn-create-all"
            onClick={() => handleCreate(false)}
            disabled={isCreating}
          >
            <Check size={16} />
            Создать ({preview.length})
          </button>
        )}
        {preview.length === 0 && (
          <button className="repeat-btn-create-all" disabled>
            <Repeat size={16} />
            Нет данных для создания
          </button>
        )}
      </div>
    </div>
  );
}
