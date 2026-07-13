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

function AnalyticsDashboard({ bookings }: { bookings: BookingRequest[] }) {
  const active = bookings.filter((item) => item.status !== "cancelled" && item.status !== "deleted");
  const revenue = active.reduce((sum, item) => sum + (Number(item.salePrice || item.price) || 0), 0);
  const paid = active.reduce((sum, item) => sum + (Number(item.prepayment) || 0), 0);
  const debt = active.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
  const hours = active.reduce((sum, item) => sum + item.duration / 60, 0);
  const byFormat = groupStats(active, (item) => formatLabel(item.format), "salePrice");
  const bySource = groupStats(active, (item) => item.source || "Не указано", "count");
  const byStatus = groupStats(active, (item) => item.paymentStatus, "count");

  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="section-kicker">Отчеты</div>
          <h1>Аналитика</h1>
          <p>Сводка по активным и подтвержденным броням.</p>
        </div>
      </div>
      <div className="analytics-grid">
        <AnalyticsCard label="Выручка" value={formatPrice(revenue)} hint="Плановая сумма броней" />
        <AnalyticsCard label="Оплачено" value={formatPrice(paid)} hint="По истории оплат" />
        <AnalyticsCard label="Остаток" value={formatPrice(debt)} hint="К оплате" />
        <AnalyticsCard label="Часы" value={`${hours.toFixed(1)} ч.`} hint="Общая загрузка" />
      </div>
      <div className="analytics-tables">
        <AnalyticsTable title="Форматы поля" rows={byFormat} money />
        <AnalyticsTable title="Источники" rows={bySource} />
        <AnalyticsTable title="Статусы оплаты" rows={byStatus} />
      </div>
    </>
  );
}

function AnalyticsCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="admin-card analytics-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function AnalyticsTable({
  title,
  rows,
  money = false,
}: {
  title: string;
  rows: Array<{ label: string; count: number; value: number }>;
  money?: boolean;
}) {
  return (
    <section className="admin-card analytics-table">
      <div className="analytics-table-head">
        <h2>{title}</h2>
        <span>{money ? "Сумма" : "Количество"}</span>
      </div>
      {rows.map((row) => (
        <div className="analytics-row" key={row.label}>
          <div>
            <strong>{row.label}</strong>
            <small>{row.count} записей</small>
          </div>
          <span>{money ? formatPrice(row.value) : row.value}</span>
        </div>
      ))}
      {rows.length === 0 && <div className="empty-state">Данных пока нет</div>}
    </section>
  );
}

function groupStats(
  items: BookingRequest[],
  label: (item: BookingRequest) => string,
  field: "count" | "salePrice",
) {
  const rows = items.reduce<Map<string, { label: string; count: number; value: number }>>((map, item) => {
    const key = label(item);
    const current = map.get(key) || { label: key, count: 0, value: 0 };
    current.count += 1;
    current.value += field === "salePrice" ? Number(item.salePrice || item.price) || 0 : 1;
    map.set(key, current);
    return map;
  }, new Map());
  return Array.from(rows.values()).sort((a, b) => b.value - a.value);
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
