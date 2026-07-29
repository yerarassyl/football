"use client";

import { ChevronLeft, ChevronRight, CopyPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { arenaDateValue, bookingEndTime } from "@/lib/time";
import { findBookingConflict, formatLabel } from "@/lib/booking";
import { DURATION_OPTIONS, FIELD_OPTIONS, SECTORS, TIME_SLOTS, formatPrice } from "@/lib/constants";
import type { BookingRequest, FieldFormat } from "@/lib/types";

type SerialMode = "weekdays" | "calendar";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const CALENDAR_WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

type CandidateDate = {
  date: string;
  conflictBooking?: BookingRequest;
};

type CreateResult = {
  date: string;
  success: boolean;
  error?: string;
};

export default function SerialPlanner({
  bookings,
  onComplete,
}: {
  bookings: BookingRequest[];
  onComplete: (message: string) => Promise<void>;
}) {
  const today = arenaDateValue();

  // ── Shared state ──
  const [mode, setMode] = useState<SerialMode>("weekdays");
  const [time, setTime] = useState("18:00");
  const [duration, setDuration] = useState(60);
  const [format, setFormat] = useState<FieldFormat>("half");
  const [sector, setSector] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [team, setTeam] = useState("");
  const [working, setWorking] = useState(false);
  const [results, setResults] = useState<CreateResult[] | null>(null);

  // ── Mode 1: weekday repeat ──
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(addDays(today, 30));
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [candidates, setCandidates] = useState<CandidateDate[] | null>(null);
  const [excludedDates, setExcludedDates] = useState<Set<string>>(new Set());

  // ── Mode 2: calendar selection ──
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [calViewYear, setCalViewYear] = useState(new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(new Date().getMonth());

  // ── Price calculation ──
  const fieldOption = FIELD_OPTIONS.find((f) => f.id === format);
  const hourlyPrice = fieldOption?.price ?? 0;
  const totalPrice = Math.round(hourlyPrice * (duration / 60));

  // ── Sector default when format changes ──
  const sectorOptions = SECTORS[format];
  const effectiveSector = sector || sectorOptions[0]?.id || "";

  // ── Helpers ──
  function resetState() {
    setCandidates(null);
    setExcludedDates(new Set());
    setResults(null);
  }

  function toggleWeekday(day: number) {
    setSelectedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  // ── Mode 1: generate preview ──
  function generatePreview() {
    if (selectedWeekdays.length === 0) return;
    if (!fromDate || !toDate) return;
    if (!effectiveSector) return;

    const start = fromDate >= today ? new Date(`${fromDate}T12:00:00`) : new Date(`${today}T12:00:00`);
    const end = new Date(`${toDate}T12:00:00`);
    const dates: CandidateDate[] = [];
    const cursor = new Date(start);

    while (cursor <= end) {
      const dayOfWeek = (cursor.getDay() + 6) % 7; // Mon=0, Sun=6
      if (selectedWeekdays.includes(dayOfWeek)) {
        const iso = cursor.toISOString().slice(0, 10);

        // Check conflicts against existing bookings
        const conflict = findBookingConflict(bookings, {
          id: "",
          date: iso,
          time,
          duration,
          format,
          sector: effectiveSector,
        });

        dates.push({ date: iso, conflictBooking: conflict });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    setCandidates(dates);
    setExcludedDates(new Set());
    setResults(null);
  }

  // ── Execute creation ──
  async function executeCreate(datesToCreate: string[]) {
    setWorking(true);
    const created: CreateResult[] = [];

    try {
      for (const date of datesToCreate) {
        const payload = {
          date,
          time,
          duration,
          format,
          sector: effectiveSector,
          listPrice: totalPrice,
          salePrice: totalPrice,
          price: totalPrice,
          name: name || "Серийная бронь",
          phone: phone || "+7 000 000 00 00",
          team,
          source: "Серийное бронирование",
          sourceDetail: mode === "weekdays" ? "По дням недели" : "Выбор дат",
          status: "new",
        };

        try {
          const response = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const result = await response.json();

          if (!response.ok) {
            created.push({ date, success: false, error: result.error || "Ошибка создания" });
          } else {
            created.push({ date, success: true });
          }
        } catch {
          created.push({ date, success: false, error: "Сетевая ошибка" });
        }
      }

      setResults(created);
      const ok = created.filter((r) => r.success).length;
      const bad = created.filter((r) => !r.success).length;
      const message = `Создано ${ok} броней${bad > 0 ? `, конфликтов ${bad}` : ""}.`;
      await onComplete(message);
    } finally {
      setWorking(false);
    }
  }

  // ── Mode 1: create from preview ──
  function createFromPreview() {
    if (!candidates) return;
    const toCreate = candidates
      .filter((c) => !c.conflictBooking && !excludedDates.has(c.date))
      .map((c) => c.date);
    if (toCreate.length === 0) return;
    executeCreate(toCreate);
  }

  // ── Mode 2: create from calendar ──
  function createFromCalendar() {
    if (selectedDates.length === 0) return;
    if (!effectiveSector) return;
    executeCreate(selectedDates);
  }

  function toggleExcludeDate(date: string) {
    setExcludedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  // ── Calendar cells ──
  const calendarCells = useMemo(() => {
    const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
    return [
      ...Array.from({ length: offset }, () => null as number | null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
  }, [calViewYear, calViewMonth]);

  function moveMonth(delta: number) {
    const next = new Date(calViewYear, calViewMonth + delta, 1);
    setCalViewYear(next.getFullYear());
    setCalViewMonth(next.getMonth());
  }

  function toggleCalendarDate(iso: string) {
    setSelectedDates((prev) =>
      prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort(),
    );
  }

  function removeCalendarDate(iso: string) {
    setSelectedDates((prev) => prev.filter((d) => d !== iso));
  }

  // ── Candidate stats ──
  const candidateStats = useMemo(() => {
    if (!candidates) return null;
    const total = candidates.length;
    const conflicts = candidates.filter((c) => c.conflictBooking).length;
    const excluded = excludedDates.size;
    const willCreate = candidates.filter(
      (c) => !c.conflictBooking && !excludedDates.has(c.date),
    ).length;
    return { total, conflicts, excluded, willCreate };
  }, [candidates, excludedDates]);

  // Calendar date conflict checks
  const calendarConflicts = useMemo(() => {
    if (!effectiveSector) return new Map<string, BookingRequest>();
    const map = new Map<string, BookingRequest>();
    for (const date of selectedDates) {
      const conflict = findBookingConflict(bookings, {
        id: "",
        date,
        time,
        duration,
        format,
        sector: effectiveSector,
      });
      if (conflict) map.set(date, conflict);
    }
    return map;
  }, [selectedDates, bookings, time, duration, format, effectiveSector]);

  const conflictFreeCount = selectedDates.filter((d) => !calendarConflicts.has(d)).length;

  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="section-kicker">Серийное бронирование</div>
          <h1>Создать серию броней</h1>
          <p>Два режима: повторение по дням недели в периоде, либо ручной выбор дат из календаря.</p>
        </div>
      </div>

      {/* ── Mode tabs ── */}
      <div className="serial-mode-tabs">
        <button
          className={mode === "weekdays" ? "active" : ""}
          onClick={() => { setMode("weekdays"); resetState(); }}
        >
          По дням недели
        </button>
        <button
          className={mode === "calendar" ? "active" : ""}
          onClick={() => { setMode("calendar"); resetState(); }}
        >
          Выбор дат
        </button>
      </div>

      {/* ── Shared fields ── */}
      <div className="admin-card serial-card">
        <div className="editor-grid">
          <label className="form-field">
            <span>Время начала</span>
            <select value={time} onChange={(e) => { setTime(e.target.value); resetState(); }}>
              {TIME_SLOTS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Длительность</span>
            <select value={duration} onChange={(e) => { setDuration(Number(e.target.value)); resetState(); }}>
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>{Math.floor(d / 60)}ч {d % 60 > 0 ? `${d % 60}м` : ""}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Формат поля</span>
            <select value={format} onChange={(e) => { setFormat(e.target.value as FieldFormat); setSector(""); resetState(); }}>
              {FIELD_OPTIONS.map((f) => (
                <option key={f.id} value={f.id}>{f.shortLabel} — {formatPrice(f.price)}/ч</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Сектор</span>
            <select value={effectiveSector} onChange={(e) => { setSector(e.target.value); resetState(); }}>
              {sectorOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Имя клиента</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Необязательно"
            />
          </label>
          <label className="form-field">
            <span>Телефон</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Необязательно"
            />
          </label>
          <label className="form-field">
            <span>Команда</span>
            <input
              type="text"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder="Необязательно"
            />
          </label>
        </div>

        <div className="serial-price-preview">
          Стоимость одной брони: <strong>{formatPrice(totalPrice)}</strong>
          {" · "}
          {formatLabel(format)} · {effectiveSector} · {time}–{bookingEndTime(time, duration)}
        </div>
      </div>

      {/* ── Mode 1: weekday repeat ── */}
      {mode === "weekdays" && (
        <div className="admin-card serial-card">
          <div className="editor-grid">
            <label className="form-field">
              <span>Период с</span>
              <input
                type="date"
                value={fromDate}
                min={today}
                onChange={(e) => { setFromDate(e.target.value); resetState(); }}
              />
            </label>
            <label className="form-field">
              <span>Период по</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || today}
                onChange={(e) => { setToDate(e.target.value); resetState(); }}
              />
            </label>
          </div>

          <div className="serial-weekdays">
            <span className="serial-weekdays-label">Дни недели:</span>
            <div className="serial-weekday-chips">
              {WEEKDAY_LABELS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`serial-weekday-chip ${selectedWeekdays.includes(index) ? "active" : ""}`}
                  onClick={() => toggleWeekday(index)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="serial-actions">
            <button
              className="secondary-button"
              disabled={selectedWeekdays.length === 0 || !fromDate || !toDate || !effectiveSector}
              onClick={generatePreview}
              type="button"
            >
              Предпросмотр
            </button>
          </div>

          {/* Preview results */}
          {candidates && (
            <div className="serial-preview">
              {candidateStats && (
                <div className="serial-preview-header">
                  <strong>
                    Найдено дат: {candidateStats.total}
                    {candidateStats.conflicts > 0 && (
                      <span className="serial-conflict-count"> · Конфликтов: {candidateStats.conflicts}</span>
                    )}
                    {candidateStats.excluded > 0 && (
                      <span> · Исключено: {candidateStats.excluded}</span>
                    )}
                  </strong>
                  <small>
                    Будет создано: <strong>{candidateStats.willCreate}</strong> броней.
                    Снимите галочки с дат, которые нужно пропустить.
                  </small>
                </div>
              )}

              <div className="serial-date-list">
                {candidates.map((c) => {
                  const isConflict = Boolean(c.conflictBooking);
                  const isExcluded = excludedDates.has(c.date);
                  return (
                    <div
                      key={c.date}
                      className={`serial-date-row ${isConflict ? "conflict" : ""} ${isExcluded ? "excluded" : ""}`}
                    >
                      <label className="schedule-item-label">
                        <input
                          type="checkbox"
                          checked={!isExcluded && !isConflict}
                          disabled={isConflict}
                          onChange={() => toggleExcludeDate(c.date)}
                        />
                        <span className="checkbox-label" />
                      </label>
                      <span className="serial-date-content">
                        <strong>{c.date}</strong>
                        <span>
                          {WEEKDAY_LABELS[new Date(`${c.date}T12:00:00`).getDay() === 0 ? 6 : new Date(`${c.date}T12:00:00`).getDay() - 1]}
                          {" · "}{time}–{bookingEndTime(time, duration)}
                          {" · "}{formatLabel(format)} · {effectiveSector}
                        </span>
                        {isConflict && (
                          <span className="serial-conflict-badge">
                            Конфликт: {c.conflictBooking!.name} · {formatLabel(c.conflictBooking!.format)} · {c.conflictBooking!.sector}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              {candidateStats && candidateStats.willCreate > 0 && (
                <div className="serial-actions">
                  <button
                    className="primary-button"
                    disabled={working}
                    onClick={createFromPreview}
                    type="button"
                  >
                    <CopyPlus size={16} /> {working ? "Создаём..." : `Создать ${candidateStats.willCreate} броней`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Mode 2: calendar selection ── */}
      {mode === "calendar" && (
        <div className="admin-card serial-card">
          <div className="serial-calendar-layout">
            {/* Calendar */}
            <div className="calendar-picker">
              <div className="calendar-toolbar">
                <button type="button" onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц">
                  <ChevronLeft size={18} />
                </button>
                <div className="calendar-selects">
                  <select
                    aria-label="Месяц"
                    value={calViewMonth}
                    onChange={(e) => setCalViewMonth(Number(e.target.value))}
                  >
                    {MONTH_NAMES.map((month, index) => (
                      <option key={month} value={index}>{month}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Год"
                    value={calViewYear}
                    onChange={(e) => setCalViewYear(Number(e.target.value))}
                  >
                    {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() + i).map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={() => moveMonth(1)} aria-label="Следующий месяц">
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="calendar-weekdays">
                {CALENDAR_WEEKDAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="calendar-days">
                {calendarCells.map((day, index) => {
                  if (!day) return <span className="calendar-empty" key={`empty-${index}`} />;
                  const iso = toIso(calViewYear, calViewMonth, day);
                  const date = new Date(calViewYear, calViewMonth, day);
                  const isPast = date < new Date(today + "T00:00:00");
                  const isSelected = selectedDates.includes(iso);
                  const hasConflict = calendarConflicts.has(iso);
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={`${isSelected ? "selected" : ""} ${hasConflict ? "has-conflict" : ""}`}
                      disabled={isPast}
                      onClick={() => toggleCalendarDate(iso)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected dates list */}
            <div className="serial-selected-dates">
              <h3>Выбранные даты ({selectedDates.length})</h3>
              {conflictFreeCount < selectedDates.length && (
                <p className="serial-conflict-note">
                  {selectedDates.length - conflictFreeCount} дат(ы) конфликтуют и не будут созданы.
                </p>
              )}
              {selectedDates.length === 0 && (
                <p className="serial-empty-hint">Кликните по датам в календаре, чтобы выбрать их.</p>
              )}
              <div className="serial-date-chips">
                {selectedDates.map((iso) => {
                  const hasConflict = calendarConflicts.has(iso);
                  const conflict = calendarConflicts.get(iso);
                  return (
                    <div key={iso} className={`serial-date-chip ${hasConflict ? "conflict" : ""}`}>
                      <span>
                        {iso}
                        {hasConflict && conflict && (
                          <> — конфликт: {conflict.name}</>
                        )}
                      </span>
                      <button type="button" onClick={() => removeCalendarDate(iso)} aria-label="Удалить дату">
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {conflictFreeCount > 0 && (
                <div className="serial-actions">
                  <button
                    className="primary-button"
                    disabled={working || !effectiveSector}
                    onClick={createFromCalendar}
                    type="button"
                  >
                    <CopyPlus size={16} /> {working ? "Создаём..." : `Создать ${conflictFreeCount} броней`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {results && results.length > 0 && (
        <div className="admin-card serial-results">
          <h3>Результаты создания</h3>
          <div className="serial-results-list">
            {results.map((r) => (
              <div key={r.date} className={`serial-result-row ${r.success ? "success" : "error"}`}>
                <span>{r.success ? "✓" : "✗"}</span>
                <strong>{r.date}</strong>
                <span>{r.success ? "Создано" : r.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
