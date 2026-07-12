"use client";

import { useState, useMemo } from "react";
import { CalendarDays, Plus, Search, Trash2, Edit3, Clock } from "lucide-react";
import { TIME_SLOTS, FIELD_OPTIONS, formatPrice, SECTORS } from "@/lib/constants";
import { BookingRequest, FieldFormat } from "@/lib/types";
import { bookingEndTime, formatDuration } from "@/lib/time";
import CalendarPicker from "./CalendarPicker";

type Props = {
  bookings: BookingRequest[];
  fieldOptions: { id: FieldFormat; shortLabel: string; price: number }[];
  onSelectBooking: (id: string) => void;
  onDeleteBooking: (id: string) => void;
  onAddBooking: () => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
};

const SLOT_HEIGHT = 32;
const TIMELINE_START = "08:00";
const TIMELINE_END = "23:30";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatLabel(format: FieldFormat, sector: string): string {
  if (format === "full") return "Поле целиком";
  if (format === "half") return `1/2 поля \u2022 ${sector}`;
  return `1/4 поля \u2022 Сектор ${sector}`;
}

function formatShortDate(iso: string): string {
  const parts = iso.split("-");
  return `${parts[2]}.${parts[1]}`;
}

const WEEKDAY_FULL = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
];

function dateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return `${WEEKDAY_FULL[d.getDay()]}, ${d.getDate()} ${String(d.getMonth() + 1).padStart(2, "0")} ${d.getFullYear()}`;
}

export default function ScheduleView({
  bookings,
  fieldOptions,
  onSelectBooking,
  onDeleteBooking,
  onAddBooking,
  selectedDate,
  onDateChange,
}: Props) {
  const [query, setQuery] = useState("");

  const startIndex = TIME_SLOTS.indexOf(TIMELINE_START);
  const endIndex = TIME_SLOTS.indexOf(TIMELINE_END);
  const visibleSlots = TIME_SLOTS.slice(startIndex, endIndex === -1 ? TIME_SLOTS.length : endIndex + 1);

  const dayBookings = useMemo(() => {
    return bookings
      .filter(
        (b) =>
          b.date === selectedDate &&
          b.status !== "cancelled" &&
          b.status !== "deleted",
      )
      .filter((b) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          b.name.toLowerCase().includes(q) ||
          b.phone.toLowerCase().includes(q) ||
          b.team.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [bookings, selectedDate, query]);

  function cardStyle(b: BookingRequest) {
    const startMin = timeToMinutes(b.time);
    const durationMin = b.duration;
    const timelineStartMin = timeToMinutes(TIMELINE_START);
    const topSlots = (startMin - timelineStartMin) / 30;
    const heightSlots = Math.max(2, durationMin / 30);
    return {
      position: "absolute" as const,
      top: topSlots * SLOT_HEIGHT,
      left: 0,
      right: 0,
      height: heightSlots * SLOT_HEIGHT - 2,
      zIndex: 2,
    };
  }

  function borderColor(status: string): string {
    if (status === "paid") return "#176b45";
    if (status === "deposit") return "#d4a017";
    return "#d65045";
  }

  function bgTint(status: string): string {
    if (status === "paid") return "rgba(23, 107, 69, 0.06)";
    if (status === "deposit") return "rgba(212, 160, 23, 0.06)";
    return "rgba(214, 80, 69, 0.06)";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="section-kicker">Расписание</div>
          <h1 style={{ margin: 0, fontSize: 31, letterSpacing: "-0.05em" }}>
            Расписание на поле
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 12 }}>
            {dateLabel(selectedDate)}
          </p>
        </div>
        <button
          className="primary-button"
          onClick={onAddBooking}
          type="button"
          style={{ flex: "0 0 auto" }}
        >
          <Plus size={16} /> Добавить бронь
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 300px) minmax(0, 1fr)",
          gap: 14,
          alignItems: "start",
        }}
      >
        <aside className="admin-card" style={{ padding: 17, position: "sticky", top: 20 }}>
          <CalendarPicker value={selectedDate} onChange={onDateChange} allowPast />
          <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--green)" }}>
                Брони дня
              </span>
              <span
                style={{
                  padding: "4px 9px",
                  borderRadius: 99,
                  background: "var(--green-soft)",
                  color: "var(--green)",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {dayBookings.length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dayBookings.map((b) => (
                <button
                  key={b.id}
                  onClick={() => onSelectBooking(b.id)}
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "10px 12px",
                    textAlign: "left",
                    color: "var(--ink)",
                    border: "1px solid var(--line)",
                    borderRadius: 11,
                    background: "var(--white)",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 3,
                      height: 30,
                      borderRadius: 2,
                      background: borderColor(b.paymentStatus),
                      flex: "0 0 3px",
                    }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <strong
                      style={{
                        display: "block",
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.time}–{bookingEndTime(b.time, b.duration)}
                    </strong>
                    <small
                      style={{
                        display: "block",
                        marginTop: 2,
                        color: "var(--muted)",
                        fontSize: 9,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.name} · {b.team || b.phone}
                    </small>
                  </span>
                </button>
              ))}
              {dayBookings.length === 0 && (
                <div className="empty-state" style={{ padding: 24 }}>
                  Броней нет
                </div>
              )}
            </div>
          </div>
        </aside>

        <div>
          <div
            className="admin-card"
            style={{ padding: 16, marginBottom: 14, overflow: "hidden" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div className="search-box" style={{ flex: 1 }}>
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по имени, телефону, команде..."
                />
              </div>
            </div>
          </div>

          <div
            className="admin-card schedule-view"
            style={{ overflow: "hidden" }}
          >
            <div className="schedule-timeline-header">
              <div className="schedule-timeline-time-col">
                <Clock size={14} />
              </div>
              <div className="schedule-timeline-content-col">
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--ink)" }}>
                  {formatShortDate(selectedDate)}
                </span>
              </div>
            </div>

            <div
              className="schedule-timeline"
              style={{ position: "relative" }}
            >
              {visibleSlots.map((time, i) => (
                <div
                  key={time}
                  className="schedule-timeline-row"
                  style={{
                    height: SLOT_HEIGHT,
                    display: "flex",
                    alignItems: "flex-start",
                  }}
                >
                  <div className="schedule-timeline-time-col">
                    {time.endsWith(":00") && (
                      <span className="schedule-time-label">{time}</span>
                    )}
                  </div>
                  <div className="schedule-timeline-content-col">
                    <div className="schedule-timeline-gridline" />
                  </div>
                </div>
              ))}

              {dayBookings.map((b) => {
                const end = bookingEndTime(b.time, b.duration);
                const fmt = fieldOptions.find((f) => f.id === b.format);
                const durationText = formatDuration(b.duration);
                return (
                  <div
                    key={b.id}
                    className="schedule-card"
                    style={{
                      ...cardStyle(b),
                      borderLeft: `4px solid ${borderColor(b.paymentStatus)}`,
                      background: bgTint(b.paymentStatus),
                    }}
                    onClick={() => onSelectBooking(b.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="schedule-card-inner">
                      <div className="schedule-card-head">
                        <span className="schedule-card-time">
                          {b.time}–{end}
                        </span>
                        <span className="schedule-card-duration">{durationText}</span>
                        <div className="schedule-card-actions">
                          <button
                            className="schedule-card-action"
                            aria-label={`Редактировать ${b.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectBooking(b.id);
                            }}
                            type="button"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            className="schedule-card-action schedule-card-action--danger"
                            aria-label={`Удалить ${b.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteBooking(b.id);
                            }}
                            type="button"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="schedule-card-name">{b.name}</div>
                      <div className="schedule-card-format">
                        {formatLabel(b.format, b.sector)}
                      </div>
                      <div className="schedule-card-meta">
                        <span>{b.team || b.phone}</span>
                        <span>{fmt ? formatPrice(b.price) : ""}</span>
                      </div>
                      {b.comment && (
                        <div className="schedule-card-comment">{b.comment}</div>
                      )}
                    </div>
                  </div>
                );
              })}

              {dayBookings.length === 0 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    color: "var(--muted)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Нет бронирований на этот день
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .schedule-timeline-header {
          display: flex;
          border-bottom: 1px solid var(--line);
        }
        .schedule-timeline-time-col {
          width: 56px;
          flex: 0 0 56px;
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
          padding-right: 10px;
        }
        .schedule-timeline-content-col {
          flex: 1;
          min-width: 0;
          padding: 10px 12px;
        }
        .schedule-timeline-time-col svg {
          margin-top: 10px;
          color: var(--muted);
        }
        .schedule-time-label {
          position: relative;
          top: -7px;
          font-size: 10px;
          font-weight: 800;
          color: var(--muted);
          text-align: right;
        }
        .schedule-timeline {
          overflow-y: auto;
          max-height: 680px;
        }
        .schedule-timeline-row {
          display: flex;
        }
        .schedule-timeline-row + .schedule-timeline-row {
          border-top: 1px solid #f0f3f1;
        }
        .schedule-timeline-gridline {
          height: 100%;
          border-bottom: 1px dashed #e8ede9;
        }
        .schedule-card {
          margin-left: 56px;
          margin-right: 8px;
          border-radius: 10px;
          cursor: pointer;
          overflow: hidden;
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .schedule-card:hover {
          transform: translateX(2px);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
        }
        .schedule-card-inner {
          padding: 6px 10px;
          overflow: hidden;
        }
        .schedule-card-head {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .schedule-card-time {
          font-size: 11px;
          font-weight: 800;
          color: var(--ink);
        }
        .schedule-card-duration {
          font-size: 9px;
          font-weight: 700;
          color: var(--muted);
        }
        .schedule-card-actions {
          margin-left: auto;
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: opacity 120ms ease;
        }
        .schedule-card:hover .schedule-card-actions {
          opacity: 1;
        }
        .schedule-card-action {
          width: 22px;
          height: 22px;
          display: grid;
          place-items: center;
          color: var(--muted);
          border: 1px solid var(--line);
          border-radius: 6px;
          background: var(--white);
          padding: 0;
          cursor: pointer;
        }
        .schedule-card-action:hover {
          color: var(--green);
          border-color: var(--green);
          background: var(--green-soft);
        }
        .schedule-card-action--danger:hover {
          color: var(--red);
          border-color: #f0d1cd;
          background: var(--red-soft);
        }
        .schedule-card-name {
          margin-top: 3px;
          font-size: 11px;
          font-weight: 700;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .schedule-card-format {
          margin-top: 2px;
          font-size: 13px;
          font-weight: 900;
          color: var(--green-dark);
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .schedule-card-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          margin-top: 2px;
        }
        .schedule-card-meta span {
          font-size: 9px;
          font-weight: 600;
          color: var(--muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .schedule-card-meta span:last-child {
          font-weight: 800;
          color: var(--green);
          flex: 0 0 auto;
        }
        .schedule-card-comment {
          margin-top: 2px;
          font-size: 8px;
          color: var(--muted);
          font-style: italic;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        @media (max-width: 900px) {
          .schedule-view .schedule-card {
            margin-left: 0;
            margin-right: 4px;
          }
        }
        @media (max-width: 620px) {
          .schedule-timeline {
            max-height: none;
          }
          .schedule-card-actions {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
