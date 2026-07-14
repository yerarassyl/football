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
import { FormEvent, useEffect, useState } from "react";
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
const arenaPhone = "+7 700 200 40 02";
const arenaMapUrl = "https://2gis.kz/astana/search/%D0%A2%D1%83%D1%80%D0%B0%D0%BD%2090%D0%B0";

function formatDate(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export default function BookingPage() {
  const [format, setFormat] = useState<FieldFormat>("quarter");
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>(FIELD_OPTIONS);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [sector, setSector] = useState("A");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [team, setTeam] = useState("");
  const [source, setSource] = useState("Сайт");
  const [sourceDetail, setSourceDetail] = useState("");
  const [loading, setLoading] = useState(false);
  const [successId, setSuccessId] = useState("");
  const [occupiedByTime, setOccupiedByTime] = useState<Record<string, string[]>>({});
  const [photoOpen, setPhotoOpen] = useState(false);

  const option = fieldOptions.find((item) => item.id === format)!;
  const startTime = selectedTimes[0] || "";
  const duration = selectedTimes.length >= 2 ? selectedTimes.length * 30 : 0;
  const endTime = duration ? bookingEndTime(startTime, duration) : "";
  const totalPrice = Math.round(option.price * (duration / 60));
  const busySectors = Array.from(
    new Set(selectedTimes.flatMap((slot) => occupiedByTime[slot] || [])),
  );
  const startIndex = startTime ? TIME_SLOTS.indexOf(startTime) : -1;
  const maxDurationSlots = startIndex === -1
    ? 0
    : TIME_SLOTS.slice(startIndex).findIndex((slot) => slotIsBusy(slot)) === -1
      ? TIME_SLOTS.length - startIndex
      : TIME_SLOTS.slice(startIndex).findIndex((slot) => slotIsBusy(slot));
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
    if (format === "full") return occupied.length > 0;
    if (format === "half") {
      const leftBusy = occupied.includes("A") || occupied.includes("C");
      const rightBusy = occupied.includes("B") || occupied.includes("D");
      return leftBusy && rightBusy;
    }
    return ["A", "B", "C", "D"].every((item) => occupied.includes(item));
  }

  const availableSectors = SECTORS[format].map((item) => {
    const parts = item.id.split("+");
    return { ...item, busy: parts.some((part) => busySectors.includes(part)) };
  });

  function changeFormat(value: FieldFormat) {
    setFormat(value);
    setSector(SECTORS[value][0].id);
    setSelectedTimes([]);
  }

  function sectorForFieldPart(part: string) {
    if (format === "full") return "A+B+C+D";
    if (format === "half") return part === "A" || part === "C" ? "A+C" : "B+D";
    return part;
  }

  function chooseSectorFromField(part: string) {
    if (!duration) return;
    const nextSector = sectorForFieldPart(part);
    const option = availableSectors.find((item) => item.id === nextSector);
    if (!option || option.busy) return;
    setSector(nextSector);
  }

  function slotsBetween(start: string, end: string) {
    const startIndex = TIME_SLOTS.indexOf(start);
    const endIndex = TIME_SLOTS.indexOf(end);
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return [];
    return TIME_SLOTS.slice(startIndex, endIndex);
  }

  function canUseAsEnd(slot: string) {
    if (!startTime || selectedTimes.length !== 1) return false;
    const range = slotsBetween(startTime, slot);
    return range.length >= 2 && !range.some((item) => slotIsBusy(item));
  }

  function selectTime(slot: string) {
    const busy = slotIsBusy(slot);
    const selectableEnd = canUseAsEnd(slot);

    if (!startTime || selectedTimes.length >= 2) {
      if (busy) return;
      setSelectedTimes([slot]);
      return;
    }

    if (slot === startTime) {
      setSelectedTimes([]);
      return;
    }

    const startIndex = TIME_SLOTS.indexOf(startTime);
    const endIndex = TIME_SLOTS.indexOf(slot);
    if (endIndex <= startIndex) {
      if (busy) return;
      setSelectedTimes([slot]);
      return;
    }
    if (busy && !selectableEnd) return;

    const minEndIndex = startIndex + 2;
    const nextEnd = TIME_SLOTS[Math.max(endIndex, minEndIndex)];
    if (!nextEnd) {
      setSelectedTimes([startTime]);
      return;
    }

    const next = slotsBetween(startTime, nextEnd);
    if (next.length >= 2 && !next.some((item) => slotIsBusy(item))) {
      setSelectedTimes(next);
    }
  }

  function setTimeRange(slot: string, minutes = Math.max(duration, 60)) {
    const index = TIME_SLOTS.indexOf(slot);
    if (index === -1 || slotIsBusy(slot)) {
      setSelectedTimes([]);
      return;
    }

    const slotsCount = Math.max(2, Math.ceil(minutes / 30));
    const next = TIME_SLOTS.slice(index, index + slotsCount);
    if (next.length < slotsCount || next.some((item) => slotIsBusy(item))) {
      setSelectedTimes([slot]);
      return;
    }
    setSelectedTimes(next);
  }

  function changeDuration(minutes: number) {
    if (!startTime) return;
    setTimeRange(startTime, minutes);
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
    setPhone(`+7 ${digits.startsWith("7") ? digits.slice(1) : digits}`);
  }

  const valid =
    Boolean(startTime && duration >= 60 && sector && name.trim().length > 1) &&
    phone.replace(/\D/g, "").length >= 10 &&
    !availableSectors.find((item) => item.id === sector)?.busy;

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
          sector,
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
        setSelectedTimes([]);
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
          <a className="phone-link" href="tel:+77002004002"><Phone size={15} /> {arenaPhone}</a>
          <a className="phone-link" href="https://wa.me/77002004002" target="_blank" rel="noreferrer">WhatsApp</a>
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
              <a className="hero-pill" href="tel:+77002004002"><Phone size={12} /> {arenaPhone}</a>
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
                      <p>Красным отмечены уже занятые слоты</p>
                    </div>
                    <CalendarDays size={22} color="#176b45" />
                  </div>
                  <div className="date-time-part">
                    <div className="date-time-label"><CalendarDays size={17} /><strong>Дата</strong></div>
                    <CalendarPicker
                      value={selectedDate}
                      onChange={(date) => { setSelectedDate(date); setSelectedTimes([]); }}
                    />
                  </div>
                  <div className="date-time-part time-part">
                    <div className="date-time-label"><Clock3 size={17} /><strong>Время</strong><small>Минимум 1 час, шаг 30 минут. Можно выбрать несколько слотов подряд.</small></div>
                    <div className="time-picker-panel">
                      <div className="form-field">
                        <label htmlFor="start-time">Начало</label>
                        <select
                          id="start-time"
                          value={startTime}
                          onChange={(event) => setTimeRange(event.target.value, duration || 60)}
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
                    <div className="duration-quick-row">
                      {DURATION_OPTIONS.slice(0, 7).map((minutes) => (
                        <button
                          className={duration === minutes ? "selected" : ""}
                          disabled={!startTime || !durationOptions.includes(minutes)}
                          key={minutes}
                          onClick={() => changeDuration(minutes)}
                          type="button"
                        >
                          {formatDuration(minutes)}
                        </button>
                      ))}
                    </div>
                    <div className="slots-grid">
                      {TIME_SLOTS.map((slot) => {
                        const busy = slotIsBusy(slot);
                        const selectableEnd = canUseAsEnd(slot);
                        const isBoundary = endTime === slot;
                        const visuallyBusy = busy && !selectableEnd && !isBoundary;
                        return (
                          <button
                            className={`slot ${slot.endsWith(":30") ? "half-hour" : ""} ${selectedTimes.includes(slot) || isBoundary ? "selected" : ""} ${isBoundary ? "range-boundary" : ""} ${visuallyBusy ? "busy" : ""}`}
                            disabled={visuallyBusy}
                            key={slot}
                            onClick={() => selectTime(slot)}
                            type="button"
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <section className="section-block">
                  <div className="section-heading">
                    <div>
                      <div className="section-kicker">Шаг 3</div>
                      <h2>Выберите сектор</h2>
                      <p>{duration ? "Доступность для всех выбранных часов" : startTime ? "Теперь нажмите время окончания" : "Сначала выберите время игры"}</p>
                    </div>
                  </div>
                  <div className="field-select-layout">
                    <div className="field-visual">
                      {["A", "B", "C", "D"].map((item) => {
                        const fieldSector = sectorForFieldPart(item);
                        const option = availableSectors.find((sectorOption) => sectorOption.id === fieldSector);
                        const selected = sector.split("+").includes(item);
                        const busy = Boolean(option?.busy || busySectors.includes(item));
                        return (
                          <button
                            className={`field-sector ${busy ? "busy" : ""} ${selected ? "selected" : ""}`}
                            disabled={!duration || busy}
                            key={item}
                            onClick={() => chooseSectorFromField(item)}
                            type="button"
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                    <div className="sector-options">
                      {availableSectors.map((item) => (
                        <button
                          className={`sector-option ${sector === item.id ? "selected" : ""}`}
                          disabled={!duration || item.busy}
                          key={item.id}
                          onClick={() => setSector(item.id)}
                          type="button"
                        >
                          <span>
                            {sector === item.id && !item.busy ? <CheckCircle2 size={17} /> : <span style={{ width: 17 }} />}
                            {item.label}
                          </span>
                          <small>{item.busy ? "Занято" : "Свободно"}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  {startTime && (
                    <div className="inline-price-total">
                      <span>{formatDuration(duration)} · {startTime}–{bookingEndTime(startTime, duration)}</span>
                      <strong>{formatPrice(totalPrice)}</strong>
                    </div>
                  )}
                </section>

                <section className="section-block">
                  <div className="section-heading">
                    <div>
                      <div className="section-kicker">Шаг 4</div>
                      <h2>Контактные данные</h2>
                      <p>Администратор позвонит для подтверждения заявки</p>
                    </div>
                    <UserRound size={22} color="#176b45" />
                  </div>
                  <div className="contact-grid">
                    <div className="form-field">
                      <label htmlFor="name">Имя *</label>
                      <input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Как к вам обращаться" />
                    </div>
                    <div className="form-field">
                      <label htmlFor="phone">Телефон *</label>
                      <input id="phone" value={phone} onFocus={() => !phone && setPhone("+7 ")} onChange={(event) => changePhone(event.target.value)} placeholder="+7 (___) ___-__-__" type="tel" />
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
                  <div className="summary-row"><span>Сектор</span><strong>{sector}</strong></div>
                  <div className="summary-total"><span>Стоимость</span><strong>{formatPrice(totalPrice)}</strong></div>
                  <button className="primary-button" disabled={!valid || loading} type="submit">
                    {loading ? "Отправляем..." : "Подтвердить заявку"} {!loading && <ArrowRight size={16} />}
                  </button>
                  <p className="fine-print">
                    Нажимая кнопку, вы соглашаетесь на обработку персональных данных.
                    Заявка не является подтверждённой бронью.
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
