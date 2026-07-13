"use client";

import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  CircleDollarSign,
  CopyPlus,
  LogOut,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  Trophy,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { enrichBooking, formatLabel } from "@/lib/booking";
import { FIELD_OPTIONS, FieldOption, formatPrice, SECTORS } from "@/lib/constants";
import { bookingEndTime, formatDuration } from "@/lib/time";
import { BookingRequest, FieldFormat, PaymentRecord } from "@/lib/types";
import CalendarPicker from "./CalendarPicker";

type Tab = "schedule" | "repeat" | "trash" | "analytics" | "settings";

type EditorState = {
  id?: string;
  date: string;
  time: string;
  duration: number;
  format: FieldFormat;
  sector: string;
  name: string;
  phone: string;
  team: string;
  source: string;
  sourceDetail: string;
  salePrice: string;
  comment: string;
  status: BookingRequest["status"];
};

const paymentMethods = [
  "Не выбран",
  "Наличные",
  "Kaspi QR",
  "Kaspi Терминал",
  "Счет на оплату",
  "Банковский перевод",
  "Контрактный клиент",
  "Другое",
];

const paymentRecipients = [
  "Не выбран",
  "ТОО AIR ARENA",
  "ИП AIR ARENA",
  "ТОО WMA GROUP",
  "Другое",
];

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function localDateValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function diffDays(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function bookingSort(a: BookingRequest, b: BookingRequest) {
  return `${a.date}-${a.time}`.localeCompare(`${b.date}-${b.time}`);
}

function matchQuery(item: BookingRequest, query: string) {
  const value = query.trim().toLowerCase();
  if (!value) return true;
  return [item.name, item.phone, item.team, item.comment, item.source, item.sourceDetail]
    .join(" ")
    .toLowerCase()
    .includes(value);
}

function calculateListPrice(fieldOptions: FieldOption[], format: FieldFormat, duration: number) {
  const hourly = fieldOptions.find((item) => item.id === format)?.price || 0;
  return Math.round(hourly * (duration / 60));
}

function defaultEditor(date: string, fieldOptions: FieldOption[]): EditorState {
  const format: FieldFormat = "quarter";
  const duration = 60;
  return {
    date,
    time: "09:00",
    duration,
    format,
    sector: SECTORS[format][0].id,
    name: "",
    phone: "",
    team: "",
    source: "Администратор",
    sourceDetail: "",
    salePrice: String(calculateListPrice(fieldOptions, format, duration)),
    comment: "",
    status: "confirmed",
  };
}

function editorFromBooking(booking: BookingRequest): EditorState {
  return {
    id: booking.id,
    date: booking.date,
    time: booking.time,
    duration: booking.duration,
    format: booking.format,
    sector: booking.sector,
    name: booking.name,
    phone: booking.phone,
    team: booking.team,
    source: booking.source,
    sourceDetail: booking.sourceDetail,
    salePrice: String(booking.salePrice || booking.price || 0),
    comment: booking.comment || "",
    status: booking.status,
  };
}

function paymentClass(booking: BookingRequest) {
  return `payment-card ${booking.paymentStatus}`;
}

function noticeText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Не удалось выполнить действие";
}

export default function AdminDashboard() {
  const today = localDateValue();
  const [tab, setTab] = useState<Tab>("schedule");
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedId, setSelectedId] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const [editor, setEditor] = useState<EditorState>(() => defaultEditor(today, FIELD_OPTIONS));
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>(FIELD_OPTIONS);

  function showNotice(type: "success" | "error", text: string) {
    setNotice({ type, text });
    window.setTimeout(() => {
      setNotice((current) => (current?.text === text ? null : current));
    }, 3000);
  }

  async function load() {
    const response = await fetch("/api/bookings", { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = (await response.json()) as BookingRequest[];
    setBookings(data.map(enrichBooking));
    setLoading(false);
  }

  async function loadSettings() {
    const response = await fetch("/api/settings", { cache: "no-store" });
    const settings = await response.json();
    setFieldOptions((items) =>
      items.map((item) => ({
        ...item,
        price: settings.prices?.[item.id] ?? item.price,
      })),
    );
  }

  useEffect(() => {
    void load();
    void loadSettings();
  }, []);

  const selectedBooking = useMemo(
    () => bookings.find((item) => item.id === selectedId),
    [bookings, selectedId],
  );

  useEffect(() => {
    if (createMode) {
      setEditor(defaultEditor(selectedDate, fieldOptions));
      return;
    }
    if (selectedBooking) {
      setEditor(editorFromBooking(selectedBooking));
    }
  }, [createMode, selectedBooking, selectedDate, fieldOptions]);

  const scheduleBookings = useMemo(() => {
    const active = bookings.filter((item) => item.status !== "deleted");
    const source = query.trim()
      ? active.filter((item) => matchQuery(item, query))
      : active.filter((item) => item.date === selectedDate);
    return [...source].sort(bookingSort);
  }, [bookings, query, selectedDate]);

  const trashBookings = useMemo(
    () => bookings.filter((item) => item.status === "deleted" && matchQuery(item, query)).sort(bookingSort),
    [bookings, query],
  );

  async function persistPatch(id: string, patch: Partial<BookingRequest>) {
    const response = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Не удалось сохранить изменения");
    const updated = enrichBooking(result as BookingRequest);
    setBookings((current) => current.map((item) => (item.id === id ? updated : item)));
    setSelectedId(updated.id);
    return updated;
  }

  async function saveBooking(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const listPrice = calculateListPrice(fieldOptions, editor.format, editor.duration);
      const salePrice = Number(editor.salePrice) || listPrice;
      const payload = {
        date: editor.date,
        time: editor.time,
        duration: Number(editor.duration) || 60,
        format: editor.format,
        sector: editor.sector,
        listPrice,
        salePrice,
        price: salePrice,
        name: editor.name,
        phone: editor.phone,
        team: editor.team,
        source: editor.source || "Администратор",
        sourceDetail: editor.sourceDetail || "",
      };

      if (editor.id) {
        await persistPatch(editor.id, {
          ...payload,
          comment: editor.comment,
          status: editor.status,
        });
        showNotice("success", "Бронь обновлена");
      } else {
        const createResponse = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const created = await createResponse.json();
        if (!createResponse.ok) {
          throw new Error(created.error || "Не удалось создать бронь");
        }

        const finalized = await persistPatch((created as BookingRequest).id, {
          status: editor.status,
          comment: editor.comment,
          source: payload.source,
          sourceDetail: payload.sourceDetail,
        });
        setBookings((current) => [finalized, ...current.filter((item) => item.id !== finalized.id)]);
        setCreateMode(false);
        showNotice("success", "Бронь создана");
      }
    } catch (error) {
      showNotice("error", noticeText(error));
    } finally {
      setSaving(false);
    }
  }

  async function addPayment(payment: Omit<PaymentRecord, "id">) {
    if (!selectedBooking) return;
    setSaving(true);
    try {
      const payments = [
        ...selectedBooking.payments,
        {
          id: `PAY-${Date.now()}`,
          ...payment,
        },
      ];
      await persistPatch(selectedBooking.id, { payments });
      showNotice("success", "Оплата добавлена");
    } catch (error) {
      showNotice("error", noticeText(error));
    } finally {
      setSaving(false);
    }
  }

  async function moveToTrash(id: string) {
    try {
      await persistPatch(id, { status: "deleted", deletedAt: new Date().toISOString() });
      showNotice("success", "Бронь отправлена в корзину");
    } catch (error) {
      showNotice("error", noticeText(error));
    }
  }

  async function restoreFromTrash(id: string) {
    try {
      await persistPatch(id, { status: "confirmed", deletedAt: "" });
      showNotice("success", "Бронь восстановлена");
    } catch (error) {
      showNotice("error", noticeText(error));
    }
  }

  async function deleteForever(id: string) {
    try {
      const response = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось удалить бронь");
      setBookings((current) => current.filter((item) => item.id !== id));
      if (selectedId === id) {
        setSelectedId("");
      }
      showNotice("success", "Бронь удалена окончательно");
    } catch (error) {
      showNotice("error", noticeText(error));
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <a className="brand admin-brand" href="/">
          <span className="brand-mark"><Trophy size={18} /></span> Air Arena
        </a>
        <nav>
          <button className={tab === "schedule" ? "active" : ""} onClick={() => setTab("schedule")}>
            <CalendarDays size={18} /> График
          </button>
          <button className={tab === "repeat" ? "active" : ""} onClick={() => setTab("repeat")}>
            <CopyPlus size={18} /> Повтор
          </button>
          <button className={tab === "trash" ? "active" : ""} onClick={() => setTab("trash")}>
            <Trash2 size={18} /> Корзина
          </button>
          <button className={tab === "analytics" ? "active" : ""} onClick={() => setTab("analytics")}>
            <BarChart3 size={18} /> Аналитика
          </button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
            <CircleDollarSign size={18} /> Цены
          </button>
        </nav>
        <button className="logout-button" onClick={logout}><LogOut size={16} /> Выйти</button>
      </aside>

      <main className="admin-main">
        {notice && <div className={`admin-toast ${notice.type}`}>{notice.text}</div>}
        <div className="admin-mobile-head">
          <span className="brand"><span className="brand-mark"><Trophy size={16} /></span> Air Arena</span>
          <button className="secondary-button" onClick={logout}><LogOut size={15} /></button>
        </div>

        {tab === "schedule" && (
          <>
            <div className="admin-heading">
              <div>
                <div className="section-kicker">График</div>
                <h1>Расписание на день</h1>
                <p>Календарь, дневной список, редактирование и оплаты на одном экране.</p>
              </div>
              <div className="schedule-head-actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    setCreateMode(true);
                    setSelectedId("");
                    setEditor(defaultEditor(selectedDate, fieldOptions));
                  }}
                  type="button"
                >
                  <Plus size={16} /> Новая бронь
                </button>
                <button className="secondary-button" onClick={() => void load()} type="button">
                  <RefreshCcw size={16} /> Обновить
                </button>
              </div>
            </div>

            <div className="admin-schedule-grid">
              <section className="admin-card schedule-panel">
                <div className="schedule-toolbar">
                  <CalendarPicker value={selectedDate} onChange={setSelectedDate} />
                  <div className="search-box schedule-search">
                    <Search size={16} />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Поиск по имени, телефону, команде"
                    />
                  </div>
                </div>
                <div className="schedule-day-head">
                  <div>
                    <strong>{query.trim() ? "Результаты поиска" : `Дата ${selectedDate}`}</strong>
                    <small>{query.trim() ? `${scheduleBookings.length} совпадений` : "Карточки окрашены по статусу оплаты"}</small>
                  </div>
                </div>
                <div className="schedule-list">
                  {loading && <div className="empty-state">Загружаем график...</div>}
                  {!loading && scheduleBookings.length === 0 && <div className="empty-state">На выбранный период броней нет</div>}
                  {scheduleBookings.map((booking) => (
                    <button
                      className={`schedule-card ${paymentClass(booking)} ${selectedId === booking.id && !createMode ? "selected" : ""}`}
                      key={booking.id}
                      onClick={() => {
                        setCreateMode(false);
                        setSelectedId(booking.id);
                      }}
                      type="button"
                    >
                      <div className="schedule-card-time">
                        <strong>{booking.time}-{bookingEndTime(booking.time, booking.duration)}</strong>
                        <span>{formatDuration(booking.duration)}</span>
                        {query.trim() && <small>{booking.date}</small>}
                      </div>
                      <div className="schedule-card-body">
                        <div className="schedule-card-top">
                          <strong>{booking.name}</strong>
                          <span>{formatPrice(booking.salePrice || booking.price)}</span>
                        </div>
                        <div className="schedule-card-format">{formatLabel(booking.format)}</div>
                        <div className="schedule-card-meta">
                          <span>{booking.sector}</span>
                          <span>{booking.team || booking.phone}</span>
                        </div>
                        {booking.comment && <div className="schedule-card-comment">{booking.comment}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <BookingEditor
                booking={selectedBooking}
                createMode={createMode}
                editor={editor}
                fieldOptions={fieldOptions}
                onAddPayment={addPayment}
                onChange={setEditor}
                onDelete={() => selectedBooking && void moveToTrash(selectedBooking.id)}
                onSave={saveBooking}
                onCancelCreate={() => setCreateMode(false)}
                saving={saving}
              />
            </div>
          </>
        )}

        {tab === "repeat" && (
          <RepeatPlanner
            bookings={bookings}
            onComplete={async (message) => {
              await load();
              showNotice("success", message);
            }}
          />
        )}

        {tab === "trash" && (
          <>
            <div className="admin-heading">
              <div>
                <div className="section-kicker">Корзина</div>
                <h1>Удаленные брони</h1>
                <p>Можно восстановить бронь или удалить запись из Google Sheets навсегда.</p>
              </div>
            </div>
            <section className="admin-card trash-list">
              <div className="toolbar">
                <div className="search-box">
                  <Search size={16} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск в корзине" />
                </div>
              </div>
              {trashBookings.length === 0 ? (
                <div className="empty-state">Корзина пуста</div>
              ) : trashBookings.map((booking) => (
                <div className="trash-row" key={booking.id}>
                  <div>
                    <strong>{booking.date} · {booking.time}-{bookingEndTime(booking.time, booking.duration)}</strong>
                    <small>{booking.name} · {formatLabel(booking.format)} · {booking.sector}</small>
                  </div>
                  <div className="trash-actions">
                    <button className="secondary-button" onClick={() => void restoreFromTrash(booking.id)} type="button">Восстановить</button>
                    <button className="danger-button" onClick={() => void deleteForever(booking.id)} type="button">Удалить навсегда</button>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        {tab === "analytics" && <AnalyticsDashboard bookings={bookings} />}
        {tab === "settings" && <PriceSettings fieldOptions={fieldOptions} onChange={setFieldOptions} />}
      </main>
    </div>
  );
}

function BookingEditor({
  booking,
  createMode,
  editor,
  fieldOptions,
  onAddPayment,
  onChange,
  onDelete,
  onSave,
  onCancelCreate,
  saving,
}: {
  booking?: BookingRequest;
  createMode: boolean;
  editor: EditorState;
  fieldOptions: FieldOption[];
  onAddPayment: (payment: Omit<PaymentRecord, "id">) => Promise<void>;
  onChange: (editor: EditorState) => void;
  onDelete: () => void;
  onSave: (event: FormEvent) => Promise<void>;
  onCancelCreate: () => void;
  saving: boolean;
}) {
  const listPrice = calculateListPrice(fieldOptions, editor.format, editor.duration);
  const paymentTotal = booking?.prepayment || 0;
  const balance = Math.max(0, (Number(editor.salePrice) || listPrice) - paymentTotal);
  const sectorOptions = SECTORS[editor.format];
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    date: localDateValue(),
    method: "Не выбран",
    recipient: "Не выбран",
  });

  useEffect(() => {
    setPaymentForm({
      amount: "",
      date: localDateValue(),
      method: "Не выбран",
      recipient: "Не выбран",
    });
  }, [booking?.id]);

  if (!createMode && !booking) {
    return (
      <aside className="admin-card booking-editor empty-details">
        <CalendarDays size={28} />
        <strong>Выберите бронь</strong>
        <span>Справа откроется редактирование, оплаты и действия с записью.</span>
      </aside>
    );
  }

  return (
    <aside className="admin-card booking-editor">
      <div className="editor-head">
        <div>
          <small>{createMode ? "Новая запись" : booking?.id}</small>
          <h2>{createMode ? "Создание брони" : booking?.name}</h2>
          <p>{createMode ? "Новая бронь сразу попадет в график администратора." : `${booking?.team || "Без команды"} · ${booking?.phone}`}</p>
        </div>
        {!createMode && booking && <span className={`payment-badge ${booking.paymentStatus}`}>{booking.paymentStatus === "paid" ? "Оплачено" : booking.paymentStatus === "deposit" ? "Частично" : "Не оплачено"}</span>}
      </div>

      <form className="editor-form" onSubmit={(event) => void onSave(event)}>
        <div className="editor-grid">
          <label className="form-field">
            <span>Дата</span>
            <input type="date" value={editor.date} onChange={(event) => onChange({ ...editor, date: event.target.value })} />
          </label>
          <label className="form-field">
            <span>Время</span>
            <input type="time" step={1800} value={editor.time} onChange={(event) => onChange({ ...editor, time: event.target.value })} />
          </label>
          <label className="form-field">
            <span>Длительность</span>
            <select value={editor.duration} onChange={(event) => onChange({ ...editor, duration: Number(event.target.value) })}>
              {[60, 90, 120, 150, 180, 210, 240].map((value) => <option key={value} value={value}>{formatDuration(value)}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Формат</span>
            <select
              value={editor.format}
              onChange={(event) => {
                const format = event.target.value as FieldFormat;
                onChange({
                  ...editor,
                  format,
                  sector: SECTORS[format][0].id,
                  salePrice: String(calculateListPrice(fieldOptions, format, editor.duration)),
                });
              }}
            >
              {fieldOptions.map((item) => <option key={item.id} value={item.id}>{item.shortLabel}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Сектор</span>
            <select value={editor.sector} onChange={(event) => onChange({ ...editor, sector: event.target.value })}>
              {sectorOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Статус</span>
            <select value={editor.status} onChange={(event) => onChange({ ...editor, status: event.target.value as BookingRequest["status"] })}>
              <option value="confirmed">Подтверждена</option>
              <option value="in_progress">В работе</option>
              <option value="new">Новая</option>
              <option value="cancelled">Отменена</option>
            </select>
          </label>
          <label className="form-field">
            <span>Имя клиента</span>
            <input required value={editor.name} onChange={(event) => onChange({ ...editor, name: event.target.value })} />
          </label>
          <label className="form-field">
            <span>Телефон</span>
            <input required value={editor.phone} onChange={(event) => onChange({ ...editor, phone: event.target.value })} />
          </label>
          <label className="form-field editor-span-2">
            <span>Организация / команда</span>
            <input value={editor.team} onChange={(event) => onChange({ ...editor, team: event.target.value })} />
          </label>
          <label className="form-field">
            <span>Источник</span>
            <input value={editor.source} onChange={(event) => onChange({ ...editor, source: event.target.value })} />
          </label>
          <label className="form-field">
            <span>Деталь источника</span>
            <input value={editor.sourceDetail} onChange={(event) => onChange({ ...editor, sourceDetail: event.target.value })} />
          </label>
          <label className="form-field">
            <span>Стоимость по прайсу</span>
            <input disabled value={formatPrice(listPrice)} />
          </label>
          <label className="form-field">
            <span>Фактическая стоимость</span>
            <input type="number" min="0" value={editor.salePrice} onChange={(event) => onChange({ ...editor, salePrice: event.target.value })} />
          </label>
          <label className="form-field editor-span-2">
            <span>Комментарий</span>
            <textarea rows={4} value={editor.comment} onChange={(event) => onChange({ ...editor, comment: event.target.value })} />
          </label>
        </div>

        <div className="editor-totals">
          <div><span>Стоимость</span><strong>{formatPrice(Number(editor.salePrice) || listPrice)}</strong></div>
          <div><span>Оплачено</span><strong>{formatPrice(paymentTotal)}</strong></div>
          <div><span>Остаток</span><strong>{formatPrice(balance)}</strong></div>
        </div>

        <div className="editor-actions">
          {createMode ? (
            <>
              <button className="secondary-button" onClick={onCancelCreate} type="button">Отмена</button>
              <button className="primary-button" disabled={saving} type="submit"><Save size={16} /> Сохранить</button>
            </>
          ) : (
            <>
              <button className="danger-button" onClick={onDelete} type="button"><Trash2 size={16} /> В корзину</button>
              <button className="primary-button" disabled={saving} type="submit"><Save size={16} /> Сохранить</button>
            </>
          )}
        </div>
      </form>

      {!createMode && booking && (
        <section className="payments-section">
          <div className="payments-head">
            <h3>История оплат</h3>
            <small>Каждая оплата хранится отдельной записью</small>
          </div>
          <div className="payment-history">
            {booking.payments.length === 0 && <div className="empty-inline">Оплат пока нет</div>}
            {booking.payments.map((payment) => (
              <div className="payment-history-row" key={payment.id}>
                <strong>{formatPrice(payment.amount)}</strong>
                <span>{payment.date || "Без даты"}</span>
                <span>{payment.method}</span>
                <span>{payment.recipient}</span>
              </div>
            ))}
          </div>
          <form
            className="payment-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onAddPayment({
                amount: Number(paymentForm.amount) || 0,
                date: paymentForm.date,
                method: paymentForm.method,
                recipient: paymentForm.recipient,
              });
            }}
          >
            <div className="editor-grid">
              <label className="form-field">
                <span>Сумма</span>
                <input type="number" min="0" required value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} />
              </label>
              <label className="form-field">
                <span>Дата</span>
                <input type="date" required value={paymentForm.date} onChange={(event) => setPaymentForm({ ...paymentForm, date: event.target.value })} />
              </label>
              <label className="form-field">
                <span>Способ оплаты</span>
                <select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>
                  {paymentMethods.map((method) => <option key={method}>{method}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Получатель</span>
                <select value={paymentForm.recipient} onChange={(event) => setPaymentForm({ ...paymentForm, recipient: event.target.value })}>
                  {paymentRecipients.map((recipient) => <option key={recipient}>{recipient}</option>)}
                </select>
              </label>
            </div>
            <button className="secondary-button" disabled={saving} type="submit"><CircleDollarSign size={16} /> Добавить оплату</button>
          </form>
        </section>
      )}
    </aside>
  );
}

function RepeatPlanner({
  bookings,
  onComplete,
}: {
  bookings: BookingRequest[];
  onComplete: (message: string) => Promise<void>;
}) {
  const today = localDateValue();
  const [sourceFrom, setSourceFrom] = useState(today);
  const [sourceTo, setSourceTo] = useState(today);
  const [mode, setMode] = useState<"once" | "month" | "until">("once");
  const [targetStart, setTargetStart] = useState(addDays(today, 7));
  const [untilDate, setUntilDate] = useState(addDays(today, 28));
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState("");

  const sourceBookings = useMemo(
    () => bookings
      .filter((item) => item.status !== "deleted" && item.status !== "cancelled")
      .filter((item) => item.date >= sourceFrom && item.date <= sourceTo)
      .sort(bookingSort),
    [bookings, sourceFrom, sourceTo],
  );

  async function repeatSchedule(event: FormEvent) {
    event.preventDefault();
    if (sourceBookings.length === 0) {
      setResult("В выбранном исходном периоде нет активных броней.");
      return;
    }

    setWorking(true);
    let created = 0;
    const conflicts: string[] = [];
    const shifts: number[] = [];
    const baseShift = diffDays(sourceFrom, targetStart);

    if (mode === "once") {
      shifts.push(baseShift);
    } else if (mode === "month") {
      for (let index = 0; index < 4; index += 1) shifts.push(baseShift + index * 7);
    } else {
      for (let shift = baseShift; addDays(sourceTo, shift) <= untilDate; shift += 7) shifts.push(shift);
    }

    try {
      for (const shift of shifts) {
        for (const booking of sourceBookings) {
          const payload = {
            date: addDays(booking.date, shift),
            time: booking.time,
            duration: booking.duration,
            format: booking.format,
            sector: booking.sector,
            listPrice: booking.listPrice,
            salePrice: booking.salePrice,
            price: booking.salePrice,
            name: booking.name,
            phone: booking.phone,
            team: booking.team,
            source: "Повтор расписания",
            sourceDetail: `${booking.date} ${booking.time}`,
          };

          const response = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const result = await response.json();

          if (!response.ok) {
            conflicts.push(result.error || `${payload.date} ${payload.time}`);
            continue;
          }

          await fetch(`/api/bookings/${(result as BookingRequest).id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "confirmed",
              comment: `Повторено из ${booking.date} ${booking.time}`,
            }),
          });
          created += 1;
        }
      }

      const message = `Создано ${created} броней, конфликтов ${conflicts.length}.`;
      setResult(conflicts.length ? `${message} Конфликты: ${conflicts.slice(0, 5).join("; ")}` : message);
      await onComplete(message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="section-kicker">Повторение</div>
          <h1>Повторить расписание</h1>
          <p>Администратор может копировать день, неделю, месяц или продлевать график до даты.</p>
        </div>
      </div>
      <form className="admin-card repeat-card" onSubmit={(event) => void repeatSchedule(event)}>
        <div className="editor-grid">
          <label className="form-field">
            <span>Исходная дата с</span>
            <input type="date" value={sourceFrom} onChange={(event) => setSourceFrom(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Исходная дата по</span>
            <input type="date" value={sourceTo} onChange={(event) => setSourceTo(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Сценарий</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as "once" | "month" | "until")}>
              <option value="once">Скопировать период один раз</option>
              <option value="month">Повторить на месяц</option>
              <option value="until">Продлить до даты</option>
            </select>
          </label>
          <label className="form-field">
            <span>Начать с даты</span>
            <input type="date" value={targetStart} onChange={(event) => setTargetStart(event.target.value)} />
          </label>
          {mode === "until" && (
            <label className="form-field editor-span-2">
              <span>Повторять до даты</span>
              <input type="date" value={untilDate} onChange={(event) => setUntilDate(event.target.value)} />
            </label>
          )}
        </div>
        <div className="repeat-preview">
          <strong>Исходных броней: {sourceBookings.length}</strong>
          <small>Конфликты не сохраняются: система пропустит занятые слоты и покажет причину.</small>
        </div>
        {sourceBookings.length > 0 && (
          <div className="repeat-source-list">
            {sourceBookings.slice(0, 8).map((booking) => (
              <div className="repeat-source-row" key={booking.id}>
                <strong>{booking.date} · {booking.time}-{bookingEndTime(booking.time, booking.duration)}</strong>
                <span>{booking.name} · {formatLabel(booking.format)} · {booking.sector}</span>
              </div>
            ))}
          </div>
        )}
        {result && <div className={`admin-booking-message ${result.includes("Создано") ? "success" : ""}`}>{result}</div>}
        <button className="primary-button" disabled={working} type="submit">
          <CopyPlus size={16} /> {working ? "Копируем..." : "Повторить расписание"}
        </button>
      </form>
    </>
  );
}

type AnalyticsView = "overview" | "finance" | "utilization" | "clients" | "funnel" | "sources" | "operations";
type RangePreset = "7d" | "30d" | "month" | "quarter" | "year" | "all" | "custom";

type AnalyticsRow = {
  label: string;
  value: string;
  meta?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

function dateOnly(value: string) {
  return value ? value.slice(0, 10) : "";
}

function periodStartDate(today: string, preset: Exclude<RangePreset, "custom">) {
  const base = new Date(`${today}T00:00:00`);
  if (preset === "7d") {
    base.setDate(base.getDate() - 6);
    return base.toISOString().slice(0, 10);
  }
  if (preset === "30d") {
    base.setDate(base.getDate() - 29);
    return base.toISOString().slice(0, 10);
  }
  if (preset === "month") return today.slice(0, 8) + "01";
  if (preset === "quarter") {
    const quarterMonth = Math.floor(base.getMonth() / 3) * 3;
    return `${base.getFullYear()}-${String(quarterMonth + 1).padStart(2, "0")}-01`;
  }
  if (preset === "year") return `${base.getFullYear()}-01-01`;
  return "0000-01-01";
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function hours(value: number) {
  return `${value.toFixed(1)} ч.`;
}

function percentage(value: number) {
  return `${value.toFixed(1)}%`;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function between(value: string, from: string, to: string) {
  if (!value) return false;
  return value >= from && value <= to;
}

function daysBetween(from: string, to: string) {
  return Math.max(1, diffDays(from, to) + 1);
}

function dayStart(value: string) {
  return new Date(`${value}T00:00:00`).getTime();
}

function hoursBetween(fromIso: string, toIso: string) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return (to - from) / 3_600_000;
}

function occupiedUnits(booking: BookingRequest) {
  return booking.sector.split("+").filter(Boolean).length || (booking.format === "full" ? 4 : booking.format === "half" ? 2 : 1);
}

function AnalyticsDashboard({ bookings }: { bookings: BookingRequest[] }) {
  const today = localDateValue();
  const [view, setView] = useState<AnalyticsView>("overview");
  const [preset, setPreset] = useState<RangePreset>("month");
  const [customFrom, setCustomFrom] = useState(periodStartDate(today, "month"));
  const [customTo, setCustomTo] = useState(today);

  const range = useMemo(() => {
    if (preset === "custom") return { from: customFrom, to: customTo };
    return { from: periodStartDate(today, preset), to: today };
  }, [customFrom, customTo, preset, today]);

  const allActive = useMemo(
    () => bookings.filter((item) => item.status !== "deleted"),
    [bookings],
  );

  const byBookingDate = useMemo(
    () => allActive.filter((item) => between(item.date, range.from, range.to)),
    [allActive, range.from, range.to],
  );

  const byCreatedDate = useMemo(
    () => allActive.filter((item) => between(dateOnly(item.createdAt), range.from, range.to)),
    [allActive, range.from, range.to],
  );

  const activeBooked = useMemo(
    () => byBookingDate.filter((item) => item.status !== "cancelled"),
    [byBookingDate],
  );

  const confirmed = useMemo(
    () => byBookingDate.filter((item) => item.status === "confirmed"),
    [byBookingDate],
  );

  const cancelled = useMemo(
    () => byCreatedDate.filter((item) => item.status === "cancelled"),
    [byCreatedDate],
  );

  const periodDays = daysBetween(range.from, range.to);
  const fieldHours = activeBooked.reduce((sum, item) => sum + (item.duration / 60) * occupiedUnits(item), 0);
  const totalCapacityHours = periodDays * 24 * 4;
  const utilizationRate = totalCapacityHours > 0 ? (fieldHours / totalCapacityHours) * 100 : 0;
  const revenue = confirmed.reduce((sum, item) => sum + (Number(item.salePrice || item.price) || 0), 0);
  const paid = confirmed.reduce((sum, item) => sum + (Number(item.prepayment) || 0), 0);
  const debt = confirmed.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
  const averageCheck = confirmed.length ? revenue / confirmed.length : 0;
  const upcomingConfirmed = activeBooked.filter((item) => item.date >= today && item.status === "confirmed");
  const todayRevenue = confirmed.filter((item) => item.date === today).reduce((sum, item) => sum + item.salePrice, 0);
  const todayBookings = activeBooked.filter((item) => item.date === today).length;

  const clients = Array.from(activeBooked.reduce<Map<string, {
    phone: string;
    name: string;
    bookings: number;
    revenue: number;
    paid: number;
    debt: number;
    lastDate: string;
    sources: Set<string>;
    cancellations: number;
  }>>((map, item) => {
    const key = normalizePhone(item.phone) || item.id;
    const current = map.get(key) || {
      phone: item.phone,
      name: item.name,
      bookings: 0,
      revenue: 0,
      paid: 0,
      debt: 0,
      lastDate: item.date,
      sources: new Set<string>(),
      cancellations: 0,
    };
    current.bookings += item.status === "cancelled" ? 0 : 1;
    current.revenue += Number(item.salePrice || item.price) || 0;
    current.paid += Number(item.prepayment) || 0;
    current.debt += Number(item.balance) || 0;
    current.lastDate = current.lastDate > item.date ? current.lastDate : item.date;
    current.sources.add(item.source || "Сайт");
    if (item.status === "cancelled") current.cancellations += 1;
    map.set(key, current);
    return map;
  }, new Map()).values());

  const newClients = clients.filter((client) => client.bookings <= 1).length;
  const repeatClients = clients.filter((client) => client.bookings > 1).length;
  const dormantClients = clients.filter((client) => diffDays(client.lastDate, today) > 30);
  const topClients = [...clients]
    .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings)
    .slice(0, 8)
    .map((client) => ({
      label: client.name,
      value: formatPrice(client.revenue),
      meta: `${client.bookings} броней · ${client.phone}`,
    }));

  const sourceStats = Array.from(activeBooked.reduce<Map<string, {
    label: string;
    bookings: number;
    confirmed: number;
    revenue: number;
    clients: Set<string>;
  }>>((map, item) => {
    const key = item.source || "Сайт";
    const current = map.get(key) || { label: key, bookings: 0, confirmed: 0, revenue: 0, clients: new Set<string>() };
    current.bookings += 1;
    current.confirmed += item.status === "confirmed" ? 1 : 0;
    current.revenue += Number(item.salePrice || item.price) || 0;
    current.clients.add(normalizePhone(item.phone) || item.id);
    map.set(key, current);
    return map;
  }, new Map()).values()).sort((a, b) => b.revenue - a.revenue);

  const sourceRows: AnalyticsRow[] = sourceStats.map((source) => ({
    label: source.label,
    value: formatPrice(source.revenue),
    meta: `${source.bookings} броней · конверсия ${percentage(source.bookings ? (source.confirmed / source.bookings) * 100 : 0)} · ${source.clients.size} клиентов`,
  }));

  const financeRows: AnalyticsRow[] = Array.from(confirmed.reduce<Map<string, { revenue: number; paid: number; debt: number; bookings: number }>>((map, item) => {
    const key = item.date;
    const current = map.get(key) || { revenue: 0, paid: 0, debt: 0, bookings: 0 };
    current.revenue += Number(item.salePrice || item.price) || 0;
    current.paid += Number(item.prepayment) || 0;
    current.debt += Number(item.balance) || 0;
    current.bookings += 1;
    map.set(key, current);
    return map;
  }, new Map()).entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-10)
    .map(([date, item]) => ({
      label: date,
      value: formatPrice(item.revenue),
      meta: `${item.bookings} броней · оплачено ${formatPrice(item.paid)} · долг ${formatPrice(item.debt)}`,
    }));

  const recipientRows: AnalyticsRow[] = aggregateRows(confirmed, (item) => item.paymentRecipient || "Не указан", (item) => Number(item.prepayment) || 0, true);
  const methodRows: AnalyticsRow[] = aggregateRows(confirmed, (item) => item.paymentMethod || "Не выбран", (item) => Number(item.prepayment) || 0, true);
  const formatRows: AnalyticsRow[] = aggregateRows(confirmed, (item) => formatLabel(item.format), (item) => Number(item.salePrice || item.price) || 0, true);
  const sectorRows: AnalyticsRow[] = aggregateRows(activeBooked, (item) => item.sector, (item) => item.duration / 60, false, "ч.");
  const timeRows: AnalyticsRow[] = aggregateRows(activeBooked, (item) => item.time, (item) => item.duration / 60, false, "ч.");

  const funnelCreated = byCreatedDate.length;
  const funnelConfirmed = byCreatedDate.filter((item) => item.status === "confirmed").length;
  const funnelPaid = byCreatedDate.filter((item) => item.status === "confirmed" && item.paymentStatus === "paid").length;
  const funnelCancelled = byCreatedDate.filter((item) => item.status === "cancelled").length;
  const avgToPayment = average(
    byCreatedDate
      .map((item) => {
        const firstPayment = [...item.payments].sort((a, b) => a.date.localeCompare(b.date))[0];
        if (!firstPayment?.date) return null;
        return hoursBetween(item.createdAt, `${firstPayment.date}T00:00:00`);
      })
      .filter((value): value is number => value != null),
  );
  const avgToConfirm = average(
    byCreatedDate
      .map((item) => item.confirmedAt ? hoursBetween(item.createdAt, item.confirmedAt) : null)
      .filter((value): value is number => value != null),
  );

  const overdueRows: AnalyticsRow[] = confirmed
    .filter((item) => item.balance > 0 && item.date < today)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 8)
    .map((item) => ({
      label: item.name,
      value: formatPrice(item.balance),
      meta: `${item.date} · ${item.phone} · ${formatLabel(item.format)}`,
      tone: "danger",
    }));

  const discountRows: AnalyticsRow[] = confirmed
    .filter((item) => item.salePrice < item.listPrice)
    .sort((a, b) => (b.listPrice - b.salePrice) - (a.listPrice - a.salePrice))
    .slice(0, 8)
    .map((item) => ({
      label: item.name,
      value: formatPrice(item.listPrice - item.salePrice),
      meta: `${item.date} · прайс ${formatPrice(item.listPrice)} -> факт ${formatPrice(item.salePrice)}`,
      tone: "warning",
    }));

  const partialUpcomingRows: AnalyticsRow[] = activeBooked
    .filter((item) => item.date >= today && diffDays(today, item.date) <= 3 && item.balance > 0)
    .sort(bookingSort)
    .slice(0, 8)
    .map((item) => ({
      label: `${item.name} · ${item.date}`,
      value: formatPrice(item.balance),
      meta: `${item.time}-${bookingEndTime(item.time, item.duration)} · ${item.paymentStatus}`,
      tone: "warning",
    }));

  const backdatedRows: AnalyticsRow[] = byCreatedDate
    .filter((item) => dateOnly(item.createdAt) > item.date)
    .slice(0, 8)
    .map((item) => ({
      label: item.name,
      value: `${item.date}`,
      meta: `Создано ${dateOnly(item.createdAt)} · ${item.time}`,
      tone: "neutral",
    }));

  const noCommentCount = confirmed.filter((item) => !item.comment.trim()).length;
  const frequentCancelCount = bookings.reduce<Map<string, number>>((map, item) => {
    if (item.status !== "cancelled") return map;
    const key = normalizePhone(item.phone) || item.id;
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());
  const frequentCancelRows: AnalyticsRow[] = Array.from(frequentCancelCount.entries())
    .filter(([, count]) => count > 1)
    .slice(0, 8)
    .map(([phoneKey, count]) => {
      const booking = bookings.find((item) => normalizePhone(item.phone) === phoneKey);
      return {
        label: booking?.name || phoneKey,
        value: `${count} отмен`,
        meta: booking?.phone || "",
        tone: "danger",
      };
    });

  const overviewCards = [
    { label: "Выручка сегодня", value: formatPrice(todayRevenue), hint: `${todayBookings} броней сегодня` },
    { label: "Выручка периода", value: formatPrice(revenue), hint: `${confirmed.length} подтвержденных` },
    { label: "Оплачено", value: formatPrice(paid), hint: "Фактические поступления" },
    { label: "Долг", value: formatPrice(debt), hint: `${overdueRows.length} просроченных` },
    { label: "Загрузка", value: percentage(utilizationRate), hint: `${hours(fieldHours)} из ${hours(totalCapacityHours)}` },
    { label: "Средний чек", value: formatPrice(averageCheck), hint: "По подтвержденным броням" },
    { label: "Новые заявки", value: String(byCreatedDate.filter((item) => item.status === "new").length), hint: "Созданы в периоде" },
    { label: "Конверсия", value: percentage(funnelCreated ? (funnelConfirmed / funnelCreated) * 100 : 0), hint: "Из заявки в подтверждение" },
    { label: "Повторные клиенты", value: String(repeatClients), hint: `${newClients} новых` },
    { label: "Топ источник", value: sourceStats[0]?.label || "Нет данных", hint: sourceStats[0] ? formatPrice(sourceStats[0].revenue) : "Пока пусто" },
  ];

  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="section-kicker">BI внутри админки</div>
          <h1>Аналитика</h1>
          <p>Сводка, финансы, загрузка, клиенты, воронка, источники и операционный контроль без внешних BI-сервисов.</p>
        </div>
      </div>

      <section className="admin-card analytics-filter-card">
        <div className="analytics-toolbar">
          <div className="analytics-tabs">
            {[
              ["overview", "Сводка"],
              ["finance", "Финансы"],
              ["utilization", "Загрузка"],
              ["clients", "Клиенты"],
              ["funnel", "Воронка"],
              ["sources", "Источники"],
              ["operations", "Контроль"],
            ].map(([id, label]) => (
              <button
                className={view === id ? "active" : ""}
                key={id}
                onClick={() => setView(id as AnalyticsView)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="analytics-range">
            <select value={preset} onChange={(event) => setPreset(event.target.value as RangePreset)}>
              <option value="7d">7 дней</option>
              <option value="30d">30 дней</option>
              <option value="month">Месяц</option>
              <option value="quarter">Квартал</option>
              <option value="year">Год</option>
              <option value="all">Все время</option>
              <option value="custom">Свой период</option>
            </select>
            {preset === "custom" && (
              <>
                <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
                <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
              </>
            )}
            <span>{range.from} - {range.to}</span>
          </div>
        </div>
      </section>

      {view === "overview" && (
        <>
          <div className="analytics-grid analytics-grid-wide">
            {overviewCards.map((card) => (
              <AnalyticsStatCard key={card.label} label={card.label} value={card.value} hint={card.hint} />
            ))}
          </div>
          <div className="analytics-tables analytics-tables-wide">
            <AnalyticsListCard title="Финансы по дням" rows={financeRows} />
            <AnalyticsListCard title="Топ клиенты" rows={topClients} />
            <AnalyticsListCard title="Топ источники" rows={sourceRows.slice(0, 8)} />
          </div>
        </>
      )}

      {view === "finance" && (
        <>
          <div className="analytics-grid analytics-grid-wide">
            <AnalyticsStatCard label="Плановая выручка" value={formatPrice(revenue)} hint="Подтвержденные брони периода" />
            <AnalyticsStatCard label="Фактически оплачено" value={formatPrice(paid)} hint="Сумма всех оплат" />
            <AnalyticsStatCard label="Остаток долга" value={formatPrice(debt)} hint={`${overdueRows.length} просроченных броней`} />
            <AnalyticsStatCard label="Средний чек" value={formatPrice(averageCheck)} hint="По подтвержденным" />
          </div>
          <div className="analytics-tables analytics-tables-wide">
            <AnalyticsListCard title="Поступления по способам оплаты" rows={methodRows} />
            <AnalyticsListCard title="Поступления по получателям" rows={recipientRows} />
            <AnalyticsListCard title="Скидки ниже прайса" rows={discountRows} />
            <AnalyticsListCard title="Долги клиентов" rows={overdueRows} />
          </div>
        </>
      )}

      {view === "utilization" && (
        <>
          <div className="analytics-grid analytics-grid-wide">
            <AnalyticsStatCard label="Занято field-hours" value={hours(fieldHours)} hint="С учетом четвертей поля" />
            <AnalyticsStatCard label="Емкость периода" value={hours(totalCapacityHours)} hint={`${periodDays} дней по 4 сектора`} />
            <AnalyticsStatCard label="Загрузка объекта" value={percentage(utilizationRate)} hint="От полной емкости" />
            <AnalyticsStatCard label="Ближайшие подтвержденные" value={String(upcomingConfirmed.length)} hint="Будущие активные игры" />
          </div>
          <div className="analytics-tables analytics-tables-wide">
            <AnalyticsListCard title="Загрузка по форматам" rows={formatRows} />
            <AnalyticsListCard title="Загрузка по секторам" rows={sectorRows} />
            <AnalyticsListCard title="Пиковые часы" rows={timeRows.slice(0, 10)} />
          </div>
        </>
      )}

      {view === "clients" && (
        <>
          <div className="analytics-grid analytics-grid-wide">
            <AnalyticsStatCard label="Клиентов в периоде" value={String(clients.length)} hint="Уникальные телефоны" />
            <AnalyticsStatCard label="Новые" value={String(newClients)} hint="1 бронь за период" />
            <AnalyticsStatCard label="Повторные" value={String(repeatClients)} hint="2+ брони за период" />
            <AnalyticsStatCard label="Не возвращались 30+ дней" value={String(dormantClients.length)} hint="Риск оттока" />
          </div>
          <div className="analytics-tables analytics-tables-wide">
            <AnalyticsListCard title="Топ клиенты по выручке" rows={topClients} />
            <AnalyticsListCard
              title="Клиенты с долгами"
              rows={clients.filter((client) => client.debt > 0).sort((a, b) => b.debt - a.debt).slice(0, 8).map((client) => ({
                label: client.name,
                value: formatPrice(client.debt),
                meta: `${client.bookings} броней · ${client.phone}`,
              }))}
            />
          </div>
        </>
      )}

      {view === "funnel" && (
        <>
          <div className="analytics-grid analytics-grid-wide">
            <AnalyticsStatCard label="Новые заявки" value={String(funnelCreated)} hint="Созданы в периоде" />
            <AnalyticsStatCard label="Подтверждено" value={String(funnelConfirmed)} hint={percentage(funnelCreated ? (funnelConfirmed / funnelCreated) * 100 : 0)} />
            <AnalyticsStatCard label="Полностью оплачено" value={String(funnelPaid)} hint={percentage(funnelConfirmed ? (funnelPaid / funnelConfirmed) * 100 : 0)} />
            <AnalyticsStatCard label="Отменено" value={String(funnelCancelled)} hint="По статусу заявок" />
            <AnalyticsStatCard label="До подтверждения" value={avgToConfirm ? hours(avgToConfirm) : "Нет данных"} hint="Среднее время реакции" />
            <AnalyticsStatCard label="До первой оплаты" value={avgToPayment ? hours(avgToPayment) : "Нет данных"} hint="От заявки до денег" />
          </div>
          <div className="analytics-tables">
            <AnalyticsListCard
              title="Статусы заявок"
              rows={[
                { label: "Новые", value: String(byCreatedDate.filter((item) => item.status === "new").length), meta: "Ожидают обработки" },
                { label: "В работе", value: String(byCreatedDate.filter((item) => item.status === "in_progress").length), meta: "На контроле администратора" },
                { label: "Подтвержденные", value: String(byCreatedDate.filter((item) => item.status === "confirmed").length), meta: "Успешно проведены" },
                { label: "Отмененные", value: String(cancelled.length), meta: "Не дошли до игры" },
              ]}
            />
          </div>
        </>
      )}

      {view === "sources" && (
        <>
          <div className="analytics-grid analytics-grid-wide">
            <AnalyticsStatCard label="Источников" value={String(sourceStats.length)} hint="Активные каналы периода" />
            <AnalyticsStatCard label="Топ по выручке" value={sourceStats[0]?.label || "Нет данных"} hint={sourceStats[0] ? formatPrice(sourceStats[0].revenue) : ""} />
            <AnalyticsStatCard label="Топ по конверсии" value={bestConversion(sourceStats)?.label || "Нет данных"} hint={bestConversion(sourceStats) ? percentage(bestConversion(sourceStats)!.bookings ? (bestConversion(sourceStats)!.confirmed / bestConversion(sourceStats)!.bookings) * 100 : 0) : ""} />
          </div>
          <div className="analytics-tables analytics-tables-wide">
            <AnalyticsListCard title="Источники по выручке" rows={sourceRows} />
            <AnalyticsListCard
              title="Метки источников"
              rows={aggregateRows(activeBooked, (item) => item.sourceDetail || "Без метки", (item) => Number(item.salePrice || item.price) || 0, true)}
            />
          </div>
        </>
      )}

      {view === "operations" && (
        <>
          <div className="analytics-grid analytics-grid-wide">
            <AnalyticsStatCard label="Просроченные долги" value={String(overdueRows.length)} hint="Нужен контакт с клиентами" />
            <AnalyticsStatCard label="Без комментария" value={String(noCommentCount)} hint="Не хватает контекста для админа" />
            <AnalyticsStatCard label="Частичные оплаты 3 дня" value={String(partialUpcomingRows.length)} hint="Нужно дожать оплату" />
            <AnalyticsStatCard label="Частые отмены" value={String(frequentCancelRows.length)} hint="Клиенты с 2+ отменами" />
            <AnalyticsStatCard label="Задним числом" value={String(backdatedRows.length)} hint="Брони созданы после даты игры" />
          </div>
          <div className="analytics-tables analytics-tables-wide">
            <AnalyticsListCard title="Просроченные долги" rows={overdueRows} />
            <AnalyticsListCard title="Частично оплаченные ближайшие брони" rows={partialUpcomingRows} />
            <AnalyticsListCard title="Частые отмены" rows={frequentCancelRows} />
            <AnalyticsListCard title="Брони задним числом" rows={backdatedRows} />
          </div>
        </>
      )}
    </>
  );
}

function AnalyticsStatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="admin-card analytics-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function AnalyticsListCard({ title, rows }: { title: string; rows: AnalyticsRow[] }) {
  return (
    <section className="admin-card analytics-table">
      <div className="analytics-table-head">
        <h2>{title}</h2>
        <span>{rows.length} строк</span>
      </div>
      {rows.length === 0 && <div className="empty-state">Данных пока нет</div>}
      {rows.map((row) => (
        <div className={`analytics-row analytics-row-${row.tone || "neutral"}`} key={`${title}-${row.label}-${row.value}`}>
          <div>
            <strong>{row.label}</strong>
            {row.meta && <small>{row.meta}</small>}
          </div>
          <span>{row.value}</span>
        </div>
      ))}
    </section>
  );
}

function aggregateRows(
  items: BookingRequest[],
  label: (item: BookingRequest) => string,
  metric: (item: BookingRequest) => number,
  asMoney = false,
  suffix = "",
) {
  const rows = items.reduce<Map<string, { label: string; value: number; count: number }>>((map, item) => {
    const key = label(item) || "Не указано";
    const current = map.get(key) || { label: key, value: 0, count: 0 };
    current.value += metric(item);
    current.count += 1;
    map.set(key, current);
    return map;
  }, new Map());

  return Array.from(rows.values())
    .sort((a, b) => b.value - a.value)
    .map((row) => ({
      label: row.label,
      value: asMoney ? formatPrice(row.value) : `${row.value.toFixed(1)}${suffix ? ` ${suffix}` : ""}`.trim(),
      meta: `${row.count} записей`,
    }));
}

function bestConversion<T extends { bookings: number; confirmed: number }>(items: T[]) {
  return [...items]
    .filter((item) => item.bookings > 0)
    .sort((a, b) => (b.confirmed / b.bookings) - (a.confirmed / a.bookings))[0];
}

function PriceSettings({
  fieldOptions,
  onChange,
}: {
  fieldOptions: FieldOption[];
  onChange: (value: FieldOption[]) => void;
}) {
  const [prices, setPrices] = useState<Record<FieldFormat, string>>({
    quarter: String(fieldOptions.find((item) => item.id === "quarter")?.price || 0),
    half: String(fieldOptions.find((item) => item.id === "half")?.price || 0),
    full: String(fieldOptions.find((item) => item.id === "full")?.price || 0),
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setPrices({
      quarter: String(fieldOptions.find((item) => item.id === "quarter")?.price || 0),
      half: String(fieldOptions.find((item) => item.id === "half")?.price || 0),
      full: String(fieldOptions.find((item) => item.id === "full")?.price || 0),
    });
  }, [fieldOptions]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const nextPrices = {
      quarter: Number(prices.quarter) || 0,
      half: Number(prices.half) || 0,
      full: Number(prices.full) || 0,
    };
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prices: nextPrices }),
    });
    const result = await response.json();
    if (response.ok) {
      onChange(fieldOptions.map((item) => ({ ...item, price: result.prices[item.id] ?? item.price })));
      setMessage("Цены сохранены");
    } else {
      setMessage(result.error || "Не удалось сохранить цены");
    }
    setSaving(false);
  }

  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="section-kicker">Настройки</div>
          <h1>Прайс</h1>
          <p>Почасовые цены используются в форме, графике и при автоподсчете стоимости.</p>
        </div>
      </div>
      <form className="admin-card repeat-card" onSubmit={(event) => void save(event)}>
        <div className="editor-grid">
          {fieldOptions.map((option) => (
            <label className="form-field" key={option.id}>
              <span>{option.shortLabel}</span>
              <input type="number" min="0" value={prices[option.id]} onChange={(event) => setPrices({ ...prices, [option.id]: event.target.value })} />
            </label>
          ))}
        </div>
        {message && <div className={`admin-booking-message ${message === "Цены сохранены" ? "success" : ""}`}>{message}</div>}
        <button className="primary-button" disabled={saving} type="submit">
          <CircleDollarSign size={16} /> {saving ? "Сохраняем..." : "Сохранить цены"}
        </button>
      </form>
    </>
  );
}
