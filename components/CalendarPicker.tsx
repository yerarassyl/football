"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

const monthNames = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function CalendarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const selected = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setFullYear(maxDate.getFullYear() + 1);

  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());
  const years = Array.from(
    { length: maxDate.getFullYear() - today.getFullYear() + 1 },
    (_, index) => today.getFullYear() + index,
  );

  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: days }, (_, index) => index + 1),
    ];
  }, [viewMonth, viewYear]);

  function moveMonth(direction: number) {
    const next = new Date(viewYear, viewMonth + direction, 1);
    const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const maxMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    if (next < minMonth || next > maxMonth) return;
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  return (
    <div className="calendar-picker">
      <div className="calendar-toolbar">
        <button type="button" onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц">
          <ChevronLeft size={18} />
        </button>
        <div className="calendar-selects">
          <select value={viewMonth} onChange={(event) => setViewMonth(Number(event.target.value))}>
            {monthNames.map((month, index) => <option value={index} key={month}>{month}</option>)}
          </select>
          <select value={viewYear} onChange={(event) => setViewYear(Number(event.target.value))}>
            {years.map((year) => <option key={year}>{year}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => moveMonth(1)} aria-label="Следующий месяц">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="calendar-weekdays">
        {weekDays.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-days">
        {cells.map((day, index) => {
          if (!day) return <span className="calendar-empty" key={`empty-${index}`} />;
          const date = new Date(viewYear, viewMonth, day);
          const iso = toIso(viewYear, viewMonth, day);
          const disabled = date < today || date > maxDate;
          return (
            <button
              className={`${value === iso ? "selected" : ""} ${disabled ? "disabled" : ""}`}
              disabled={disabled}
              key={iso}
              onClick={() => onChange(iso)}
              type="button"
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
