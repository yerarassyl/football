"use client";

import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleDollarSign,
  CopyPlus,
  Download,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { enrichBooking, formatLabel } from "@/lib/booking";
import { FIELD_OPTIONS, FieldOption, formatPrice, SECTORS, DURATION_OPTIONS, TIME_SLOTS } from "@/lib/constants";
import { arenaDateValue, bookingEndTime, formatDuration } from "@/lib/time";
import { BookingRequest, FieldFormat, PaymentRecord, RequestStatus } from "@/lib/types";
import CalendarPicker from "./CalendarPicker";

type QueueStatus = Exclude<RequestStatus, "deleted">;
type QueueTab = `status:${QueueStatus}`;
type Tab = "schedule" | QueueTab | "repeat" | "trash" | "analytics" | "prices";

type EditorState = {
  id?: string;
  date: string;
  time: string;
  duration: number;
  format: FieldFormat;
  // sector removed from admin panel
  name: string;
  phone: string;
  team: string;
  source: string;
  sourceDetail: string;
  salePricePerHour: string; // changed to per hour
  comment: string;
  status: BookingRequest["status"];
};

type QueueConfig = {
  tab: QueueTab;
  status: QueueStatus;
  label: string;
  description: string;
  icon: typeof CalendarDays;
};

const queueTabs: QueueConfig[] = [
  {
    tab: "status:new",
    status: "new",
    label: "Новые",
    description: "Ожидают обработки",
    icon: Plus,
  },
  {
    tab: "status:confirmed",
    status: "confirmed",
    label: "Подтвержденные",
    description: "Успешно проведены",
    icon: Check,
  },
];

const paymentRecipients = [
  "Не выбран",
  "ТОО AIR ARENA",
  "ИП AIR ARENA",
  "Наличные",
];

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
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
  return [
    item.id,
    item.date,
    item.time,
    item.name,
    item.phone,
    item.team,
    item.comment,
    item.source,
    item.sourceDetail,
    item.paymentMethod,
    item.paymentRecipient,
    // sector removed from search as it's not in admin panel
    formatLabel(item.format),
    item.status,
  ]
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
  const duration = 60; // 1 hour default
  return {
    date,
    time: "09:00",
    duration,
    format,
    // sector removed
    name: "",
    phone: "",
    team: "",
    source: "Администратор",
    sourceDetail: "",
    salePricePerHour: String(calculateListPrice(fieldOptions, format, duration) / (duration / 60)), // per hour
    comment: "",
    status: "confirmed",
  };
}

function editorFromBooking(booking: BookingRequest): EditorState {
  // Convert total price back to per hour for display
  const hours = booking.duration / 60;
  const perHour = hours > 0 ? booking.price / hours : 0;

  return {
    id: booking.id,
    date: booking.date,
    time: booking.time,
    duration: booking.duration,
    format: booking.format,
    // sector removed
    name: booking.name,
    phone: booking.phone,
    team: booking.team,
    source: booking.source,
    sourceDetail: booking.sourceDetail,
    salePricePerHour: String(perHour),
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
  const today = arenaDateValue();
  const [tab, setTab] = useState<Tab>("schedule");
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedId, setSelectedId] = useState(""); // single selection for details
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // multi-selection for batch actions
  const [createMode, setCreateMode] = useState(false);
  const [editor, setEditor] = useState<EditorState>(() => defaultEditor(today, FIELD_OPTIONS));
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>(FIELD_OPTIONS);
  const [showPriceSettings, setShowPriceSettings] = useState(false);
  const [priceForm, setPriceForm] = useState({ quarter: 0, half: 0, full: 0 });
  const [priceFormOpen, setPriceFormOpen] = useState(false);

  function openPriceSettings() {
    setPriceForm({
      quarter: fieldOptions.find((f) => f.id === "quarter")?.price || 10000,
      half: fieldOptions.find((f) => f.id === "half")?.price || 18000,
      full: fieldOptions.find((f) => f.id === "full")?.price || 30000,
    });
    setShowPriceSettings(true);
  }

  async function savePriceSettings() {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: priceForm }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить цены");
      setFieldOptions((items) =>
        items.map((item) => ({
          ...item,
          price: result.prices?.[item.id] ?? item.price,
        })),
      );
      showNotice("success", "Прайс обновлен");
      setShowPriceSettings(false);
    } catch (error) {
      showNotice("error", noticeText(error));
    } finally {
      setSaving(false);
    }
  }

  function showNotice(type: "success" | "error", text: string) {
    setNotice({ type, text });
    window.setTimeout(() => {
      setNotice((current) => (current?.text === text ? null : current));
    }, 3000);
  }

  // Toggle individual selection (for batch actions)
  function toggleSelect(id: string) {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );

    // On desktop, also show details for the selected item
    if (!isMobile) {
      setSelectedId(id);
    }
  }

  // Select all visible items
  function selectAllVisible(visibleIds: string[]) {
    setSelectedIds([...visibleIds]);
    // On desktop, also show details for the first selected item
    if (!isMobile) {
      if (visibleIds.length > 0) {
        setSelectedId(visibleIds[0]);
      } else {
        setSelectedId("");
      }
    }
  }

  // Clear selection
  function clearSelection() {
    setSelectedIds([]);
    setSelectedId("");
  }

  useEffect(() => {
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab === "prices") {
      setPriceForm({
        quarter: fieldOptions.find((f) => f.id === "quarter")?.price || 10000,
        half: fieldOptions.find((f) => f.id === "half")?.price || 18000,
        full: fieldOptions.find((f) => f.id === "full")?.price || 30000,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/bookings", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        throw new Error(data?.error || "Не удалось загрузить брони");
      }
      setBookings(data.map(enrichBooking));
    } catch (error) {
      showNotice("error", noticeText(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const settings = await response.json();
      if (!response.ok) throw new Error(settings.error || "Не удалось загрузить цены");
      setFieldOptions((items) =>
        items.map((item) => ({
          ...item,
          price: settings.prices?.[item.id] ?? item.price,
        })),
      );
    } catch (error) {
      showNotice("error", noticeText(error));
    }
  }

  useEffect(() => {
    void load();
    void loadSettings();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 620px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
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

  // Filtered bookings for schedule view (excluding deleted)
  const scheduleBookings = useMemo(() => {
    const active = bookings.filter((item) => item.status !== "deleted" && item.status !== "new");
    const source = query.trim()
      ? active.filter((item) => matchQuery(item, query))
      : active.filter((item) => item.date === selectedDate);
    return [...source].sort(bookingSort);
  }, [bookings, query, selectedDate]);

  // Trash items (deleted status)
  const trashBookings = useMemo(
    () => bookings.filter((item) => item.status === "deleted" && matchQuery(item, query)).sort(bookingSort),
    [bookings, query],
  );

  // Confirmed bookings queue (only status we keep)
  const confirmedBookings = useMemo(() =>
    bookings
      .filter((booking) => booking.status === "confirmed" && matchQuery(booking, query))
      .sort(bookingSort),
    [bookings, query]
  );

  const queueBookings = useMemo(() => {
    const status = tab.startsWith("status:") ? (tab.slice(7) as QueueStatus) : null;
    if (!status) return [];
    return bookings
      .filter((b) => b.status === status && matchQuery(b, query))
      .sort(bookingSort);
  }, [bookings, query, tab]);

  const currentQueue = useMemo(
    () => queueTabs.find((item) => item.tab === tab),
    [tab],
  );

  // Handle single selection navigation
  useEffect(() => {
    if (!currentQueue || createMode) return;
    const activeSelection = bookings.find((item) => item.id === selectedId);
    if (isMobile) {
      if (!activeSelection || activeSelection.status !== currentQueue.status) {
        setSelectedId("");
      }
      return;
    }
    if (!activeSelection || activeSelection.status !== currentQueue.status) {
      setSelectedId(queueBookings[0]?.id || "");
    }
  }, [bookings, createMode, currentQueue, isMobile, selectedId, queueBookings]);

  async function persistPatch(id: string, patch: Partial<BookingRequest>) {
    const response = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Не удалось сохранить изменения");
    const updated = enrichBanner(result as BookingRequest);
    setBookings((current) => current.map((item) => (item.id === id ? updated : item)));
    setSelectedId(updated.id);
    return updated;
  }

  async function saveBooking(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const listPrice = calculateListPrice(fieldOptions, editor.format, editor.duration);
      const salePricePerHour = Number(editor.salePricePerHour) || 0;
      const durationHours = editor.duration / 60;
      const totalPrice = Math.round(salePricePerHour * durationHours);

      const payload = {
        date: editor.date,
        time: editor.time,
        duration: editor.duration,
        format: editor.format,
        // sector removed from admin - will be set to first sector of format
        sector: SECTORS[editor.format][0].id,
        listPrice,
        price: totalPrice, // total price
        salePrice: totalPrice, // keep same as price for compatibility
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
          status: "confirmed",
        });
        showNotice("success", "Бронь подтверждена");
      } else {
        const createResponse = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, status: editor.status, comment: editor.comment }),
        });
        const created = await createResponse.json();
        if (!createResponse.ok) {
          throw new Error(created.error || "Не удалось создать бронь");
        }

        const finalized = enrichBooking(created as BookingRequest);
        setBookings((current) => [finalized, ...current.filter((item) => item.id !== finalized.id)]);
        setSelectedId(finalized.id);
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

  async function deletePayment(paymentId: string) {
    if (!selectedBooking) return;
    setSaving(true);
    try {
      const payments = selectedBooking.payments.filter((p) => p.id !== paymentId);
      await persistPatch(selectedBooking.id, { payments });
      showNotice("success", "Оплата удалена");
    } catch (error) {
      showNotice("error", noticeText(error));
    } finally {
      setSaving(false);
    }
  }

  async function moveToTrash(id: string) {
    if (!window.confirm("Переместить эту бронь в корзину?")) return;
    try {
      await persistPatch(id, { status: "deleted", deletedAt: new Date().toISOString() });
      showNotice("success", "Бронь отправлена в корзину");

      // Remove from selection if present
      setSelectedIds(prev => prev.filter(i => i !== id));
      if (selectedId === id) setSelectedId("");
    } catch (error) {
      showNotice("error", noticeText(error));
    }
  }

  async function restoreFromTrash(id: string) {
    try {
      await persistPatch(id, { status: "confirmed", deletedAt: "" });
      showNotice("success", "Бронь восстановлена");

      // Remove from selection if present
      setSelectedIds(prev => prev.filter(i => i !== id));
      if (selectedId === id) setSelectedId("");
    } catch (error) {
      showNotice("error", noticeText(error));
    }
  }

  async function deleteForever(id: string) {
    if (!window.confirm("Удалить бронь навсегда? Это действие нельзя отменить.")) return;
    try {
      const response = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось удалить бронь");
      setBookings((current) => current.filter((item) => item.id !== id));

      // Remove from selection if present
      setSelectedIds(prev => prev.filter(i => i !== id));
      if (selectedId === id) setSelectedId("");

      showNotice("success", "Бронь удалена окончательно");
    } catch (error) {
      showNotice("error", noticeText(error));
    }
  }

  // Batch actions
  async function confirmSelected() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Подтвердить ${selectedIds.length} выбранных броней?`)) return;

    try {
      // Update each selected booking to confirmed status
      const updates = selectedIds.map(id =>
        fetch(`/api/bookings/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "confirmed" })
        })
      );

      await Promise.all(updates);
      const now = new Date().toISOString();
      setBookings((current) =>
        current.map((item) =>
          selectedIds.includes(item.id)
            ? { ...item, status: "confirmed" as const, confirmedAt: item.confirmedAt || now, updatedAt: now }
            : item,
        ),
      );
      showNotice("success", `Подтверждено ${selectedIds.length} броней`);
      clearSelection();
    } catch (error) {
      showNotice("error", noticeText(error));
    }
  }

  async function trashSelected() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Переместить ${selectedIds.length} выбранных броней в корзину?`)) return;

    try {
      const updates = selectedIds.map(id =>
        fetch(`/api/bookings/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "deleted",
            deletedAt: new Date().toISOString()
          })
        })
      );

      await Promise.all(updates);
      const now2 = new Date().toISOString();
      setBookings((current) =>
        current.map((item) =>
          selectedIds.includes(item.id)
            ? { ...item, status: "deleted" as const, deletedAt: now2, updatedAt: now2 }
            : item,
        ),
      );
      showNotice("success", `Перемещено в корзину ${selectedIds.length} броней`);
      clearSelection();
    } catch (error) {
      showNotice("error", noticeText(error));
    }
  }

  async function restoreSelected() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Восстановить ${selectedIds.length} выбранных броней из корзины?`)) return;

    try {
      const updates = selectedIds.map(id =>
        fetch(`/api/bookings/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "confirmed",
            deletedAt: ""
          })
        })
      );

      await Promise.all(updates);
      const now3 = new Date().toISOString();
      setBookings((current) =>
        current.map((item) =>
          selectedIds.includes(item.id)
            ? { ...item, status: "confirmed" as const, deletedAt: "", updatedAt: now3 }
            : item,
        ),
      );
      showNotice("success", `Восстановлено ${selectedIds.length} броней`);
      clearSelection();
    } catch (error) {
      showNotice("error", noticeText(error));
    }
  }

  async function deleteSelectedForever() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Удалить ${selectedIds.length} выбранных броней навсегда? Это действие нельзя отменить.`)) return;

    try {
      const deletes = selectedIds.map(id =>
        fetch(`/api/bookings/${id}`, { method: "DELETE" })
      );
      await Promise.all(deletes);
      setBookings((current) => current.filter((item) => !selectedIds.includes(item.id)));
      showNotice("success", `Удалено ${selectedIds.length} броней`);
      clearSelection();
    } catch (error) {
      showNotice("error", noticeText(error));
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  function openStatusTab(status: QueueStatus, bookingId?: string) {
    const nextTab = `status:${status}` as QueueTab;
    setTab(nextTab);
    setCreateMode(false);
    if (bookingId) setSelectedId(bookingId);
  }

  function openBookingDetails(bookingId: string, fallbackStatus: QueueStatus = "confirmed") {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return;
    if (booking.status === "deleted") {
      setTab("trash");
      setSelectedId(booking.id);
      setCreateMode(false);
      return;
    }
    if (booking.status === "new" || booking.status === "in_progress" || booking.status === "confirmed") {
      openStatusTab(booking.status, booking.id);
      return;
    }
    openStatusTab(fallbackStatus, booking.id);
  }

  function openFilteredBookings(nextTab: Tab, nextQuery: string) {
    setCreateMode(false);
    setSelectedId("");
    setQuery(nextQuery);
    setTab(nextTab);
  }

  function openScheduleDate(date: string) {
    setCreateMode(false);
    setSelectedId("");
    setQuery("");
    setSelectedDate(date);
    setTab("schedule");
  }

  function openMobileBookings(nextTab: QueueTab | "trash" = "status:confirmed") {
    setCreateMode(false);
    setSelectedId("");
    setQuery("");
    setTab(nextTab);
  }

  const showMobileDetails = isMobile && (createMode || Boolean(selectedBooking));

  // Get IDs of currently visible items for select all functionality
  const visibleScheduleIds = useMemo(() =>
    scheduleBookings.map(b => b.id),
    [scheduleBookings]
  );

  const visibleConfirmedIds = useMemo(() =>
    confirmedBookings.map(b => b.id),
    [confirmedBookings]
  );

  const visibleTrashIds = useMemo(() =>
    trashBookings.map(b => b.id),
    [trashBookings]
  );

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link className="brand admin-brand" href="/">
          <span className="brand-mark"><Trophy size={18} /></span> Air Arena
        </Link>
        <nav>
          <button className={tab === "status:new" ? "active" : ""} onClick={() => setTab("status:new")}>
            <Plus size={18} />
            <span className="nav-label" data-short="Новые">Новые</span>
            <span className="nav-badge">{bookings.filter((booking) => booking.status === "new").length}</span>
          </button>
          <button className={tab === "status:confirmed" ? "active" : ""} onClick={() => setTab("status:confirmed")}>
            <Check size={18} />
            <span className="nav-label" data-short="Подтв.">Подтвержденные</span>
            <span className="nav-badge">{bookings.filter((booking) => booking.status === "confirmed").length}</span>
          </button>
          <button className={tab === "schedule" ? "active" : ""} onClick={() => setTab("schedule")}>
            <CalendarDays size={18} />
            <span className="nav-label" data-short="День">График</span>
            <span className="nav-badge">{bookings.filter(b => b.status === "confirmed" && b.date === today).length}</span>
          </button>
          <button className={tab === "trash" ? "active" : ""} onClick={() => setTab("trash")}>
            <Trash2 size={18} />
            <span className="nav-label" data-short="Корзина">Корзина</span>
            <span className="nav-badge">{trashBookings.length}</span>
          </button>
          <button className={tab === "repeat" ? "active" : ""} onClick={() => setTab("repeat")}>
            <CopyPlus size={18} />
            <span className="nav-label" data-short="Повтор">Повтор</span>
          </button>
          <button className={tab === "analytics" ? "active" : ""} onClick={() => setTab("analytics")}>
            <BarChart3 size={18} />
            <span className="nav-label" data-short="Аналит.">Аналитика</span>
          </button>
          <button className={`desktop-only-nav${tab === "prices" ? " active" : ""}`} onClick={() => setTab("prices")}>
            <CircleDollarSign size={18} />
            <span className="nav-label" data-short="Прайс">Прайс</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <button className="logout-button" onClick={logout}><LogOut size={16} /> Выйти</button>
        </div>
      </aside>

      <main className="admin-main">
        {notice && <div role="status" aria-live="polite" className={`admin-toast ${notice.type}`}>{notice.text}</div>}
        <div className="admin-mobile-head">
          <span className="brand"><span className="brand-mark"><Trophy size={16} /></span> Air Arena</span>
          <div className="mobile-head-actions">
            <button aria-label="Настройки прайса" className="secondary-button" onClick={() => { setCreateMode(false); setSelectedId(""); setTab("prices"); }}><CircleDollarSign size={15} /></button>
            <button aria-label="Выйти из админки" className="secondary-button" onClick={logout}><LogOut size={15} /></button>
          </div>
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
                <div className="batch-actions">
                  {selectedIds.length > 0 && (
                    <div className="batch-toolbar">
                      <span>{selectedIds.length} выбрано</span>
                      <button className="secondary-button" onClick={confirmSelected}>
                        <Check size={16} /> Подтвердить выбранные
                      </button>
                      <button className="danger-button" onClick={trashSelected}>
                        <Trash2 size={16} /> В корзину
                      </button>
                      <button className="secondary-button" onClick={clearSelection}>
                        <X size={16} /> Очистить выбор
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className="primary-button"
                  onClick={() => {
                    setCreateMode(true);
                    setSelectedId("");
                    setEditor(defaultEditor(selectedDate, fieldOptions));
                  }}
                  type="button"
                >
                  <Plus size={16} /> Новая бронь
                </button>
              </div>
            </div>

            <div className={`admin-schedule-grid ${showMobileDetails ? "mobile-detail-mode" : ""}`}>
              <section className={`admin-card schedule-panel ${showMobileDetails ? "mobile-list-hidden" : ""}`}>
                <div className="schedule-toolbar">
                  <CalendarPicker value={selectedDate} onChange={setSelectedDate} allowPast />
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
                    <div className={`schedule-card-row`} key={booking.id}>
                      <label className="schedule-item-label">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(booking.id)}
                          onChange={() => toggleSelect(booking.id)}
                        />
                        <span className="checkbox-label"></span>
                      </label>
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
                            <span className="card-finance-trio">
                              <span><em>Сумма</em>{formatPrice(booking.salePrice || booking.price)}</span>
                              <span><em>Оплачено</em>{formatPrice(booking.prepayment)}</span>
                              <span><em>Остаток</em>{formatPrice(booking.balance)}</span>
                            </span>
                          </div>
                          <div className="schedule-card-format">{formatLabel(booking.format)}</div>
                          <div className="schedule-card-meta">
                            <span>{booking.sector}</span>
                            <span>{booking.team || booking.phone}</span>
                          </div>
                          {booking.comment && <div className="schedule-card-comment">{booking.comment}</div>}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <BookingEditor
                booking={selectedBooking}
                createMode={createMode}
                editor={editor}
                fieldOptions={fieldOptions}
                mobileView={showMobileDetails}
                onAddPayment={addPayment}
                onDeletePayment={deletePayment}
                onBack={() => {
                  setCreateMode(false);
                  setSelectedId("");
                }}
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

        {currentQueue && (
          <>
            <div className="admin-heading">
              <div>
                <div className="section-kicker">Статусы заявок</div>
                <h1>{currentQueue.label}</h1>
                <p>{currentQueue.description}. Нажмите на карточку слева, чтобы открыть полную заявку и историю оплат.</p>
              </div>
              <div className="schedule-head-actions">
                <div className="batch-actions">
                  {selectedIds.length > 0 && (
                    <div className="batch-toolbar">
                      <span>{selectedIds.length} выбрано</span>
                      {tab !== "status:confirmed" && !tab.startsWith("status:cancelled") && (
                        <button className="secondary-button" onClick={confirmSelected}>
                          <Check size={16} /> Подтвердить выбранные
                        </button>
                      )}
                      {!tab.startsWith("status:cancelled") && (
                        <button className="danger-button" onClick={trashSelected}>
                          <Trash2 size={16} /> В корзину
                        </button>
                      )}
                      <button className="secondary-button" onClick={clearSelection}>
                        <X size={16} /> Очистить выбор
                      </button>
                    </div>
                  )}
                </div>
                {(tab === "status:new" || tab === "status:confirmed") && (
                  <button
                    className="primary-button"
                    onClick={() => {
                      setCreateMode(true);
                      setSelectedId("");
                      setEditor(defaultEditor(today, fieldOptions));
                    }}
                    type="button"
                  >
                    <Plus size={16} /> Новая бронь
                  </button>
                )}
              </div>
            </div>

            <div className={`admin-schedule-grid ${showMobileDetails ? "mobile-detail-mode" : ""}`}>
              <section className={`admin-card schedule-panel ${showMobileDetails ? "mobile-list-hidden" : ""}`}>
                <div className="schedule-toolbar schedule-toolbar-compact">
                  <div className="queue-summary-card">
                    <strong>{currentQueue.label}</strong>
                    <small>{currentQueue.description}</small>
                  </div>
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
                    <strong>{currentQueue.label}</strong>
                    <small>{queueBookings.length} заявок в списке</small>
                  </div>
                </div>
                <div className="schedule-list">
                  {queueBookings.length === 0 && <div className="empty-state">В этом статусе пока нет заявок</div>}
                  {queueBookings.map((booking) => (
                    <div className={`schedule-card-row`} key={booking.id}>
                      <label className="schedule-item-label">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(booking.id)}
                          onChange={() => toggleSelect(booking.id)}
                        />
                        <span className="checkbox-label"></span>
                      </label>
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
                          <strong>{booking.date}</strong>
                          <span>{booking.time}-{bookingEndTime(booking.time, booking.duration)}</span>
                          <small>{formatDuration(booking.duration)}</small>
                        </div>
                        <div className="schedule-card-body">
                          <div className="schedule-card-top">
                            <strong>{booking.name}</strong>
                            {tab === "status:new" ? (
                              <span className="card-price">{formatPrice(booking.salePrice || booking.price)}</span>
                            ) : (
                              <span className="card-finance-trio">
                                <span><em>Сумма</em>{formatPrice(booking.salePrice || booking.price)}</span>
                                <span><em>Оплачено</em>{formatPrice(booking.prepayment)}</span>
                                <span><em>Остаток</em>{formatPrice(booking.balance)}</span>
                              </span>
                            )}
                          </div>
                          <div className="schedule-card-format">{formatLabel(booking.format)}</div>
                          <div className="schedule-card-meta">
                            <span>{booking.sector}</span>
                            <span>{booking.team || booking.phone}</span>
                            {tab !== "status:new" && <span>{booking.paymentStatus === "paid" ? "Оплачено" : booking.paymentStatus === "deposit" ? "Частично" : "Без оплаты"}</span>}
                          </div>
                          {booking.comment && <div className="schedule-card-comment">{booking.comment}</div>}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <BookingEditor
                booking={selectedBooking}
                createMode={createMode}
                editor={editor}
                fieldOptions={fieldOptions}
                mobileView={showMobileDetails}
                onAddPayment={addPayment}
                onDeletePayment={deletePayment}
                onBack={() => {
                  setCreateMode(false);
                  setSelectedId("");
                }}
                onChange={setEditor}
                onDelete={() => selectedBooking && void moveToTrash(selectedBooking.id)}
                onSave={saveBooking}
                onCancelCreate={() => setCreateMode(false)}
                saving={saving}
              />
            </div>
          </>
        )}

        {tab === "trash" && (
          <>
            <div className="admin-heading">
              <div>
                <div className="section-kicker">Корзина</div>
                <h1>Удаленные брони</h1>
                <p>Можно восстановить бронь или удалить запись из Google Sheets навсегда.</p>
              </div>
              <div className="schedule-head-actions">
                <div className="batch-actions">
                  {selectedIds.length > 0 && (
                    <div className="batch-toolbar">
                      <span>{selectedIds.length} выбрано</span>
                      <button className="secondary-button" onClick={restoreSelected}>
                        <RotateCcw size={16} /> Восстановить
                      </button>
                      <button className="secondary-button" onClick={deleteSelectedForever}>
                        <Trash2 size={16} /> Удалить навсегда
                      </button>
                      <button className="secondary-button" onClick={clearSelection}>
                        <X size={16} /> Очистить выбор
                      </button>
                    </div>
                  )}
                </div>
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
                  <div className="trash-row-content">
                    <label className="trash-item-label">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(booking.id)}
                        onChange={() => toggleSelect(booking.id)}
                      />
                      <span className="checkbox-label"></span>
                    </label>
                    <div className="trash-row-content-inner">
                      <strong>{booking.date} · {booking.time}-{bookingEndTime(booking.time, booking.duration)}</strong>
                      <small>{booking.name} · {formatLabel(booking.format)} · {booking.sector}</small>
                      <small>Телефон: {booking.phone} · Команда: {booking.team || "не указана"}</small>
                      <small>Сумма: {formatPrice(booking.salePrice || booking.price)} · Оплачено: {formatPrice(booking.prepayment)} · Остаток: {formatPrice(booking.balance)}</small>
                      <small>Источник: {booking.source || "Сайт"}{booking.comment ? ` · ${booking.comment}` : ""}</small>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        {tab === "analytics" && (
          <AnalyticsDashboard
            bookings={bookings}
            onOpenBooking={openBookingDetails}
            onOpenStatus={openStatusTab}
            onOpenFilter={openFilteredBookings}
            onOpenDate={openScheduleDate}
          />
        )}
        {tab === "prices" && (
          <>
            <div className="admin-heading">
              <div>
                <div className="section-kicker">Настройки</div>
                <h1>Прайс</h1>
                <p>Базовые цены для каждого формата поля.</p>
              </div>
              <button className="primary-button" disabled={saving} onClick={savePriceSettings} type="button">
                <Save size={16} /> Сохранить прайс
              </button>
            </div>
            <section className="admin-card prices-tab-content">
              <div className="form-grid prices-grid">
                <label className="form-field">
                  <span>Четверть поля (1/4)</span>
                  <input
                    type="number"
                    min="0"
                    value={priceForm.quarter}
                    onChange={(e) => setPriceForm({ ...priceForm, quarter: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="form-field">
                  <span>Половина поля (1/2)</span>
                  <input
                    type="number"
                    min="0"
                    value={priceForm.half}
                    onChange={(e) => setPriceForm({ ...priceForm, half: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="form-field">
                  <span>Полное поле</span>
                  <input
                    type="number"
                    min="0"
                    value={priceForm.full}
                    onChange={(e) => setPriceForm({ ...priceForm, full: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
            </section>
          </>
        )}
        {showPriceSettings && (
          <div className="modal-overlay" onClick={() => setShowPriceSettings(false)}>
            <div className="modal-content price-settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h2><Settings size={18} /> Настройки прайса</h2>
                <button className="modal-close" onClick={() => setShowPriceSettings(false)} type="button"><X size={18} /></button>
              </div>
              <div className="modal-body">
                <label className="form-field">
                  <span>Четверть поля (1/4)</span>
                  <input
                    type="number"
                    min="0"
                    value={priceForm.quarter}
                    onChange={(e) => setPriceForm({ ...priceForm, quarter: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="form-field">
                  <span>Половина поля (1/2)</span>
                  <input
                    type="number"
                    min="0"
                    value={priceForm.half}
                    onChange={(e) => setPriceForm({ ...priceForm, half: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="form-field">
                  <span>Полное поле</span>
                  <input
                    type="number"
                    min="0"
                    value={priceForm.full}
                    onChange={(e) => setPriceForm({ ...priceForm, full: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => setShowPriceSettings(false)} type="button">Отмена</button>
                <button className="primary-button" disabled={saving} onClick={savePriceSettings} type="button">
                  <Save size={16} /> Сохранить прайс
                </button>
              </div>
            </div>
          </div>
        )}
              </main>
    </div>
  );
}

// Helper function for enriching booking (copied from original)
function enrichBanner(booking: BookingRequest): BookingRequest {
  // This is a simplified version - in real code we'd import the actual function
  // For now, we'll just return the booking as is
  return booking;
}

function BookingEditor({
  booking,
  createMode,
  editor,
  fieldOptions,
  mobileView,
  onAddPayment,
  onDeletePayment,
  onBack,
  onChange,
  onDelete,
  onSave,
  onCancelCreate,
  saving,
}: {
  booking?: BookingRequest;
  createMode:boolean;
  editor:EditorState;
  fieldOptions:FieldOption[];
  mobileView:boolean;
  onAddPayment:(payment:Omit<PaymentRecord,"id">)=>Promise<void>;
  onDeletePayment:(paymentId:string)=>Promise<void>;
  onBack:()=>void;
  onChange:(editor:EditorState)=>void;
  onDelete:()=>void;
  onSave:(event:FormEvent)=>Promise<void>;
  onCancelCreate:()=>void;
  saving:boolean;
}) {
  const listPrice = calculateListPrice(fieldOptions, editor.format, editor.duration);
  const paymentTotal = booking?.prepayment || 0;
  const balance = Math.max(0, (Number(editor.salePricePerHour) || 0) * (editor.duration / 60) - paymentTotal);
  const sectorOptions = SECTORS[editor.format];
  const [editingPrice, setEditingPrice] = useState(false);
  const [showInlinePayment, setShowInlinePayment] = useState(false);
  const [inlinePaymentForm, setInlinePaymentForm] = useState({
    amount: "",
    date: arenaDateValue(),
    recipient: "Не выбран",
  });

  useEffect(() => {
    setInlinePaymentForm({
      amount: "",
      date: arenaDateValue(),
      recipient: "Не выбран",
    });
    setEditingPrice(false);
    setShowInlinePayment(false);
  }, [booking?.id]);

  // Occupied slot tracking for conflict indicators in dropdowns
  const [occupiedByTime, setOccupiedByTime] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let active = true;
    fetch(`/api/availability?date=${editor.date}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((items: Array<{ time: string; sector: string }>) => {
        if (!active || !Array.isArray(items)) return;
        const grouped: Record<string, string[]> = {};
        items.forEach((item) => {
          grouped[item.time] = Array.from(
            new Set([...(grouped[item.time] || []), ...item.sector.split("+")]),
          );
        });
        setOccupiedByTime(grouped);
      })
      .catch(() => setOccupiedByTime({}));
    return () => { active = false; };
  }, [editor.date]);

  function slotIsBusy(slot: string) {
    const referenceSector = SECTORS[editor.format]?.[0]?.id;
    if (!referenceSector) return false;
    const occupied = occupiedByTime[slot] || [];
    return referenceSector.split("+").some((p) => occupied.includes(p));
  }

  const startIndex = editor.time ? TIME_SLOTS.indexOf(editor.time) : -1;
  const nextBusy = startIndex === -1 ? null : TIME_SLOTS.slice(startIndex).findIndex((slot) => slotIsBusy(slot));
  const maxDurationSlots = nextBusy === -1 || nextBusy === null
    ? TIME_SLOTS.length
    : nextBusy;
  const availableDurations = DURATION_OPTIONS.filter((minutes) => minutes / 30 <= maxDurationSlots);

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
    <aside className={`admin-card booking-editor ${mobileView ? "mobile-editor-visible" : ""}`}>
      {mobileView && (
        <button className="editor-back-button" onClick={onBack} type="button">
          <ChevronLeft size={16} /> Назад к списку
        </button>
      )}
      <div className="editor-head">
        <div>
          <small>{createMode ? "Новая запись" : booking?.id}</small>
          <h2>{createMode ? "Создание брони" : booking?.name}</h2>
          <p>{createMode ? "Новая бронь сразу попадет в график администратора." : `${booking?.team || "Без команда"} · ${booking?.phone}`}</p>
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
            <select value={editor.time} onChange={(event) => onChange({ ...editor, time: event.target.value })}>
              <option value="">Выберите время</option>
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot} disabled={slotIsBusy(slot)}>
                  {slot.slice(0, 5)}{slotIsBusy(slot) ? " · занято" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Количество часов</span>
            {/* Convert duration minutes to hours for display, but store as minutes */}
            <select value={editor.duration} onChange={(event) => onChange({ ...editor, duration: Number(event.target.value) })}>
              {(editor.time ? availableDurations : DURATION_OPTIONS).map((value) => (
                <option key={value} value={value}>
                  {(value / 60).toString().replace(/\.0$/, '')} час{(value / 60) === 1 ? '' : (value / 60) < 2 ? 'а' : 'ов'}
                </option>
              ))}
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
                  // sector removed from UI - automatically set to first sector
                  // sector: SECTORS[format][0].id, // handled in save logic
                  salePricePerHour: String(calculateListPrice(fieldOptions, format, editor.duration) / (editor.duration / 60)), // reset to default per hour when format changes
                });
              }}
            >
              {fieldOptions.map((item) => <option key={item.id} value={item.id}>{item.shortLabel}</option>)}
            </select>
          </label>
          {/* Sector removed from admin panel as requested */}
          <label className="form-field">
            <span>Статус</span>
            <select value={editor.status} onChange={(event) => onChange({ ...editor, status: event.target.value as BookingRequest["status"] })}>
              <option value="new">Новая</option>
              <option value="confirmed">Подтверждена</option>
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
          <label className="form-field editor-span-2">
            <span>Комментарий</span>
            <textarea rows={4} value={editor.comment} onChange={(event) => onChange({ ...editor, comment: event.target.value })} />
          </label>
        </div>

        <div className="editor-totals">
          <div><span>Стоимость по прайсу</span><strong>{formatPrice(listPrice)}</strong></div>
          <div className="totals-editable">
            <span>Фактическая стоимость за час</span>
            {editingPrice ? (
              <div className="totals-edit-row">
                <input
                  type="number"
                  min="0"
                  className="totals-inline-input"
                  value={editor.salePricePerHour}
                  onChange={(e) => onChange({ ...editor, salePricePerHour: e.target.value })}
                  autoFocus
                  onBlur={() => setEditingPrice(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") setEditingPrice(false); }}
                />
              </div>
            ) : (
              <div className="totals-value-row">
                <strong>{formatPrice(Number(editor.salePricePerHour) || 0)}</strong>
                <button className="icon-edit-btn" onClick={() => setEditingPrice(true)} type="button" title="Изменить цену"><Pencil size={14} /></button>
              </div>
            )}
          </div>
          <div><span>Итого к оплате</span><strong>{formatPrice(Math.max(0, (Number(editor.salePricePerHour) || 0) * (editor.duration / 60)))}</strong></div>
          <div className="totals-editable">
            <span>Оплачено</span>
            <div className="totals-value-row">
              <strong>{formatPrice(paymentTotal)}</strong>
              {!createMode && booking && (
                <button className="icon-edit-btn icon-plus-btn" onClick={() => setShowInlinePayment(!showInlinePayment)} type="button" title="Добавить оплату"><Plus size={14} /></button>
              )}
            </div>
          </div>
          <div><span>Остаток</span><strong>{formatPrice(balance)}</strong></div>
        </div>

        {showInlinePayment && !createMode && booking && (
          <form
            className="inline-payment-form"
            onSubmit={(e) => {
              e.preventDefault();
              const amount = Number(inlinePaymentForm.amount);
              if (!Number.isFinite(amount) || amount <= 0) return;
              void onAddPayment({
                amount,
                date: inlinePaymentForm.date,
                method: "",
                recipient: inlinePaymentForm.recipient,
              });
              setInlinePaymentForm({ amount: "", date: arenaDateValue(), recipient: "Не выбран" });
              setShowInlinePayment(false);
            }}
          >
            <div className="inline-payment-grid">
              <label className="form-field">
                <span>Сумма</span>
                <input type="number" min="1" required value={inlinePaymentForm.amount} onChange={(e) => setInlinePaymentForm({ ...inlinePaymentForm, amount: e.target.value })} />
              </label>
              <label className="form-field">
                <span>Дата</span>
                <input type="date" required value={inlinePaymentForm.date} onChange={(e) => setInlinePaymentForm({ ...inlinePaymentForm, date: e.target.value })} />
              </label>
              <label className="form-field">
                <span>Получатель</span>
                <select value={inlinePaymentForm.recipient} onChange={(e) => setInlinePaymentForm({ ...inlinePaymentForm, recipient: e.target.value })}>
                  {paymentRecipients.map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <div className="inline-payment-submit">
                <button className="secondary-button" disabled={saving} type="submit"><CircleDollarSign size={16} /> Добавить оплату</button>
              </div>
            </div>
          </form>
        )}

        <div className="editor-actions">
          {createMode ? (
            <>
              <button className="secondary-button" onClick={onCancelCreate} type="button">Отмена</button>
              <button className="primary-button" disabled={saving} type="submit"><Check size={16} /> Подтвердить</button>
            </>
          ) : (
            <>
              <button className="danger-button" onClick={onDelete} type="button"><Trash2 size={16} /> В корзину</button>
              <button className="primary-button" disabled={saving} type="submit"><Check size={16} /> Подтвердить</button>
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
                <button className="payment-delete-btn" title="Удалить оплату" type="button" disabled={saving} onClick={() => void onDeletePayment(payment.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
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
  const today = arenaDateValue();
  const [sourceFrom, setSourceFrom] = useState(today);
  const [sourceTo, setSourceTo] = useState(today);
  const [mode, setMode] = useState<"once" | "month" | "until">("once");
  const [targetStart, setTargetStart] = useState(addDays(today, 7));
  const [untilDate, setUntilDate] = useState(addDays(today, 28));
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState("");
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([]);

  const sourceBookings = useMemo(
    () => bookings
      .filter((item) => item.status !== "deleted" && item.status !== "cancelled")
      .filter((item) => item.date >= sourceFrom && item.date <= sourceTo)
      .sort(bookingSort),
    [bookings, sourceFrom, sourceTo],
  );

  useEffect(() => {
    const availableIds = new Set(sourceBookings.map((item) => item.id));
    setSelectedBookingIds((current) => {
      const kept = current.filter((id) => availableIds.has(id));
      const next = [...kept];
      sourceBookings.forEach((booking) => {
        if (!next.includes(booking.id)) next.push(booking.id);
      });
      return next;
    });
  }, [sourceBookings]);

  const selectedSourceBookings = useMemo(
    () => sourceBookings.filter((booking) => selectedBookingIds.includes(booking.id)),
    [selectedBookingIds, sourceBookings],
  );

  function toggleBookingSelection(bookingId: string) {
    setSelectedBookingIds((current) =>
      current.includes(bookingId)
        ? current.filter((id) => id !== bookingId)
        : [...current, bookingId],
    );
  }

  async function repeatSchedule(event: FormEvent) {
    event.preventDefault();
    if (sourceBookings.length === 0) {
      setResult("В выбранном исходном периоде нет активных броней.");
      return;
    }

    if (selectedSourceBookings.length === 0) {
      setResult("Выберите хотя бы одну бронь для повторения.");
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
        for (const booking of selectedSourceBookings) {
          const payload = {
            date: addDays(booking.date, shift),
            time: booking.time,
            duration: booking.duration,
            format: booking.format,
            sector: booking.sector,
            listPrice: booking.listPrice,
            salePrice: booking.salePrice,
            price: booking.price,
            name: booking.name,
            phone: booking.phone,
            team: booking.team,
            source: "Повтор расписания",
            sourceDetail: `${booking.date} ${booking.time}`,
            status: "new",
            comment: `Повторено из ${booking.date} ${booking.time}`,
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
          <label className="form-field repeat-mode-field">
            <span>Сценарий</span>
            <select className="repeat-mode-select" value={mode} onChange={(event) => setMode(event.target.value as "once" | "month" | "until")}>
              <option value="once">Скопировать период один раз</option>
              <option value="month">Повторить на месяц</option>
              <option value="until">Продлить до даты</option>
            </select>
            <span aria-hidden="true" className="repeat-mode-caret" />
          </label>
          <label className="form-field">
            <span>Начать с даты</span>
            <input type="date" value={targetStart} onChange={(event) => setTargetStart(event.target.value)} />
          </label>
          {mode === "until" && (
            <label className="form-field editor-span-2">
              <span>Повторять до дата</span>
              <input type="date" value={untilDate} onChange={(event) => setUntilDate(event.target.value)} />
            </label>
          )}
        </div>
        <div className="repeat-preview">
          <strong>Исходных броней: {selectedSourceBookings.length} из {sourceBookings.length}</strong>
          <small>Все брони отмечены по умолчанию. Снимите галочки у тех, которые не нужно повторять.</small>
        </div>
        {sourceBookings.length > 0 && (
          <div className="repeat-source-list">
            {sourceBookings.map((booking) => (
              <div className={`repeat-source-row ${selectedBookingIds.includes(booking.id) ? "selected" : ""}`} key={booking.id}>
                <label className="schedule-item-label">
                  <input
                    checked={selectedBookingIds.includes(booking.id)}
                    onChange={() => toggleBookingSelection(booking.id)}
                    type="checkbox"
                  />
                  <span className="checkbox-label"></span>
                </label>
                <span className="repeat-source-content">
                  <strong>{booking.date} · {booking.time}-{bookingEndTime(booking.time, booking.duration)}</strong>
                  <span>{booking.name} · {formatLabel(booking.format)} · {booking.sector}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {result && <div className={`admin-booking-message ${result.includes("Создано") ? "success" : ""}`}>{result}</div>}
        <div className="repeat-actions">
          <button className="primary-button" disabled={working} type="submit">
            <CopyPlus size={16} /> {working ? "Копируем..." : "Повторить расписание"}
          </button>
        </div>
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
  onClick?: () => void;
  bookingId?: string;
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

function hoursBetween(fromIso: string, toIso: string) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return (to - from) / 3_600_000;
}

function occupiedUnits(booking: BookingRequest) {
  return booking.sector.split("+").filter(Boolean).length || (booking.format === "full" ? 4 : booking.format === "half" ? 2 : 1);
}

function AnalyticsDashboard({
  bookings,
  onOpenBooking,
  onOpenStatus,
  onOpenFilter,
  onOpenDate,
}: {
  bookings: BookingRequest[];
  onOpenBooking: (bookingId: string, fallbackStatus?: QueueStatus) => void;
  onOpenStatus: (status: QueueStatus, bookingId?: string) => void;
  onOpenFilter: (nextTab: Tab, nextQuery: string) => void;
  onOpenDate: (date: string) => void;
}) {
  const today = arenaDateValue();
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
    () => byBookingDate,
    [byBookingDate],
  );

  const confirmed = useMemo(
    () => byBookingDate.filter((item) => item.status === "confirmed"),
    [byBookingDate],
  );

  // All confirmed bookings regardless of date range — for debt/overdue tracking
  const allConfirmed = useMemo(
    () => allActive.filter((item) => item.status === "confirmed"),
    [allActive],
  );

  // Removed cancelled as per request
  // const cancelled = useMemo(
  //   () => byCreatedDate.filter((item) => item.status === "cancelled"),
  //   [byCreatedDate],
  // );

  const periodDays = daysBetween(range.from, range.to);
  const fieldHours = activeBooked.reduce((sum, item) => sum + (item.duration / 60) * occupiedUnits(item), 0);
  const totalCapacityHours = periodDays * 24 * 4;
  const utilizationRate = totalCapacityHours > 0 ? (fieldHours / totalCapacityHours) * 100 : 0;
  const revenue = confirmed.reduce((sum, item) => sum + (Number(item.salePrice || item.price) || 0), 0);
  const paid = confirmed.reduce((sum, item) => sum + (Number(item.prepayment) || 0), 0);
  const debt = allConfirmed.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
  const averageConfirmed = (list: BookingRequest[]) => {
    if (list.length === 0) return 0;
    const total = list.reduce((sum, item) => sum + (Number(item.salePrice || item.price) || 0), 0);
    return total / list.length;
  };
  const averageCheck = averageConfirmed(confirmed);
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
    };
    current.bookings += 1;
    current.revenue += Number(item.salePrice || item.price) || 0;
    current.paid += Number(item.prepayment) || 0;
    current.debt += Number(item.balance) || 0;
    current.lastDate = current.lastDate > item.date ? current.lastDate : item.date;
    current.sources.add(item.source || "Сайт");
    map.set(key, current);
    return map;
  }, new Map()).values());

  // All-time client aggregation for debt tracking (not limited to date range)
  const allClients = Array.from(allActive.reduce<Map<string, {
    phone: string;
    name: string;
    bookings: number;
    debt: number;
  }>>((map, item) => {
    if (item.status !== "confirmed") return map;
    const key = normalizePhone(item.phone) || item.id;
    const current = map.get(key) || {
      phone: item.phone,
      name: item.name,
      bookings: 0,
      debt: 0,
    };
    current.bookings += 1;
    current.debt += Number(item.balance) || 0;
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
      onClick: () => onOpenFilter("status:confirmed", client.name),
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
    onClick: () => onOpenFilter("status:confirmed", source.label),
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
      onClick: () => onOpenDate(date),
    }));

  const recipientRows: AnalyticsRow[] = aggregateRows(confirmed, (item) => item.paymentRecipient || "Не указан", (item) => Number(item.prepayment) || 0, true)
    .map((row) => ({ ...row, onClick: () => onOpenFilter("status:confirmed", row.label) }));
  const methodRows: AnalyticsRow[] = aggregateRows(confirmed, (item) => item.paymentMethod || "Не выбран", (item) => Number(item.prepayment) || 0, true)
    .map((row) => ({ ...row, onClick: () => onOpenFilter("status:confirmed", row.label) }));
  const formatRows: AnalyticsRow[] = aggregateRows(confirmed, (item) => formatLabel(item.format), (item) => Number(item.salePrice || item.price) || 0, true)
    .map((row) => ({ ...row, onClick: () => onOpenFilter("status:confirmed", row.label) }));
  const sectorRows: AnalyticsRow[] = aggregateRows(activeBooked, (item) => item.sector, (item) => item.duration / 60, false, "ч.")
    .map((row) => ({ ...row, onClick: () => onOpenFilter("schedule", row.label) }));
  const timeRows: AnalyticsRow[] = aggregateRows(activeBooked, (item) => item.time, (item) => item.duration / 60, false, "ч.")
    .map((row) => ({ ...row, onClick: () => onOpenFilter("schedule", row.label) }));

  const funnelCreated = byCreatedDate.length;
  const funnelConfirmed = byCreatedDate.filter((item) => item.status === "confirmed").length;
  const funnelPaid = byCreatedDate.filter((item) => item.status === "confirmed" && item.paymentStatus === "paid").length;
  // Removed cancelled from funnel as per request
  // const funnelCancelled = byCreatedDate.filter((item) => item.status === "cancelled").length;
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

  const overdueRows: AnalyticsRow[] = allConfirmed
    .filter((item) => item.balance > 0 && item.date <= today)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 8)
    .map((item) => ({
      label: item.name,
      value: formatPrice(item.balance),
      meta: `${item.date} · ${item.phone} · ${formatLabel(item.format)}`,
      tone: "danger",
      bookingId: item.id,
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
      bookingId: item.id,
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
      bookingId: item.id,
    }));

  const backdatedRows: AnalyticsRow[] = byCreatedDate
    .filter((item) => dateOnly(item.createdAt) > item.date)
    .slice(0, 8)
    .map((item) => ({
      label: item.name,
      value: `${item.date}`,
      meta: `Создано ${dateOnly(item.createdAt)} · ${item.time}`,
      tone: "neutral",
      bookingId: item.id,
    }));

  const noCommentCount = confirmed.filter((item) => !item.comment.trim()).length;

  const overdueRowsLinked = overdueRows.map((row) =>
    row.bookingId ? { ...row, onClick: () => onOpenBooking(row.bookingId!, "confirmed") } : row,
  );

  const discountRowsLinked = discountRows.map((row) =>
    row.bookingId ? { ...row, onClick: () => onOpenBooking(row.bookingId!, "confirmed") } : row,
  );

  const partialUpcomingRowsLinked = partialUpcomingRows.map((row) => {
    if (!row.bookingId) return row;
    const booking = activeBooked.find((b) => b.id === row.bookingId);
    return {
      ...row,
      onClick: () => onOpenBooking(row.bookingId!, booking?.status === "in_progress" ? "in_progress" : "confirmed"),
    };
  });

  const backdatedRowsLinked = backdatedRows.map((row) => {
    if (!row.bookingId) return row;
    const booking = byCreatedDate.find((b) => b.id === row.bookingId);
    return {
      ...row,
      onClick: () =>
        onOpenBooking(
          row.bookingId!,
          booking?.status === "cancelled"
            ? "cancelled"
            : booking?.status === "in_progress"
              ? "in_progress"
              : booking?.status === "new"
                ? "new"
                : "confirmed",
        ),
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

  const handleExport = async () => {
    try {
      const url = `/api/export?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `bookings_${range.from}_${range.to}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("Export failed", err);
    }
  };

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
            <button className="analytics-export-btn" onClick={handleExport} type="button" title="Скачать Excel">
              <Download size={16} /> Скачать XLSX
            </button>
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
            <AnalyticsListCard title="Скидки ниже прайса" rows={discountRowsLinked} />
            <AnalyticsListCard title="Долги клиентов" rows={overdueRowsLinked} />
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
              rows={Array.from(allClients).filter((client) => client.debt > 0).sort((a, b) => b.debt - a.debt).slice(0, 8).map((client) => ({
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
            {/* Removed Отменено as per request */}
            <AnalyticsStatCard label="До подтверждения" value={avgToConfirm ? hours(avgToConfirm) : "Нет данных"} hint="Среднее время реакции" />
            <AnalyticsStatCard label="До первой оплаты" value={avgToPayment ? hours(avgToPayment) : "Нет данных"} hint="От заявки до денег" />
          </div>
          <div className="analytics-tables">
            <AnalyticsListCard
              title="Статусы заявок"
              rows={[
                { label: "Новые", value: String(byCreatedDate.filter((item) => item.status === "new").length), meta: "Ожидают обработки", onClick: () => onOpenStatus("new") },
                { label: "В работе", value: String(byCreatedDate.filter((item) => item.status === "in_progress").length), meta: "На контроле администратора", onClick: () => onOpenStatus("in_progress") },
                { label: "Подтвержденные", value: String(byCreatedDate.filter((item) => item.status === "confirmed").length), meta: "Успешно проведены", onClick: () => onOpenStatus("confirmed") },
                /* Removed Отмененные as per request */
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
            <AnalyticsStatCard label="Задним числом" value={String(backdatedRows.length)} hint="Брони созданы после даты игры" />
          </div>
          <div className="analytics-tables analytics-tables-wide">
            <AnalyticsListCard title="Просроченные долги" rows={overdueRowsLinked} />
            <AnalyticsListCard title="Частично оплаченные ближайшие брони" rows={partialUpcomingRowsLinked} />
            <AnalyticsListCard title="Брони задним числом" rows={backdatedRowsLinked} />
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
      {rows.map((row) => {
        const content = (
          <>
            <div>
              <strong>{row.label}</strong>
              {row.meta && <small>{row.meta}</small>}
            </div>
            <span>{row.value}</span>
          </>
        );

        if (!row.onClick) {
          return (
            <div className={`analytics-row analytics-row-${row.tone || "neutral"}`} key={`${title}-${row.label}-${row.value}`}>
              {content}
            </div>
          );
        }

        return (
          <button
            className={`analytics-row analytics-row-${row.tone || "neutral"} analytics-row-button`}
            key={`${title}-${row.label}-${row.value}`}
            onClick={row.onClick}
            type="button"
          >
            {content}
          </button>
        );
      })}
    </section>
  );
}

function aggregateRows<T>(
  items: T[],
  label: (item: T) => string,
  metric: (item: T) => number,
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