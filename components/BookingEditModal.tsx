"use client";

import { useState, useEffect, FormEvent } from "react";
import {
  X,
  Save,
  Trash2,
  Clock,
  Calendar,
  User,
  CreditCard,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import {
  DURATION_OPTIONS,
  FIELD_OPTIONS,
  formatPrice,
  SECTORS,
  TIME_SLOTS,
  PAYMENT_METHODS,
  PAYMENT_RECIPIENTS,
  WEEKDAY_NAMES,
} from "@/lib/constants";
import {
  BookingRequest,
  FieldFormat,
  PaymentStatus,
  PaymentRecord,
} from "@/lib/types";
import { bookingEndTime, bookingSlots, formatDuration } from "@/lib/time";
import CalendarPicker from "./CalendarPicker";

type Props = {
  booking: BookingRequest | null;
  fieldOptions: { id: FieldFormat; shortLabel: string; price: number }[];
  allBookings: BookingRequest[];
  onClose: () => void;
  onSave: (id: string, patch: Partial<BookingRequest>) => Promise<void>;
  onDelete: (id: string) => void;
  onAddPayment: (
    bookingId: string,
    payment: { amount: number; date: string; method: string; recipient: string },
  ) => Promise<void>;
  onDeletePayment: (bookingId: string, paymentId: string) => Promise<void>;
  onCreate?: (input: Partial<import("@/lib/types").BookingInput>) => Promise<void>;
  isCreateMode?: boolean;
  defaultDate?: string;
};

const statusLabel: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  confirmed: "Подтверждена",
  cancelled: "Отменена",
  deleted: "В корзине",
};

const paymentStatusLabel: Record<PaymentStatus, string> = {
  unpaid: "Не оплачено",
  deposit: "Частично оплачено",
  paid: "Полностью оплачено",
};

export default function BookingEditModal({
  booking,
  fieldOptions,
  allBookings,
  onClose,
  onSave,
  onDelete,
  onAddPayment,
  onDeletePayment,
  onCreate,
  isCreateMode = false,
  defaultDate,
}: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [team, setTeam] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [format, setFormat] = useState<FieldFormat>("quarter");
  const [sector, setSector] = useState("A");
  const [comment, setComment] = useState("");
  const [salePricePerHour, setSalePricePerHour] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payMethod, setPayMethod] = useState("Не выбран");
  const [payRecipient, setPayRecipient] = useState("Не выбран");

  useEffect(() => {
    if (isCreateMode) {
      setName("");
      setPhone("+7 ");
      setTeam("");
      setSelectedDate(defaultDate || new Date().toISOString().slice(0, 10));
      setFormat("quarter");
      setSector("A");
      setComment("");
      setSelectedTimes([]);
      setSalePricePerHour("");
      setPayDate(new Date().toISOString().slice(0, 10));
      setPayAmount("");
      setPayMethod("Не выбран");
      setPayRecipient("Не выбран");
      return;
    }
    if (!booking) return;
    setName(booking.name);
    setPhone(booking.phone);
    setTeam(booking.team);
    setSelectedDate(booking.date);
    setFormat(booking.format);
    setSector(booking.sector);
    setComment(booking.comment);
    setSelectedTimes(bookingSlots(booking.time, booking.duration));
    const hours = Math.max(1, booking.duration / 60);
    setSalePricePerHour(
      String(Math.round((booking.salePrice || booking.price) / hours)),
    );
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayAmount("");
    setPayMethod("Не выбран");
    setPayRecipient("Не выбран");
  }, [booking, isCreateMode, defaultDate]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!booking && !isCreateMode) return null;

  const startTime = selectedTimes[0] || "";
  const duration =
    selectedTimes.length >= 2 ? selectedTimes.length * 30 : 0;
  const endTime = duration ? bookingEndTime(startTime, duration) : "";

  const option =
    fieldOptions.find((item) => item.id === format) ||
    FIELD_OPTIONS.find((item) => item.id === format)!;
  const hourlyPrice = option.price;
  const selectedHours = duration / 60;
  const listPrice = Math.round(hourlyPrice * selectedHours);
  const customHourly = Number(salePricePerHour) > 0 ? Number(salePricePerHour) : 0;
  const salePrice = customHourly ? Math.round(customHourly * selectedHours) : listPrice;

  const totalPaid = (booking?.payments || []).reduce(
    (sum, p) => sum + p.amount,
    0,
  );
  const balance = Math.max(0, salePrice - totalPaid);
  const paymentStatus: PaymentStatus =
    totalPaid === 0 ? "unpaid" : totalPaid >= salePrice ? "paid" : "deposit";

  const otherBookings = allBookings.filter(
    (item) =>
      item.id !== (booking?.id || "") &&
      item.date === selectedDate &&
      item.status !== "cancelled" &&
      item.status !== "deleted",
  );

  function slotIsBusy(time: string) {
    const occupied = otherBookings
      .filter((b) => bookingSlots(b.time, b.duration).includes(time))
      .flatMap((b) => b.sector.split("+"));
    if (format === "full") return occupied.length > 0;
    if (format === "half") {
      const left = occupied.includes("A") || occupied.includes("C");
      const right = occupied.includes("B") || occupied.includes("D");
      return left && right;
    }
    return ["A", "B", "C", "D"].every((s) => occupied.includes(s));
  }

  function hasConflict(): boolean {
    if (!startTime || duration < 60) return false;
    const ourSlots = bookingSlots(startTime, duration);
    const ourParts = sector.split("+");
    for (const b of otherBookings) {
      const theirSlots = bookingSlots(b.time, b.duration);
      const theirParts = b.sector.split("+");
      const slotsOverlap = ourSlots.some((s) => theirSlots.includes(s));
      if (!slotsOverlap) continue;
      const partsOverlap = ourParts.some((p) => theirParts.includes(p));
      if (partsOverlap) return true;
    }
    return false;
  }

  const conflict = hasConflict();

  const busySectors = Array.from(
    new Set(
      selectedTimes.flatMap((slot) =>
        otherBookings
          .filter((b) => bookingSlots(b.time, b.duration).includes(slot))
          .flatMap((b) => b.sector.split("+")),
      ),
    ),
  );

  const sectorOptions = SECTORS[format].map((item) => {
    const parts = item.id.split("+");
    return { ...item, busy: parts.some((p) => busySectors.includes(p)) };
  });

  const startIdx = startTime ? TIME_SLOTS.indexOf(startTime) : -1;
  const maxSlots =
    startIdx === -1
      ? 0
      : TIME_SLOTS.slice(startIdx).findIndex((s) => slotIsBusy(s)) === -1
        ? TIME_SLOTS.length - startIdx
        : TIME_SLOTS.slice(startIdx).findIndex((s) => slotIsBusy(s));
  const durationOptions = DURATION_OPTIONS.filter(
    (m) => m / 30 <= maxSlots,
  );

  function slotsBetween(start: string, end: string) {
    const si = TIME_SLOTS.indexOf(start);
    const ei = TIME_SLOTS.indexOf(end);
    if (si === -1 || ei === -1 || ei <= si) return [];
    return TIME_SLOTS.slice(si, ei);
  }

  function canUseAsEnd(time: string) {
    if (!startTime || selectedTimes.length !== 1) return false;
    const range = slotsBetween(startTime, time);
    return range.length >= 2 && !range.some((s) => slotIsBusy(s));
  }

  function selectTime(time: string) {
    const busy = slotIsBusy(time);
    const selectableEnd = canUseAsEnd(time);

    if (!startTime || selectedTimes.length >= 2) {
      if (busy) return;
      setSelectedTimes([time]);
      return;
    }
    if (time === startTime) {
      setSelectedTimes([]);
      return;
    }
    const si = TIME_SLOTS.indexOf(startTime);
    const ei = TIME_SLOTS.indexOf(time);
    if (ei <= si) {
      if (busy) return;
      setSelectedTimes([time]);
      return;
    }
    if (busy && !selectableEnd) return;

    const minEnd = si + 2;
    const nextEnd = TIME_SLOTS[Math.max(ei, minEnd)];
    if (!nextEnd) {
      setSelectedTimes([startTime]);
      return;
    }
    const next = slotsBetween(startTime, nextEnd);
    if (next.length >= 2 && !next.some((s) => slotIsBusy(s))) {
      setSelectedTimes(next);
    }
  }

  function setTimeRange(time: string, minutes = Math.max(duration, 60)) {
    const index = TIME_SLOTS.indexOf(time);
    if (index === -1 || slotIsBusy(time)) {
      setSelectedTimes([]);
      return;
    }
    const count = Math.max(2, Math.ceil(minutes / 30));
    const next = TIME_SLOTS.slice(index, index + count);
    if (next.length < count || next.some((s) => slotIsBusy(s))) {
      setSelectedTimes([time]);
      return;
    }
    setSelectedTimes(next);
  }

  function changeDuration(minutes: number) {
    if (!startTime) return;
    setTimeRange(startTime, minutes);
  }

  function changeFormat(value: FieldFormat) {
    setFormat(value);
    setSector(SECTORS[value][0].id);
    setSelectedTimes([]);
  }

  function sectorForFieldPart(part: string) {
    if (format === "full") return "A+B+C+D";
    if (format === "half")
      return part === "A" || part === "C" ? "A+C" : "B+D";
    return part;
  }

  function chooseSectorFromField(part: string) {
    if (!duration) return;
    const next = sectorForFieldPart(part);
    const opt = sectorOptions.find((item) => item.id === next);
    if (!opt || opt.busy) return;
    setSector(next);
  }

  function changePhone(value: string) {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "+") {
      setPhone("+7 ");
      return;
    }
    if (trimmed.startsWith("+7")) {
      setPhone(value);
      return;
    }
    const digits = value.replace(/\D/g, "");
    setPhone(
      `+7 ${digits.startsWith("7") ? digits.slice(1) : digits}`,
    );
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!startTime || duration < 60 || !name.trim() || conflict) return;
    setSaving(true);
    if (isCreateMode && onCreate) {
      await onCreate({
        name,
        phone,
        team,
        date: selectedDate,
        time: startTime,
        duration,
        format,
        sector,
        price: salePrice,
        listPrice,
        salePrice,
        source: "Менеджер",
        sourceDetail: "Админка",
      });
    } else if (booking) {
      await onSave(booking.id, {
        name,
        phone,
        team,
        date: selectedDate,
        time: startTime,
        duration,
        format,
        sector,
        price: salePrice,
        listPrice,
        salePrice,
        comment,
      });
    }
    setSaving(false);
  }

  function handleDelete() {
    if (!booking) return;
    if (!confirm("Удалить эту бронь?")) return;
    setDeleting(true);
    onDelete(booking.id);
  }

  async function handleAddPayment(event: FormEvent) {
    event.preventDefault();
    if (!booking) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return;
    await onAddPayment(booking.id, {
      amount,
      date: payDate,
      method: payMethod,
      recipient: payRecipient,
    });
    setPayAmount("");
    setPayMethod("Не выбран");
    setPayRecipient("Не выбран");
  }

  const canSave =
    !saving &&
    !conflict &&
    Boolean(startTime) &&
    duration >= 60 &&
    name.trim().length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="booking-edit-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-left">
            {booking && <small className="modal-booking-id">{booking.id}</small>}
            <h2>{isCreateMode ? "Новая бронь" : "Редактирование брони"}</h2>
          </div>
          <div className="modal-header-right">
            {booking && (
              <span className={`status-label ${booking.status}`}>
                {statusLabel[booking.status]}
              </span>
            )}
            <button
              className="modal-close"
              onClick={onClose}
              type="button"
              aria-label="Закрыть"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          <section className="modal-section">
            <div className="modal-section-title">
              <User size={16} /> Клиент
            </div>
            <div className="modal-form-grid">
              <div className="form-field">
                <label>Имя</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Имя клиента"
                />
              </div>
              <div className="form-field">
                <label>Телефон</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => changePhone(event.target.value)}
                  placeholder="+7 (___) ___-__-__"
                />
              </div>
              <div className="form-field full">
                <label>Команда / компания</label>
                <input
                  value={team}
                  onChange={(event) => setTeam(event.target.value)}
                  placeholder="Название команды"
                />
              </div>
            </div>
          </section>

          <section className="modal-section">
            <div className="modal-section-title">
              <Calendar size={16} /> Детали брони
            </div>

            <div className="modal-format-grid">
              {fieldOptions.map((item) => (
                <button
                  className={`modal-format-card ${format === item.id ? "selected" : ""}`}
                  key={item.id}
                  onClick={() => changeFormat(item.id)}
                  type="button"
                >
                  <strong>{item.shortLabel}</strong>
                  <small>{formatPrice(item.price)}/ч</small>
                </button>
              ))}
            </div>

            <div className="modal-date-picker">
              <CalendarPicker
                value={selectedDate}
                onChange={(date) => {
                  setSelectedDate(date);
                  setSelectedTimes([]);
                }}
              />
            </div>

            <div className="modal-time-section">
              <div className="time-picker-panel">
                <div className="form-field">
                  <label>Начало</label>
                  <select
                    value={startTime}
                    onChange={(event) => {
                      setTimeRange(event.target.value, duration || 60);
                      setSector(SECTORS[format][0].id);
                    }}
                  >
                    <option value="">Выберите время</option>
                    {TIME_SLOTS.map((time, index) => (
                      <option
                        disabled={
                          slotIsBusy(time) || index > TIME_SLOTS.length - 2
                        }
                        key={time}
                        value={time}
                      >
                        {time}
                        {slotIsBusy(time) ? " · занято" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Длительность</label>
                  <select
                    disabled={!startTime}
                    value={duration || 60}
                    onChange={(event) =>
                      changeDuration(Number(event.target.value))
                    }
                  >
                    {durationOptions.length === 0 && (
                      <option value={60}>Нет доступного интервала</option>
                    )}
                    {durationOptions.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {formatDuration(minutes)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="duration-quick-row">
                {DURATION_OPTIONS.slice(0, 7).map((minutes) => (
                  <button
                    className={duration === minutes ? "selected" : ""}
                    disabled={
                      !startTime || !durationOptions.includes(minutes)
                    }
                    key={minutes}
                    onClick={() => changeDuration(minutes)}
                    type="button"
                  >
                    {formatDuration(minutes)}
                  </button>
                ))}
              </div>
              <div className="slots-grid modal-slots-grid">
                {TIME_SLOTS.map((time) => {
                  const busy = slotIsBusy(time);
                  const selectableEnd = canUseAsEnd(time);
                  const isBoundary = endTime === time;
                  const visuallyBusy =
                    busy && !selectableEnd && !isBoundary;
                  return (
                    <button
                      className={`slot ${time.endsWith(":30") ? "half-hour" : ""} ${selectedTimes.includes(time) || isBoundary ? "selected" : ""} ${isBoundary ? "range-boundary" : ""} ${visuallyBusy ? "busy" : ""}`}
                      disabled={visuallyBusy}
                      key={time}
                      onClick={() => {
                        selectTime(time);
                        setSector(SECTORS[format][0].id);
                      }}
                      type="button"
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
              {startTime && duration >= 60 && (
                <div className="inline-price-total">
                  <span>
                    {startTime}–{endTime} · {formatDuration(duration)}
                  </span>
                  <strong>{formatPrice(salePrice)}</strong>
                </div>
              )}
            </div>

            <div className="modal-sector-section">
              <div className="field-visual">
                {["A", "B", "C", "D"].map((part) => {
                  const fieldSector = sectorForFieldPart(part);
                  const opt = sectorOptions.find(
                    (s) => s.id === fieldSector,
                  );
                  const selected = sector.split("+").includes(part);
                  const busy = Boolean(
                    opt?.busy || busySectors.includes(part),
                  );
                  return (
                    <button
                      className={`field-sector ${busy ? "busy" : ""} ${selected ? "selected" : ""}`}
                      disabled={!duration || busy}
                      key={part}
                      onClick={() => chooseSectorFromField(part)}
                      type="button"
                    >
                      {part}
                    </button>
                  );
                })}
              </div>
              <div className="sector-options">
                {sectorOptions.map((item) => (
                  <button
                    className={`sector-option ${sector === item.id ? "selected" : ""}`}
                    disabled={!duration || item.busy}
                    key={item.id}
                    onClick={() => setSector(item.id)}
                    type="button"
                  >
                    <span>{item.label}</span>
                    <small>{item.busy ? "Занято" : "Свободно"}</small>
                  </button>
                ))}
              </div>
              {conflict && (
                <div className="conflict-warning">
                  <AlertTriangle size={16} /> Конфликт: это время и сектор
                  уже заняты другой бронью
                </div>
              )}
            </div>
          </section>

          <section className="modal-section">
            <div className="modal-section-title">
              <CreditCard size={16} /> Стоимость
            </div>
            <div className="modal-form-grid">
              <div className="form-field">
                <label>Индивидуальная цена за час</label>
                <input
                  min="0"
                  type="number"
                  value={salePricePerHour}
                  onChange={(event) => setSalePricePerHour(event.target.value)}
                  placeholder={`${formatPrice(hourlyPrice)} / час`}
                />
                <small>
                  Прайс: {formatPrice(hourlyPrice)}/ч · Итого:{" "}
                  {formatPrice(salePrice)}
                </small>
              </div>
            </div>
          </section>

          <section className="modal-section">
            <div className="modal-section-title">
              <CreditCard size={16} /> Оплата
            </div>
            <div className="payment-summary">
              <div className="payment-summary-row">
                <span>Стоимость</span>
                <strong>{formatPrice(salePrice)}</strong>
              </div>
              <div className="payment-summary-row">
                <span>Оплачено</span>
                <strong>{formatPrice(totalPaid)}</strong>
              </div>
              <div className="payment-summary-row balance">
                <span>Остаток</span>
                <strong>{formatPrice(balance)}</strong>
              </div>
              <span className={`payment-badge ${paymentStatus}`}>
                {paymentStatusLabel[paymentStatus]}
              </span>
            </div>

            {booking && booking.payments.length > 0 && (
              <div className="payment-records">
                {booking.payments.map((p) => (
                  <div className="payment-record" key={p.id}>
                    <div className="payment-record-info">
                      <strong>{formatPrice(p.amount)}</strong>
                      <small>
                        {p.date} · {p.method} · {p.recipient}
                      </small>
                    </div>
                    <button
                      className="payment-delete"
                      onClick={() => onDeletePayment(booking.id, p.id)}
                      type="button"
                      aria-label={`Удалить платёж ${p.id}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {booking && (
            <form className="add-payment-form" onSubmit={handleAddPayment}>
              <div className="modal-form-grid">
                <div className="form-field">
                  <label>Сумма</label>
                  <input
                    min="1"
                    type="number"
                    value={payAmount}
                    onChange={(event) => setPayAmount(event.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="form-field">
                  <label>Дата</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(event) => setPayDate(event.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Способ оплаты</label>
                  <select
                    value={payMethod}
                    onChange={(event) => setPayMethod(event.target.value)}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Получатель</label>
                  <select
                    value={payRecipient}
                    onChange={(event) =>
                      setPayRecipient(event.target.value)
                    }
                  >
                    {PAYMENT_RECIPIENTS.map((recipient) => (
                      <option key={recipient}>{recipient}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                className="secondary-button"
                disabled={!payAmount || Number(payAmount) <= 0}
                type="submit"
              >
                Добавить платёж
              </button>
            </form>
            )}
          </section>

          <section className="modal-section">
            <div className="modal-section-title">
              <MessageSquare size={16} /> Комментарий
            </div>
            <textarea
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Заметки по брони..."
            />
          </section>
        </div>

        <div className="modal-footer">
          {!isCreateMode && booking && (
            <button
              className="danger-button"
              disabled={deleting}
              onClick={handleDelete}
              type="button"
            >
              <Trash2 size={16} /> {deleting ? "Удаляем..." : "Удалить"}
            </button>
          )}
          <div className="modal-footer-right">
            <button
              className="secondary-button"
              onClick={onClose}
              type="button"
            >
              Отмена
            </button>
            <button
              className="primary-button"
              disabled={!canSave}
              onClick={handleSave}
              type="button"
            >
              <Save size={16} />{" "}
              {saving ? "Сохраняем..." : isCreateMode ? "Создать" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
