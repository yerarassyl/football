"use client";

import {
  BarChart3,
  Calendar,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleDollarSign,
  LogOut,
  Repeat,
  Search,
  Trash2,
  Trophy,
  UsersRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DURATION_OPTIONS, FIELD_OPTIONS, FieldOption, formatPrice, SECTORS, TIME_SLOTS, PAYMENT_METHODS, PAYMENT_RECIPIENTS } from "@/lib/constants";
import { BookingRequest, BookingInput, FieldFormat, PaymentStatus, RequestStatus } from "@/lib/types";
import { bookingEndTime, bookingSlots, formatDuration } from "@/lib/time";
import CalendarPicker from "./CalendarPicker";
import ScheduleView from "./ScheduleView";
import BookingEditModal from "./BookingEditModal";
import RepeatSchedule from "./RepeatSchedule";

type Tab = "schedule" | "requests" | "confirmed" | "repeat" | "trash" | "analytics" | "settings";

const statusLabel: Record<RequestStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  confirmed: "Подтверждена",
  cancelled: "Отменена",
  deleted: "В корзине",
};

const paymentLabel: Record<PaymentStatus, string> = {
  unpaid: "Не оплачено",
  deposit: "Частично оплачено",
  paid: "Полностью оплачено",
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function createdDateLabel(value: string) {
  const created = new Date(value || Date.now());
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dateKey(created) === dateKey(today)) return "Сегодня";
  if (dateKey(created) === dateKey(yesterday)) return "Вчера";
  return created.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function groupRequestsByCreatedDate(items: BookingRequest[]) {
  const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sorted.reduce<Array<{ label: string; items: BookingRequest[] }>>((groups, item) => {
    const label = createdDateLabel(item.createdAt);
    const current = groups.find((group) => group.label === label);
    if (current) current.items.push(item);
    else groups.push({ label, items: [item] });
    return groups;
  }, []);
}

function actionNotice(patch: Partial<BookingRequest>) {
  if (patch.status === "confirmed") return "Бронь подтверждена";
  if (patch.status === "in_progress") return "Заявка переведена в работу";
  if (patch.status === "cancelled") return "Бронь отменена";
  if (patch.status === "deleted") return "Заявка удалена в корзину";
  if (patch.status === "new" && patch.deletedAt === "") return "Заявка восстановлена";
  return "Изменения сохранены";
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("schedule");
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>(FIELD_OPTIONS);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [editingBooking, setEditingBooking] = useState<BookingRequest | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  function showNotice(type: "success" | "error", text: string) {
    setNotice({ type, text });
    window.setTimeout(() => {
      setNotice((current) => (current?.text === text ? null : current));
    }, 2600);
  }

  async function load() {
    const response = await fetch("/api/bookings");
    if (response.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    setRequests(await response.json());
    setLoading(false);
  }

  async function loadSettings() {
    const response = await fetch("/api/settings", { cache: "no-store" });
    const settings = await response.json();
    setFieldOptions((options) =>
      options.map((item) => ({
        ...item,
        price: settings.prices?.[item.id] ?? item.price,
      })),
    );
  }

  useEffect(() => {
    load();
    loadSettings().catch(() => undefined);
  }, []);

  const selected = requests.find((item) => item.id === selectedId);

  const filtered = useMemo(() => {
    const value = query.toLowerCase();
    const byTab = requests.filter((item) => {
      if (tab === "confirmed") return item.status === "confirmed";
      if (tab === "trash") return item.status === "deleted";
      if (tab === "schedule") return item.status !== "cancelled" && item.status !== "deleted";
      return item.status !== "confirmed" && item.status !== "deleted";
    });
    return byTab.filter((item) =>
      [item.id, item.name, item.phone, item.team, item.source, item.sourceDetail]
        .join(" ")
        .toLowerCase()
        .includes(value),
    );
  }, [query, requests, tab]);

  const groupedFiltered = useMemo(() => groupRequestsByCreatedDate(filtered), [filtered]);

  async function update(id: string, patch: Partial<BookingRequest>) {
    const previous = requests;
    setRequests((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    const response = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (response.ok) {
      const updated = await response.json();
      setRequests((items) => items.map((item) => (item.id === id ? updated : item)));
      showNotice("success", actionNotice(patch));
    } else {
      setRequests(previous);
      showNotice("error", "Не удалось сохранить изменения");
    }
  }

  async function addPayment(bookingId: string, payment: { amount: number; date: string; method: string; recipient: string }) {
    const response = await fetch(`/api/bookings/${bookingId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payment),
    });
    if (response.ok) {
      const updated = await response.json();
      setRequests((items) => items.map((item) => (item.id === bookingId ? updated : item)));
      if (editingBooking?.id === bookingId) setEditingBooking(updated);
      showNotice("success", "Оплата добавлена");
    } else {
      showNotice("error", "Не удалось добавить оплату");
    }
  }

  async function deletePayment(bookingId: string, paymentId: string) {
    const response = await fetch(`/api/bookings/${bookingId}/payments?paymentId=${paymentId}`, {
      method: "DELETE",
    });
    if (response.ok) {
      const updated = await response.json();
      setRequests((items) => items.map((item) => (item.id === bookingId ? updated : item)));
      if (editingBooking?.id === bookingId) setEditingBooking(updated);
      showNotice("success", "Оплата удалена");
    } else {
      showNotice("error", "Не удалось удалить оплату");
    }
  }

  async function handleCreateBooking(input: Partial<BookingInput>) {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (response.ok) {
      const created = await response.json();
      await fetch(`/api/bookings/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" }),
      });
      await load();
      setShowCreateModal(false);
      showNotice("success", "Бронь создана");
    } else {
      const result = await response.json();
      showNotice("error", result.error || "Не удалось создать бронь");
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
            <Calendar size={18} /> График
          </button>
          <button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>
            <UsersRound size={18} /> Заявки <span>{requests.filter((item) => item.status !== "confirmed" && item.status !== "deleted").length}</span>
          </button>
          <button className={tab === "confirmed" ? "active" : ""} onClick={() => setTab("confirmed")}>
            <Check size={18} /> Подтвержденные <span>{requests.filter((item) => item.status === "confirmed").length}</span>
          </button>
          <button className={tab === "repeat" ? "active" : ""} onClick={() => setTab("repeat")}>
            <Repeat size={18} /> Расписание
          </button>
          <button className={tab === "trash" ? "active" : ""} onClick={() => setTab("trash")}>
            <Trash2 size={18} /> Корзина <span>{requests.filter((item) => item.status === "deleted").length}</span>
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
          <ScheduleView
            bookings={requests}
            fieldOptions={fieldOptions}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onSelectBooking={(id) => {
              const booking = requests.find((b) => b.id === id);
              if (booking) setEditingBooking(booking);
            }}
            onDeleteBooking={(id) => update(id, { status: "deleted", deletedAt: new Date().toISOString() })}
            onAddBooking={() => setShowCreateModal(true)}
          />
        )}

        {(tab === "requests" || tab === "confirmed" || tab === "trash") && (
          <>
            <div className="admin-heading">
              <div>
                <div className="section-kicker">Управление</div>
                <h1>{tab === "confirmed" ? "Подтвержденные брони" : tab === "trash" ? "Корзина заявок" : "Заявки клиентов"}</h1>
                <p>{tab === "trash" ? "Удаленные заявки сохраняются для истории и аналитики." : "Проверьте детали, оплату и подтвердите бронь."}</p>
              </div>
              <div className="stat-chip"><CircleDollarSign size={18} /><span>Всего</span><strong>{filtered.length} записей</strong></div>
            </div>
            <div className="admin-content-grid">
              <section className="admin-card requests-card">
                <div className="toolbar">
                  <div className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по имени, телефону..." /></div>
                </div>
                <div className="request-list">
                  {loading ? (
                    <div className="empty-state">Загружаем заявки...</div>
                  ) : (
                    groupedFiltered.map((group) => (
                      <div className="request-date-group" key={group.label}>
                        <div className="request-date-group-title">{group.label}</div>
                        {group.items.map((item) => (
                          <div className={`request-row ${selectedId === item.id ? "selected" : ""}`} key={item.id}>
                            <span className={`status-dot ${item.status}`} />
                            <button className="request-open-button" onClick={() => setSelectedId(item.id)} type="button">
                              <span className="request-person">
                                <strong>{item.name}</strong>
                                <small>{item.team || "Без команды"} · {item.phone}</small>
                              </span>
                              <span className="request-date">
                                <strong>{item.date.slice(5).split("-").reverse().join(".")}</strong>
                                <small>{item.time} · {fieldOptions.find((field) => field.id === item.format)?.shortLabel}</small>
                              </span>
                              <span className={`payment-badge ${item.paymentStatus}`}>{paymentLabel[item.paymentStatus]}</span>
                              <ChevronRight size={16} />
                            </button>
                            <button
                              aria-label={tab === "trash" ? `Восстановить заявку ${item.id}` : `Удалить заявку ${item.id}`}
                              className="request-delete-button"
                              onClick={() => update(item.id, tab === "trash" ? { status: "new", deletedAt: "" } : { status: "deleted", deletedAt: new Date().toISOString() })}
                              type="button"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                  {!loading && filtered.length === 0 && <div className="empty-state">Записей пока нет</div>}
                </div>
              </section>
              <RequestDetailsPanel selected={selected} update={update} fieldOptions={fieldOptions} mode={tab} addPayment={addPayment} deletePayment={deletePayment} />
            </div>
          </>
        )}

        {tab === "repeat" && (
          <RepeatSchedule bookings={requests} fieldOptions={fieldOptions} onCreated={load} />
        )}

        {tab === "settings" && (
          <PriceSettings fieldOptions={fieldOptions} onChange={setFieldOptions} />
        )}

        {tab === "analytics" && (
          <AnalyticsDashboard requests={requests} />
        )}
      </main>

      {(editingBooking || showCreateModal) && (
        <BookingEditModal
          booking={editingBooking}
          fieldOptions={fieldOptions}
          allBookings={requests}
          onClose={() => { setEditingBooking(null); setShowCreateModal(false); }}
          onSave={async (id, patch) => { await update(id, patch); setEditingBooking(null); }}
          onDelete={(id) => { update(id, { status: "deleted", deletedAt: new Date().toISOString() }); setEditingBooking(null); }}
          onAddPayment={addPayment}
          onDeletePayment={deletePayment}
          onCreate={handleCreateBooking}
          isCreateMode={showCreateModal}
          defaultDate={selectedDate}
        />
      )}
    </div>
  );
}

function RequestDetailsPanel({
  selected,
  update,
  fieldOptions,
  mode,
  addPayment,
  deletePayment,
}: {
  selected?: BookingRequest;
  update: (id: string, patch: Partial<BookingRequest>) => Promise<void>;
  fieldOptions: FieldOption[];
  mode: Tab;
  addPayment: (bookingId: string, payment: { amount: number; date: string; method: string; recipient: string }) => Promise<void>;
  deletePayment: (bookingId: string, paymentId: string) => Promise<void>;
}) {
  const [prepayment, setPrepayment] = useState("");
  const [salePricePerHour, setSalePricePerHour] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("unpaid");
  const [paymentMethod, setPaymentMethod] = useState("Не выбран");
  const [paymentRecipient, setPaymentRecipient] = useState("Не выбран");
  const [paidAt, setPaidAt] = useState("");
  const [comment, setComment] = useState("");

  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState("Не выбран");
  const [payRecipient, setPayRecipient] = useState("Не выбран");

  useEffect(() => {
    if (!selected) return;
    const hours = Math.max(1, selected.duration / 60);
    setPrepayment(selected.prepayment ? String(selected.prepayment) : "");
    setSalePricePerHour(String(Math.round((selected.salePrice || selected.price || 0) / hours)));
    setPaymentStatus(selected.paymentStatus);
    setPaymentMethod(selected.payments?.[0]?.method || "Не выбран");
    setPaymentRecipient(selected.payments?.[0]?.recipient || "Не выбран");
    setPaidAt(selected.payments?.[0]?.date || "");
    setComment(selected.comment);
    setPayAmount("");
    setPayMethod("Не выбран");
    setPayRecipient("Не выбран");
    setPayDate(new Date().toISOString().slice(0, 10));
  }, [selected]);

  if (!selected) {
    return (
      <aside className="admin-card details-card empty-details">
        <UsersRound size={30} />
        <strong>Выберите заявку</strong>
        <span>Здесь появятся детали клиента и оплаты</span>
      </aside>
    );
  }

  const selectedHours = Math.max(1, selected.duration / 60);
  const numericSalePricePerHour = Number(salePricePerHour) || 0;
  const numericSalePrice = Math.round(numericSalePricePerHour * selectedHours);
  const totalPaid = (selected.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  const balance = Math.max(0, numericSalePrice - totalPaid);
  const listPricePerHour = Math.round((selected.listPrice || selected.price) / selectedHours);

  const financePatch = {
    salePrice: numericSalePrice,
    price: numericSalePrice,
    prepayment: totalPaid,
    balance,
    paymentStatus,
    comment,
  };

  return (
    <aside className="admin-card details-card">
      <div className="details-head">
        <div>
          <small>{selected.id}</small>
          <h2>{selected.name}</h2>
          <p>{selected.team || "Без команды"} · {selected.phone}</p>
        </div>
        <span className={`status-label ${selected.status}`}>{statusLabel[selected.status]}</span>
      </div>
      <div className="booking-facts">
        <div><span>Дата и время</span><strong>{selected.date} · {selected.time}–{bookingEndTime(selected.time, selected.duration)}</strong></div>
        <div><span>Формат</span><strong>{fieldOptions.find((item) => item.id === selected.format)?.shortLabel}, сектор {selected.sector}</strong></div>
        <div><span>Цена по прайсу</span><strong>{formatPrice(selected.listPrice || selected.price)}</strong></div>
        <div><span>Фактическая цена</span><strong>{formatPrice(selected.salePrice || selected.price)}</strong></div>
        <div><span>Оплачено</span><strong>{formatPrice(totalPaid)}</strong></div>
        <div><span>Остаток</span><strong>{formatPrice(balance)}</strong></div>
      </div>

      <div className="details-form">
        <h3>Оплата и комментарий</h3>
        <div className="form-field">
          <label>Индивидуальная стоимость за час</label>
          <input min="0" type="number" value={salePricePerHour} onFocus={() => salePricePerHour === "0" && setSalePricePerHour("")} onChange={(event) => setSalePricePerHour(event.target.value)} />
          <small>Прайс: {formatPrice(listPricePerHour)} / час. Итого: {formatPrice(numericSalePrice)}</small>
        </div>
        <div className="form-field">
          <label>Статус оплаты</label>
          <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}>
            <option value="unpaid">Не оплачено</option>
            <option value="deposit">Частично оплачено</option>
            <option value="paid">Полностью оплачено</option>
          </select>
        </div>
        <div className="form-field"><label>Комментарий</label><textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} /></div>
      </div>

      {(selected.payments || []).length > 0 && (
        <div className="payment-history-section">
          <h3>История оплат</h3>
          {selected.payments!.map((pay) => (
            <div className="payment-record" key={pay.id}>
              <div className="payment-record-info">
                <strong>{formatPrice(pay.amount)}</strong>
                <small>{pay.date} · {pay.method}{pay.recipient && pay.recipient !== "Не выбран" ? ` · ${pay.recipient}` : ""}</small>
              </div>
              <button className="payment-delete-btn" onClick={() => deletePayment(selected.id, pay.id)} type="button">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="add-payment-form">
        <h3>Добавить оплату</h3>
        <div className="form-field">
          <label>Сумма</label>
          <input min="0" type="number" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} placeholder="0" />
        </div>
        <div className="form-field">
          <label>Дата</label>
          <input type="date" value={payDate} onChange={(event) => setPayDate(event.target.value)} />
        </div>
        <div className="form-field">
          <label>Способ оплаты</label>
          <select value={payMethod} onChange={(event) => setPayMethod(event.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Получатель</label>
          <select value={payRecipient} onChange={(event) => setPayRecipient(event.target.value)}>
            {PAYMENT_RECIPIENTS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <button
          className="secondary-button"
          disabled={!payAmount || Number(payAmount) <= 0}
          onClick={() => addPayment(selected.id, { amount: Number(payAmount), date: payDate, method: payMethod, recipient: payRecipient })}
          type="button"
        >
          Добавить оплату
        </button>
      </div>

      <div className="details-actions">
        {mode === "trash" ? (
          <button className="primary-button" onClick={() => update(selected.id, { ...financePatch, status: "new", deletedAt: "" })}>Восстановить заявку</button>
        ) : (
          <>
            <button className="secondary-button" onClick={() => update(selected.id, { ...financePatch, status: "in_progress" })}>В работу</button>
            <button className="danger-button" onClick={() => update(selected.id, { ...financePatch, status: "cancelled" })}>Отменить</button>
            <button className="danger-button" onClick={() => update(selected.id, { ...financePatch, status: "deleted", deletedAt: new Date().toISOString() })}><Trash2 size={16} /> Удалить</button>
            <button className="primary-button" onClick={() => update(selected.id, { ...financePatch, status: "confirmed" })}><Check size={16} /> Подтвердить</button>
          </>
        )}
      </div>
    </aside>
  );
}

function AnalyticsDashboard({ requests }: { requests: BookingRequest[] }) {
  const active = requests.filter((item) => item.status !== "cancelled" && item.status !== "deleted");
  const confirmed = requests.filter((item) => item.status === "confirmed");
  const totalPaid = confirmed.reduce((sum, item) => sum + (item.payments || []).reduce((s, p) => s + (p.amount || 0), 0), 0);
  const revenue = confirmed.reduce((sum, item) => sum + (Number(item.salePrice || item.price) || 0), 0);
  const debt = confirmed.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
  const hours = confirmed.reduce((sum, item) => sum + ((Number(item.duration) || 0) / 60), 0);
  const averageCheck = confirmed.length ? Math.round(revenue / confirmed.length) : 0;
  const uniquePhones = new Set(active.map((item) => item.phone.replace(/\D/g, "")).filter(Boolean)).size;
  const repeatClients = Array.from(
    active.reduce<Map<string, number>>((map, item) => {
      const key = item.phone.replace(/\D/g, "");
      if (!key) return map;
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map()).values(),
  ).filter((count) => count > 1).length;

  const sourceRows = analyticsRows(active, (item) => item.source || "Сайт");
  const formatRows = analyticsRows(confirmed, (item) => formatLabel(item.format), "salePrice");

  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="section-kicker">Отчеты</div>
          <h1>Аналитика</h1>
          <p>Сводка строится по текущим заявкам и подтвержденным броням.</p>
        </div>
      </div>
      <div className="analytics-grid">
        <AnalyticsCard label="Выручка" value={formatPrice(revenue)} hint="Подтвержденные брони" />
        <AnalyticsCard label="Поступило" value={formatPrice(totalPaid)} hint="Сумма оплат" />
        <AnalyticsCard label="Задолженность" value={formatPrice(debt)} hint="Остаток к оплате" />
        <AnalyticsCard label="Средний чек" value={formatPrice(averageCheck)} hint={`${confirmed.length} подтвержденных`} />
        <AnalyticsCard label="Загрузка" value={`${formatNumber(hours)} ч.`} hint="Часы подтвержденных броней" />
        <AnalyticsCard label="Клиенты" value={String(uniquePhones)} hint={`${repeatClients} повторных`} />
      </div>
      <div className="analytics-tables">
        <AnalyticsTable title="Каналы привлечения" rows={sourceRows} valueLabel="Заявок" />
        <AnalyticsTable title="Форматы поля" rows={formatRows} valueLabel="Выручка" money />
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

function AnalyticsTable({ title, rows, valueLabel, money = false }: { title: string; rows: Array<{ label: string; count: number; value: number }>; valueLabel: string; money?: boolean }) {
  return (
    <section className="admin-card analytics-table">
      <div className="analytics-table-head">
        <h2>{title}</h2>
        <span>{valueLabel}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">Данных пока нет</div>
      ) : (
        rows.map((row) => (
          <div className="analytics-row" key={row.label}>
            <div>
              <strong>{row.label}</strong>
              <small>{row.count} записей</small>
            </div>
            <span>{money ? formatPrice(row.value) : formatNumber(row.value)}</span>
          </div>
        ))
      )}
    </section>
  );
}

function analyticsRows(items: BookingRequest[], label: (item: BookingRequest) => string, valueField: "count" | "prepayment" | "salePrice" = "count") {
  const rows = items.reduce<Map<string, { label: string; count: number; value: number }>>((map, item) => {
    const key = label(item) || "Не указано";
    const current = map.get(key) || { label: key, count: 0, value: 0 };
    current.count += 1;
    current.value += valueField === "prepayment" ? (item.payments || []).reduce((s, p) => s + (p.amount || 0), 0) : valueField === "salePrice" ? Number(item.salePrice || item.price) || 0 : 1;
    map.set(key, current);
    return map;
  }, new Map());
  return Array.from(rows.values()).sort((a, b) => b.value - a.value);
}

function formatLabel(format: FieldFormat) {
  if (format === "quarter") return "1/4 поля";
  if (format === "half") return "1/2 поля";
  return "Полное поле";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function PriceSettings({ fieldOptions, onChange }: { fieldOptions: FieldOption[]; onChange: (options: FieldOption[]) => void }) {
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
    setMessage("");
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
    if (response.ok) {
      const settings = await response.json();
      onChange(fieldOptions.map((item) => ({ ...item, price: settings.prices[item.id] ?? item.price })));
      setMessage("Цены сохранены");
    } else {
      setMessage("Не удалось сохранить цены");
    }
    setSaving(false);
  }

  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="section-kicker">Настройки</div>
          <h1>Стоимость аренды</h1>
          <p>Цены указываются за 1 час и используются на сайте, в админке и аналитике.</p>
        </div>
      </div>
      <form className="admin-card details-form" onSubmit={save}>
        {fieldOptions.map((option) => (
          <div className="form-field" key={option.id}>
            <label>{option.shortLabel}</label>
            <input
              min="0"
              type="number"
              value={prices[option.id]}
              onChange={(event) => setPrices({ ...prices, [option.id]: event.target.value })}
            />
          </div>
        ))}
        {message && <div className={`admin-booking-message ${message === "Цены сохранены" ? "success" : ""}`}>{message}</div>}
        <button className="primary-button admin-create-button" disabled={saving} type="submit">
          <CircleDollarSign size={17} /> {saving ? "Сохраняем..." : "Сохранить цены"}
        </button>
      </form>
    </>
  );
}
