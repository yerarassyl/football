"use client";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Phone,
  ShieldCheck,
  Trophy,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { DURATION_OPTIONS, FIELD_OPTIONS, FieldOption, formatPrice, SECTORS, TIME_SLOTS } from "@/lib/constants";
import { normalizeReferralSource, referralDetail } from "@/lib/referrals";
import { FieldFormat } from "@/lib/types";
import { arenaDateValue, bookingEndTime, formatDuration } from "@/lib/time";
import CalendarPicker from "./CalendarPicker";

const months = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const todayIso = arenaDateValue();
const arenaPhone = "+7 702 753 75 14";
const arenaMapUrl = "https://2gis.kz/astana/search/%D0%A2%D1%83%D1%80%D0%B0%D0%BD%2090%D0%B0";

function formatDate(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export default function BookingPage() {
  const [format, setFormat] = useState<FieldFormat>("quarter");
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>(FIELD_OPTIONS);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [team, setTeam] = useState("");
  const [source, setSource] = useState("Сайт");
  const [sourceDetail, setSourceDetail] = useState("");
  const [loading, setLoading] = useState(false);
  const [successId, setSuccessId] = useState("");
  const [occupiedByTime, setOccupiedByTime] = useState<Record<string, string[]>>({});
  const [photoOpen, setPhotoOpen] = useState(false);
  const selectedSlots = useMemo(() => {
    if (!startTime || !duration || duration < 60) return [];
    const count = Math.ceil(duration / 30);
    const idx = TIME_SLOTS.indexOf(startTime);
    if (idx === -1) return [];
    return Array.from({ length: count }, (_, i) => TIME_SLOTS[(idx + i) % TIME_SLOTS.length]);
  }, [startTime, duration]);

  const autoSector = useMemo(() => {
    const busySet = new Set(selectedSlots.flatMap((slot) => occupiedByTime[slot] || []));
    const available = SECTORS[format].filter((s) => {
      const parts = s.id.split("+");
      return !parts.some((p) => busySet.has(p));
    });
    return (available[0] || SECTORS[format][0]).id;
  }, [format, occupiedByTime, selectedSlots]);

  // Helper functions for phone number detection and formatting
  function isPhoneNumber(value: string): boolean {
    if (!value) return false;
    // Remove common separators and check if it's mostly digits
    const digitsOnly = value.replace(/\D/g, '');
    // Check if it looks like a Russian phone number: starts with 7, 8, or +7 and has 10-11 digits
    const cleaned = value.replace(/[\s\-\(\)]/g, '');
    return (/^\+?7\d{10}$/.test(cleaned) ||
            /^\+?7\d{11}$/.test(cleaned) ||
            /^8\d{10}$/.test(cleaned) ||
            /^8\d{11}$/.test(cleaned) ||
            (value.trim().startsWith('+7') && digitsOnly.length >= 10 && digitsOnly.length <= 11));
  }

  function formatPhoneNumber(value: string): string {
    if (!value) return "+7 ";
    const trimmed = value.trim();
    if (!trimmed || trimmed === "+") {
      return "+7 ";
    }
    if (trimmed.startsWith("+7")) {
      return trimmed;
    }
    const digits = value.replace(/\D/g, "");
    return `+7 ${digits.startsWith("7") ? digits.slice(1) : digits}`;
  }

  function isLikelyName(value: string): boolean {
    if (!value) return false;
    // Check if it contains at least one letter (Cyrillic or Latin)
    return /[а-яёa-zё]/.test(value.toLowerCase());
  }

  // --- End of helpers ---

  const option = fieldOptions.find((item) => item.id === format)!;
  const endTime = duration && startTime ? bookingEndTime(startTime, duration) : "";
  const totalPrice = Math.round(option.price * (duration / 60));
  const busySectors = Array.from(
    new Set(selectedSlots.flatMap((slot) => occupiedByTime[slot] || [])),
  );
  const startIndex = startTime ? TIME_SLOTS.indexOf(startTime) : -1;
  const nextBusy = startIndex === -1 ? null : TIME_SLOTS.slice(startIndex).findIndex((slot) => slotIsBusy(slot));
  const maxDurationSlots = nextBusy === -1 || nextBusy === null
    ? TIME_SLOTS.length
    : nextBusy;
  const durationOptions = DURATION_OPTIONS.filter((minutes) => minutes / 30 <= maxDurationSlots);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const querySource = params.get("source") || params.get("utm_source") || params.get("ref");
    const campaign = params.get("campaign") || params.get("utm_campaign");
    const queryDetail = params.get("source_detail");
    const cookieSource = document.cookie
      .split("; ")
      .find((item) => item.startsWith("air_arena_source="))
      ?.split("=")[1];
    const cookieDetail = document.cookie
      .split("; ")
      .find((item) => item.startsWith("air_arena_source_detail="))
      ?.split("=")[1];
    const storedSource = window.localStorage.getItem("air_arena_source");
    const storedDetail = window.localStorage.getItem("air_arena_source_detail");

    const nextSource = normalizeReferralSource(
      querySource || (cookieSource ? decodeURIComponent(cookieSource) : "") || storedSource || "Сайт",
    );
    const nextDetail =
      queryDetail ||
      referralDetail(querySource || "", campaign || "") ||
      (cookieDetail ? decodeURIComponent(cookieDetail) : "") ||
      storedDetail ||
      "";

    setSource(nextSource);
    setSourceDetail(nextDetail);
    window.localStorage.setItem("air_arena_source", nextSource);
    window.localStorage.setItem("air_arena_source_detail", nextDetail);
  }, []);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((response) => response.json())
      .then((settings: { prices?: Record<FieldFormat, number> }) => {
        setFieldOptions((options) =>
          options.map((item) => ({
            ...item,
            price: settings.prices?.[item.id] ?? item.price,
          })),
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!photoOpen) return;
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") setPhotoOpen(false);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [photoOpen]);

  async function loadAvailability() {
    const response = await fetch(`/api/availability?date=${selectedDate}`, {
      cache: "no-store",
    });
    const items = (await response.json()) as Array<{ time: string; sector: string }>;
    if (!Array.isArray(items)) return;
    const grouped: Record<string, string[]> = {};
    items.forEach((item) => {
      grouped[item.time] = Array.from(
        new Set([...(grouped[item.time] || []), ...item.sector.split("+")]),
      );
    });
    setOccupiedByTime(grouped);
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/availability?date=${selectedDate}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((items: Array<{ time: string; sector: string }>) => {
        if (!active || !Array.isArray(items)) return;
        const grouped: Record<string, string[]> = {};
        items.forEach((item) => {
          grouped[item.time] = Array.from(new Set([...(grouped[item.time] || []), ...item.sector.split("+")]));
        });
        setOccupiedByTime(grouped);
      })
      .catch(() => setOccupiedByTime({}));
    return () => { active = false; };
  }, [selectedDate]);

  function slotIsBusy(slot: string) {
    const occupied = occupiedByTime[slot] || [];
    return autoSector.split("+").some((p) => occupied.includes(p));
  }

  function changeFormat(value: FieldFormat) {
    setFormat(value);
    setStartTime("");
    setDuration(0);
  }

  function handleStartChange(slot: string) {
    if (!slot) {
      setStartTime("");
      setDuration(0);
      return;
    }
    const idx = TIME_SLOTS.indexOf(slot);
    if (idx === -1 || slotIsBusy(slot)) return;
    setStartTime(slot);
    // Keep existing duration if it still fits, otherwise reset
    if (duration >= 60) {
      const slotsNeeded = Math.ceil(duration / 30);
      const range: string[] = [];
      for (let i = 0; i < slotsNeeded; i++) {
        range.push(TIME_SLOTS[(idx + i) % TIME_SLOTS.length]);
      }
      if (range.some((s) => slotIsBusy(s))) {
        setDuration(0);
      }
    }
  }

  function changeDuration(minutes: number) {
    setDuration(minutes);
  }

  function changePhone(value: string) {
    setPhone(formatPhoneNumber(value));
  }

  const valid =
    Boolean(startTime && duration >= 60 && autoSector && name.trim().length > 1) &&
    phone.replace(/\D/g, "").length >= 10;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setLoading(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          time: startTime,
          duration,
          format,
          sector: autoSector,
          price: totalPrice,
          name,
          phone,
          team,
          source,
          sourceDetail,
        }),
      });
      if (response.status === 409) {
        await loadAvailability();
        setStartTime("");
        setDuration(0);
        alert("Это время уже занято другой заявкой. Выберите свободные часы.");
        return;
      }
      if (!response.ok) throw new Error("Не удалось отправить заявку");
      const data = await response.json();
      setSuccessId(data.id);
      window.scrollTo({ top: 320, behavior: "smooth" });
    } catch {
      alert("Не удалось отправить заявку. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#">
          <span className="brand-mark"><Trophy size={18} /></span>
          Air Arena
        </a>
        <div className="header-actions">
          <a className="phone-link" href="tel:+77027537514"><Phone size={15} /> {arenaPhone}</a>
          <a className="phone-link" href="https://wa.me/77027537514" target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-inner">
            <h1>Air Arena</h1>
            <p>
              Выберите удобный формат, дату и время. Мы проверим заявку и
              перезвоним для подтверждения брони.
            </p>
            <div className="hero-pills">
              <a className="hero-pill" href={arenaMapUrl} target="_blank" rel="noreferrer"><MapPin size={12} /> Астана, ул. Туран, 90а</a>
              <span className="hero-pill"><Clock3 size={12} /> Ежедневно 24/7</span>
              <a className="hero-pill" href="tel:+77027537514"><Phone size={12} /> {arenaPhone}</a>
            </div>
          </div>
        </section>

        <form className="booking-shell" onSubmit={submit}>
          <section className="arena-location-card">
            <button className="arena-photo-button" onClick={() => setPhotoOpen(true)} type="button">
              <Image
                src="/arena/arena-aerial-rotated.jpg"
                alt="AIR ARENA снаружи"
                width={1200}
                height={2133}
                sizes="(max-width: 760px) 100vw, 380px"
                priority
              />
              <span>Нажмите, чтобы рассмотреть</span>
            </button>
            <div>
              <div className="section-kicker">Крытая арена</div>
              <h2>Большое поле под куполом</h2>
              <p>Комфортная игра 24/7 в любую погоду.</p>
            </div>
          </section>

          <div className="progress-card">
            {[
              ["1", "Формат"],
              ["2", "Дата и время"],
              ["3", "Сектор"],
              ["4", "Контакты"],
            ].map(([number, label], index) => (
              <div className={`progress-step ${index <= (startTime ? 3 : 1) ? "active" : ""}`} key={number}>
                <span className="step-number">{number}</span><span>{label}</span>
              </div>
            ))}
          </div>

          {successId ? (
            <div className="booking-main success-panel">
              <div className="success-icon"><CheckCircle2 size={35} /></div>
              <h2>Заявка отправлена</h2>
              <p>
                Администратор проверит доступность поля и свяжется с вами по
                указанному номеру для подтверждения и оплаты.
              </p>
              <div className="success-code">Номер заявки: {successId}</div>
              <br />
              <button className="secondary-button" type="button" onClick={() => setSuccessId("")}>
                Создать ещё одну заявку
              </button>
            </div>
          ) : (
            <div className="booking-grid">
              <div className="booking-main">
                <section className="section-block">
                  <div className="section-heading">
                    <div>
                      <div className="section-kicker">Шаг 1</div>
                      <h2>Выберите формат поля</h2>
                      <p>Стоимость указана за один час</p>
                    </div>
                  </div>
                  <div className="format-grid">
                    {fieldOptions.map((item) => (
                      <button
                        className={`format-card ${format === item.id ? "selected" : ""}`}
                        key={item.id}
                        onClick={() => changeFormat(item.id)}
                        type="button"
                      >
                        <span className="format-icon"><Trophy size={19} /></span>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                        <span className="format-price">{formatPrice(item.price)} <em>/ час</em></span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="section-block">
                  <div className="section-heading">
                    <div>
                      <div className="section-kicker">Шаг 2</div>
                      <h2>Дата и время</h2>
                      <p>Выберите удобное время для игры</p>
                    </div>
                    <CalendarDays size={22} color="#176b45" />
                  </div>
                  <div className="date-time-part">
                    <div className="date-time-label"><CalendarDays size={17} /><strong>Дата</strong></div>
                    <CalendarPicker
                      value={selectedDate}
                      onChange={(date) => { setSelectedDate(date); setStartTime(""); setDuration(0); }}
                    />
                  </div>
                  <div className="date-time-part time-part">
                    <div className="date-time-label"><Clock3 size={17} /><strong>Время</strong><small>Минимум 1 час, шаг 30 минут</small></div>
                    <div className="time-picker-panel">
                      <div className="form-field">
                        <label htmlFor="start-time">Начало</label>
                        <select
                          id="start-time"
                          value={startTime}
                          onChange={(event) => handleStartChange(event.target.value)}
                        >
                          <option value="">Выберите время</option>
                          {TIME_SLOTS.map((slot, index) => (
                            <option disabled={slotIsBusy(slot) || index > TIME_SLOTS.length - 2} key={slot} value={slot}>
                              {slot}{slotIsBusy(slot) ? " · занято" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-field">
                        <label htmlFor="duration">Длительность</label>
                        <select
                          disabled={!startTime}
                          id="duration"
                          value={duration || 60}
                          onChange={(event) => changeDuration(Number(event.target.value))}
                        >
                          {durationOptions.length === 0 && <option value={60}>Нет доступного интервала</option>}
                          {durationOptions.map((minutes) => (
                            <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="section-block">
                  <div className="section-heading">
                    <div>
                      <div className="section-kicker">Шаг 3</div>
                      <h2>Контактные данные</h2>
                      <p>Администратор позвонит для подтверждения заявки</p>
                    </div>
                    <UserRound size={22} color="#176b45" />
                  </div>
                  <div className="contact-grid">
                    <div className="form-field">
                      <label htmlFor="name">Имя *</label>
                      <input id="name" value={name} onChange={(event) => {
                        const value = event.target.value;
                        if (isPhoneNumber(value)) {
                          // Looks like a phone number, move to phone field
                          setPhone(formatPhoneNumber(value));
                          setName('');
                          return;
                        }
                        setName(value);
                      }} placeholder="Как к вам обращаться" />
                    </div>
                    <div className="form-field">
                      <label htmlFor="phone">Телефон *</label>
                      <input id="phone" value={phone} onFocus={() => !phone && setPhone("+7 ")} onChange={(event) => {
                        const value = event.target.value;
                        // If it looks like a name (not a phone number), move to name field
                        if (isLikelyName(value) && !isPhoneNumber(value)) {
                          setName(value);
                          setPhone("+7 ");
                          return;
                        }
                        changePhone(value);
                      }} placeholder="+7 (___) ___-__-__" type="tel" />
                    </div>
                    <div className="form-field full">
                      <label htmlFor="team">Компания или команда</label>
                      <input id="team" value={team} onChange={(event) => setTeam(event.target.value)} placeholder="Например, ФК Восток" />
                    </div>
                  </div>
                </section>
              </div>

              <aside className="summary-card">
                <div className="summary-top">
                  <small>Ваша заявка</small>
                  <h3>{option.shortLabel}</h3>
                </div>
                <div className="summary-body">
                  <div className="summary-row"><span>Дата</span><strong>{formatDate(selectedDate)}</strong></div>
                  <div className="summary-row"><span>Время</span><strong>{startTime ? `${startTime}–${bookingEndTime(startTime, duration)}` : "Не выбрано"}</strong></div>
                  <div className="summary-row"><span>Длительность</span><strong>{duration ? formatDuration(duration) : "Не выбрано"}</strong></div>
                  <div className="summary-row"><span>Сектор</span><strong>{autoSector || "—"}</strong></div>
                  <div className="summary-total"><span>Стоимость</span><strong>{formatPrice(totalPrice)}</strong></div>
                  <button className="primary-button" disabled={!valid || loading} type="submit">
                    {loading ? "Отправляем..." : "Подтвердить заявку"} {!loading && <ArrowRight size={16} />}
                  </button>
                  <p className="fine-print">
                    Нажимая кнопку, вы соглашаетесь на обработку персональных данных.
                    Заявка не является подтверждённой бронью.
                  </p>
                  <p className="fine-print" style={{marginTop: 10}}>
                    Сектор поля: {SECTORS[format].find((s) => s.id === autoSector)?.label || autoSector}
                  </p>
                  <div className="field-visual" style={{justifyContent: "center", marginTop: 6}}>
                    {["A", "B", "C", "D"].map((item) => {
                      const selected = autoSector.split("+").includes(item);
                      const busy = busySectors.includes(item);
                      return (
                        <span
                          className={`field-sector ${busy ? "busy" : ""} ${selected ? "selected" : ""}`}
                          key={item}
                        >
                          {item}
                        </span>
                      );
                    })}
                  </div>
                  <p className="fine-print fine-print-muted">
                    Сектор назначается автоматически по формату поля
                  </p>
                </div>
              </aside>
            </div>
          )}
        </form>
      </main>

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Air Arena</span>
        <span><ShieldCheck size={12} style={{ verticalAlign: "middle", marginRight: 5 }} /> Безопасное бронирование</span>
      </footer>

      {photoOpen && (
        <div className="photo-modal" role="dialog" aria-modal="true" aria-label="Фото AIR ARENA" onClick={() => setPhotoOpen(false)}>
          <button className="photo-modal-close" onClick={() => setPhotoOpen(false)} type="button">Закрыть</button>
          <Image
            src="/arena/arena-aerial-rotated.jpg"
            alt="AIR ARENA снаружи крупным планом"
            width={1200}
            height={2133}
            sizes="100vw"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
