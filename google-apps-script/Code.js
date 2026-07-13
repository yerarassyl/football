const SHEET_NAME = "Брони";
const TELEGRAM_SHEET_NAME = "Telegram админы";
const SETTINGS_SHEET_NAME = "Настройки";
const HEADERS = [
  "ID",
  "Создано",
  "Дата",
  "Время",
  "Длительность",
  "Формат",
  "Сектор",
  "Стоимость по прайсу",
  "Фактическая стоимость",
  "Имя",
  "Телефон",
  "Команда",
  "Канал привлечения",
  "Метка ссылки",
  "Статус",
  "Статус оплаты",
  "Предоплата",
  "Остаток к оплате",
  "Способ оплаты",
  "Получатель платежа",
  "Дата оплаты",
  "Комментарий",
  "Удалено",
  "История оплат JSON",
  "Обновлено",
  "Подтверждено",
  "Отменено",
];
const STATUSES = ["new", "in_progress", "confirmed", "cancelled", "deleted"];
const QUARTERS = ["A", "B", "C", "D"];

function doGet(event) {
  try {
    authorize_(event.parameter.secret);
    return json_({ ok: true, bookings: readBookings_() });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function doPost(event) {
  try {
    const body = JSON.parse(event.postData.contents || "{}");
    authorize_(body.secret);

    if (body.action === "create") {
      const booking = enrichBooking_(body.booking);
      appendBooking_(booking);
      return json_({ ok: true, booking });
    }

    if (body.action === "createIfAvailable") {
      const booking = enrichBooking_(body.booking);
      ensureNoConflict_(booking);
      appendBooking_(booking);
      return json_({ ok: true, booking });
    }

    if (body.action === "update") {
      const booking = updateBooking_(body.id, body.patch);
      return json_({ ok: true, booking });
    }

    if (body.action === "delete") {
      deleteBooking_(body.id);
      return json_({ ok: true });
    }

    if (body.action === "registerTelegramChat") {
      registerTelegramChat_(body.chat);
      return json_({ ok: true });
    }

    if (body.action === "listTelegramChats") {
      return json_({ ok: true, chats: readTelegramChats_() });
    }

    if (body.action === "getSettings") {
      return json_({ ok: true, settings: readSettings_() });
    }

    if (body.action === "updateSettings") {
      writeSettings_(body.settings);
      return json_({ ok: true, settings: readSettings_() });
    }

    throw new Error("Неизвестное действие");
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function seedTestBookings() {
  const existing = readBookings_();
  const byId = {};
  existing.forEach((booking) => {
    byId[booking.id] = booking;
  });

  const seeds = [
    makeSeedBooking_({
      id: "SEED-202607-01",
      createdAt: "2026-07-02T05:10:00.000Z",
      date: "2026-07-05",
      time: "19:00",
      duration: 120,
      format: "half",
      sector: "A+B",
      listPrice: 70000,
      salePrice: 68000,
      name: "Азамат Бейсеков",
      phone: "+7 701 100-10-01",
      team: "Nomad Stars",
      source: "Instagram",
      sourceDetail: "seed-july-2026-overdue-1",
      status: "confirmed",
      comment: "Постоянный клиент, нужен повторный звонок по долгу",
      confirmedAt: "2026-07-02T06:00:00.000Z",
      payments: [{ id: "PAY-SEED-01", amount: 20000, date: "2026-07-02", method: "Kaspi QR", recipient: "ТОО AIR ARENA" }],
    }),
    makeSeedBooking_({
      id: "SEED-202607-02",
      createdAt: "2026-07-03T08:30:00.000Z",
      date: "2026-07-06",
      time: "21:00",
      duration: 90,
      format: "quarter",
      sector: "C",
      listPrice: 35000,
      salePrice: 32000,
      name: "Руслан Алиев",
      phone: "+7 701 100-10-02",
      team: "FC Orbita",
      source: "2GIS",
      sourceDetail: "seed-july-2026-overdue-2",
      status: "confirmed",
      comment: "Скидка за позднее время",
      confirmedAt: "2026-07-03T09:00:00.000Z",
      payments: [],
    }),
    makeSeedBooking_({
      id: "SEED-202607-03",
      createdAt: "2026-07-10T07:00:00.000Z",
      date: "2026-07-14",
      time: "18:00",
      duration: 120,
      format: "full",
      sector: "A+B+C+D",
      listPrice: 150000,
      salePrice: 150000,
      name: "Данияр Садыков",
      phone: "+7 701 100-10-03",
      team: "Alem United",
      source: "Сайт",
      sourceDetail: "seed-july-2026-today",
      status: "confirmed",
      comment: "Матч корпоративной лиги",
      confirmedAt: "2026-07-10T08:20:00.000Z",
      payments: [
        { id: "PAY-SEED-03-1", amount: 50000, date: "2026-07-10", method: "Kaspi QR", recipient: "ТОО AIR ARENA" },
        { id: "PAY-SEED-03-2", amount: 50000, date: "2026-07-13", method: "Банковский перевод", recipient: "ТОО AIR ARENA" },
      ],
    }),
    makeSeedBooking_({
      id: "SEED-202607-04",
      createdAt: "2026-07-11T10:15:00.000Z",
      date: "2026-07-15",
      time: "20:00",
      duration: 60,
      format: "half",
      sector: "C+D",
      listPrice: 70000,
      salePrice: 70000,
      name: "Ермек Толеуов",
      phone: "+7 701 100-10-04",
      team: "Steppe Wolves",
      source: "WhatsApp",
      sourceDetail: "seed-july-2026-upcoming-deposit",
      status: "confirmed",
      comment: "Нужно дожать остаток до игры",
      confirmedAt: "2026-07-11T10:40:00.000Z",
      payments: [{ id: "PAY-SEED-04", amount: 30000, date: "2026-07-11", method: "Наличные", recipient: "ИП AIR ARENA" }],
    }),
    makeSeedBooking_({
      id: "SEED-202607-05",
      createdAt: "2026-07-12T12:00:00.000Z",
      date: "2026-07-16",
      time: "19:30",
      duration: 90,
      format: "quarter",
      sector: "A",
      listPrice: 52500,
      salePrice: 50000,
      name: "Мадина Исаева",
      phone: "+7 701 100-10-05",
      team: "Queens FC",
      source: "Instagram",
      sourceDetail: "seed-july-2026-in-progress-1",
      status: "in_progress",
      comment: "Ждём подтверждение состава команды",
      payments: [{ id: "PAY-SEED-05", amount: 10000, date: "2026-07-12", method: "Kaspi QR", recipient: "ТОО AIR ARENA" }],
    }),
    makeSeedBooking_({
      id: "SEED-202607-06",
      createdAt: "2026-07-12T13:10:00.000Z",
      date: "2026-07-17",
      time: "18:30",
      duration: 60,
      format: "quarter",
      sector: "B",
      listPrice: 35000,
      salePrice: 35000,
      name: "Арман Касымов",
      phone: "+7 701 100-10-06",
      team: "Kaspi Team",
      source: "Рекомендация",
      sourceDetail: "seed-july-2026-in-progress-2",
      status: "in_progress",
      comment: "Администратор уточняет формат игры",
      payments: [],
    }),
    makeSeedBooking_({
      id: "SEED-202607-07",
      createdAt: "2026-07-13T07:45:00.000Z",
      date: "2026-07-18",
      time: "21:00",
      duration: 120,
      format: "half",
      sector: "A+B",
      listPrice: 140000,
      salePrice: 135000,
      name: "Тимур Абенов",
      phone: "+7 701 100-10-07",
      team: "Tech Park",
      source: "Google",
      sourceDetail: "seed-july-2026-new-1",
      status: "new",
      comment: "Новая заявка с сайта, нужен первый контакт",
      payments: [],
    }),
    makeSeedBooking_({
      id: "SEED-202607-08",
      createdAt: "2026-07-13T09:20:00.000Z",
      date: "2026-07-19",
      time: "17:00",
      duration: 60,
      format: "quarter",
      sector: "D",
      listPrice: 35000,
      salePrice: 35000,
      name: "Айсулу Жумабек",
      phone: "+7 701 100-10-08",
      team: "Moms League",
      source: "Telegram",
      sourceDetail: "seed-july-2026-new-2",
      status: "new",
      comment: "Просила обратный звонок после 16:00",
      payments: [],
    }),
    makeSeedBooking_({
      id: "SEED-202607-09",
      createdAt: "2026-07-08T06:00:00.000Z",
      date: "2026-07-11",
      time: "20:30",
      duration: 90,
      format: "half",
      sector: "C+D",
      listPrice: 105000,
      salePrice: 98000,
      name: "Нуртас Есимов",
      phone: "+7 701 100-10-09",
      team: "West Eagles",
      source: "Instagram",
      sourceDetail: "seed-july-2026-cancelled-1",
      status: "cancelled",
      comment: "Отменил в день игры",
      cancelledAt: "2026-07-10T14:15:00.000Z",
      payments: [{ id: "PAY-SEED-09", amount: 15000, date: "2026-07-08", method: "Kaspi QR", recipient: "ТОО AIR ARENA" }],
    }),
    makeSeedBooking_({
      id: "SEED-202607-10",
      createdAt: "2026-07-09T11:45:00.000Z",
      date: "2026-07-12",
      time: "18:00",
      duration: 60,
      format: "quarter",
      sector: "A",
      listPrice: 35000,
      salePrice: 33000,
      name: "Нуртас Есимов",
      phone: "+7 701 100-10-09",
      team: "West Eagles",
      source: "Instagram",
      sourceDetail: "seed-july-2026-cancelled-2",
      status: "cancelled",
      comment: "Повторная отмена, клиент в зоне риска",
      cancelledAt: "2026-07-11T05:30:00.000Z",
      payments: [],
    }),
    makeSeedBooking_({
      id: "SEED-202607-11",
      createdAt: "2026-07-07T08:00:00.000Z",
      date: "2026-07-09",
      time: "17:30",
      duration: 120,
      format: "half",
      sector: "A+B",
      listPrice: 140000,
      salePrice: 140000,
      name: "Сергей Поляков",
      phone: "+7 701 100-10-11",
      team: "Rising Sun",
      source: "Администратор",
      sourceDetail: "seed-july-2026-trash-1",
      status: "deleted",
      comment: "Удалено после переноса в другой слот",
      deletedAt: "2026-07-09T12:00:00.000Z",
      payments: [{ id: "PAY-SEED-11", amount: 50000, date: "2026-07-08", method: "Наличные", recipient: "ИП AIR ARENA" }],
    }),
    makeSeedBooking_({
      id: "SEED-202607-12",
      createdAt: "2026-07-06T09:10:00.000Z",
      date: "2026-07-08",
      time: "19:00",
      duration: 60,
      format: "quarter",
      sector: "C",
      listPrice: 35000,
      salePrice: 35000,
      name: "Жанна Муханова",
      phone: "+7 701 100-10-12",
      team: "Friends Mix",
      source: "Сайт",
      sourceDetail: "seed-july-2026-trash-2",
      status: "deleted",
      comment: "Клиент попросил убрать бронь, данные сохраняем",
      deletedAt: "2026-07-07T13:40:00.000Z",
      payments: [],
    }),
  ];

  let created = 0;
  let updated = 0;

  seeds.forEach((booking) => {
    if (byId[booking.id]) {
      updateBooking_(booking.id, booking);
      updated += 1;
    } else {
      appendBooking_(booking);
      created += 1;
    }
  });

  return {
    created,
    updated,
    total: seeds.length,
  };
}

function makeSeedBooking_(booking) {
  return enrichBooking_(Object.assign({
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    confirmedAt: "",
    cancelledAt: "",
    deletedAt: "",
    price: Number(booking.salePrice || booking.price || booking.listPrice) || 0,
    listPrice: Number(booking.listPrice || booking.price || booking.salePrice) || 0,
    salePrice: Number(booking.salePrice || booking.price || booking.listPrice) || 0,
    source: "Сайт",
    sourceDetail: "",
    status: "new",
    paymentMethod: "Не выбран",
    paymentRecipient: "Не выбран",
    paidAt: "",
    comment: "",
    payments: [],
  }, booking));
}

function authorize_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!expected || secret !== expected) throw new Error("Нет доступа");
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("Не задано свойство SPREADSHEET_ID");
  return SpreadsheetApp.openById(spreadsheetId);
}

function getSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  const currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (currentHeaders.join("|") !== HEADERS.join("|")) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readBookings_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues().map(fromRow_);
}

function appendBooking_(booking) {
  getSheet_().appendRow(toRow_(booking));
}

function updateBooking_(id, patch) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("Бронь не найдена");

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const index = rows.findIndex((row) => text_(row[0]).replace(/^'/, "") === String(id));
  if (index === -1) throw new Error("Бронь не найдена");

  const bookings = rows.map(fromRow_);
  const lifecyclePatch = applyLifecyclePatch_(bookings[index], patch || {});
  const updated = enrichBooking_(Object.assign({}, bookings[index], lifecyclePatch, { id }));
  ensureNoConflict_(updated, id, bookings);
  sheet.getRange(index + 2, 1, 1, HEADERS.length).setValues([toRow_(updated)]);
  return updated;
}

function deleteBooking_(id) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("Бронь не найдена");

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const index = rows.findIndex((row) => text_(row[0]).replace(/^'/, "") === String(id));
  if (index === -1) throw new Error("Бронь не найдена");
  sheet.deleteRow(index + 2);
}

function ensureNoConflict_(booking, ignoredId, sourceBookings) {
  const bookings = sourceBookings || readBookings_();
  const conflict = bookings.find((item) => hasConflict_(item, booking, ignoredId));
  if (conflict) throw new Error(conflictMessage_(conflict));
}

function hasConflict_(existing, booking, ignoredId) {
  if (existing.id === ignoredId || existing.id === booking.id) return false;
  if (existing.date !== text_(booking.date).replace(/^'/, "")) return false;
  if (existing.status === "cancelled" || existing.status === "deleted") return false;

  const existingSlots = bookingSlots_(existing.time, existing.duration);
  const candidateSlots = bookingSlots_(booking.time, booking.duration);
  const intersectsByTime = existingSlots.some((slot) => candidateSlots.indexOf(slot) !== -1);
  if (!intersectsByTime) return false;

  const existingParts = occupiedParts_(existing.format, existing.sector);
  const candidateParts = occupiedParts_(booking.format, booking.sector);
  return existingParts.some((part) => candidateParts.indexOf(part) !== -1);
}

function occupiedParts_(format, sector) {
  const parts = text_(sector)
    .split("+")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => QUARTERS.indexOf(part) !== -1);

  if (text_(format) === "full") return QUARTERS.slice();
  if (parts.length > 0) return Array.from(new Set(parts));
  return text_(format) === "half" ? ["A", "B"] : ["A"];
}

function conflictMessage_(booking) {
  return "Конфликт с бронью " +
    booking.time + "-" + bookingEndTime_(booking.time, booking.duration) +
    " · " + booking.name +
    " · " + formatLabel_(booking.format) +
    " · " + booking.sector;
}

function bookingSlots_(time, duration) {
  const parts = text_(time).replace(/^'/, "").split(":");
  const startHour = Number(parts[0]);
  const startMinute = Number(parts[1] || 0);
  const start = startHour * 60 + startMinute;
  const slots = [];
  const count = Math.max(2, Math.ceil((Number(duration) || 60) / 30));

  for (let index = 0; index < count; index += 1) {
    const minutes = (start + index * 30) % 1440;
    const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
    const minute = String(minutes % 60).padStart(2, "0");
    slots.push(hour + ":" + minute);
  }
  return slots;
}

function bookingEndTime_(time, duration) {
  const parts = text_(time).replace(/^'/, "").split(":");
  const start = Number(parts[0]) * 60 + Number(parts[1] || 0);
  const endMinutes = (start + (Number(duration) || 60)) % 1440;
  const normalized = (endMinutes + 1440) % 1440;
  return String(Math.floor(normalized / 60)).padStart(2, "0") + ":" + String(normalized % 60).padStart(2, "0");
}

function formatLabel_(format) {
  if (text_(format) === "quarter") return "1/4 поля";
  if (text_(format) === "half") return "1/2 поля";
  return "Поле целиком";
}

function getSettingsSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SETTINGS_SHEET_NAME);

  const headers = ["Ключ", "Значение"];
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (currentHeaders.join("|") !== headers.join("|")) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function defaultSettings_() {
  return {
    prices: {
      quarter: 10000,
      half: 18000,
      full: 30000,
    },
  };
}

function readSettings_() {
  const sheet = getSettingsSheet_();
  const settings = defaultSettings_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    writeSettings_(settings);
    return settings;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  rows.forEach((row) => {
    const key = text_(row[0]);
    const value = Number(row[1]);
    if (key === "price_quarter" && value > 0) settings.prices.quarter = value;
    if (key === "price_half" && value > 0) settings.prices.half = value;
    if (key === "price_full" && value > 0) settings.prices.full = value;
  });
  return settings;
}

function writeSettings_(settings) {
  const sheet = getSettingsSheet_();
  const merged = defaultSettings_();
  if (settings && settings.prices) {
    merged.prices.quarter = Number(settings.prices.quarter) || merged.prices.quarter;
    merged.prices.half = Number(settings.prices.half) || merged.prices.half;
    merged.prices.full = Number(settings.prices.full) || merged.prices.full;
  }
  sheet.getRange(2, 1, 3, 2).setValues([
    ["price_quarter", merged.prices.quarter],
    ["price_half", merged.prices.half],
    ["price_full", merged.prices.full],
  ]);
}

function getTelegramSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(TELEGRAM_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(TELEGRAM_SHEET_NAME);

  const headers = ["Chat ID", "Имя", "Username", "Активирован"];
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (currentHeaders.join("|") !== headers.join("|")) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readTelegramChats_() {
  const sheet = getTelegramSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 4).getValues().map((row) => ({
    chatId: text_(row[0]).replace(/^'/, ""),
    name: text_(row[1]),
    username: text_(row[2]),
    activatedAt: text_(row[3]).replace(/^'/, ""),
  })).filter((chat) => chat.chatId);
}

function registerTelegramChat_(chat) {
  const sheet = getTelegramSheet_();
  const chatId = String(chat.chatId || "");
  if (!chatId) throw new Error("Не указан chatId");

  const rows = readTelegramChats_();
  const existingIndex = rows.findIndex((row) => row.chatId === chatId);
  const row = ["'" + chatId, chat.name || "", chat.username || "", "'" + new Date().toISOString()];

  if (existingIndex === -1) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(existingIndex + 2, 1, 1, row.length).setValues([row]);
  }
}

function fromRow_(row) {
  const hasFinanceColumns = STATUSES.indexOf(text_(row[14])) !== -1;
  const hasSourceColumns = STATUSES.indexOf(text_(row[13])) !== -1;
  const oldPrice = Number(row[7]) || 0;
  const listPrice = hasFinanceColumns ? Number(row[7]) || oldPrice : oldPrice;
  const salePrice = hasFinanceColumns ? Number(row[8]) || listPrice : oldPrice;
  const prepayment = Number(hasFinanceColumns ? row[16] : hasSourceColumns ? row[15] : row[13]) || 0;
  const paymentMethod = hasFinanceColumns ? text_(row[18]) : hasSourceColumns ? text_(row[16]) : text_(row[14]);
  const paymentRecipient = hasFinanceColumns ? text_(row[19]) : "";
  const paidAt = hasFinanceColumns ? text_(row[20]) : "";
  const paymentsRaw = hasFinanceColumns ? text_(row[23]) : "";
  const payments = paymentsRaw ? JSON.parse(paymentsRaw) : [];

  return enrichBooking_({
    id: text_(row[0]).replace(/^'/, ""),
    createdAt: text_(row[1]).replace(/^'/, ""),
    updatedAt: text_(row[24] || row[1]).replace(/^'/, ""),
    confirmedAt: text_(row[25] || "").replace(/^'/, ""),
    cancelledAt: text_(row[26] || "").replace(/^'/, ""),
    date: text_(row[2]).replace(/^'/, ""),
    time: text_(row[3]).replace(/^'/, ""),
    duration: Number(row[4]) || 60,
    format: text_(row[5]),
    sector: text_(row[6]),
    price: salePrice,
    listPrice,
    salePrice,
    name: hasFinanceColumns ? text_(row[9]) : text_(row[8]),
    phone: (hasFinanceColumns ? text_(row[10]) : text_(row[9])).replace(/^'/, ""),
    team: hasFinanceColumns ? text_(row[11]) : text_(row[10]),
    source: hasFinanceColumns ? text_(row[12]) || "Сайт" : hasSourceColumns ? text_(row[11]) || "Сайт" : "Сайт",
    sourceDetail: hasFinanceColumns ? text_(row[13]) : hasSourceColumns ? text_(row[12]) : "",
    status: normalizeStatus_(hasFinanceColumns ? text_(row[14]) : hasSourceColumns ? text_(row[13]) : text_(row[11])),
    paymentStatus: normalizePaymentStatus_(hasFinanceColumns ? text_(row[15]) : hasSourceColumns ? text_(row[14]) : text_(row[12])),
    prepayment,
    balance: Math.max(0, salePrice - prepayment),
    paymentMethod,
    paymentRecipient,
    paidAt,
    comment: hasFinanceColumns ? text_(row[21]) : hasSourceColumns ? text_(row[17]) : text_(row[15]),
    deletedAt: hasFinanceColumns ? text_(row[22]) : "",
    payments,
  });
}

function toRow_(booking) {
  const item = enrichBooking_(booking);
  return [
    item.id,
    item.createdAt,
    item.date,
    item.time,
    item.duration,
    item.format,
    item.sector,
    item.listPrice,
    item.salePrice,
    item.name,
    item.phone,
    item.team,
    item.source || "Сайт",
    item.sourceDetail || "",
    item.status,
    item.paymentStatus,
    item.prepayment,
    item.balance,
    item.paymentMethod,
    item.paymentRecipient,
    item.paidAt,
    item.comment,
    item.deletedAt,
    JSON.stringify(item.payments || []),
    item.updatedAt,
    item.confirmedAt,
    item.cancelledAt,
  ];
}

function normalizePayments_(payments, fallbackAmount, fallbackDate, fallbackMethod, fallbackRecipient) {
  const list = Array.isArray(payments) ? payments : [];
  const normalized = list.map((payment, index) => {
    const amount = Number(payment.amount) || 0;
    if (amount <= 0) return null;
    return {
      id: String(payment.id || "PAY-" + (index + 1) + "-" + new Date().getTime()),
      amount,
      date: text_(payment.date || fallbackDate || "").slice(0, 10),
      method: text_(payment.method || fallbackMethod || "Не выбран"),
      recipient: text_(payment.recipient || fallbackRecipient || "Не выбран"),
    };
  }).filter(Boolean);

  if (normalized.length > 0) return normalized;
  if ((Number(fallbackAmount) || 0) <= 0) return [];

  return [{
    id: "PAY-LEGACY-" + new Date().getTime(),
    amount: Number(fallbackAmount) || 0,
    date: text_(fallbackDate || "").slice(0, 10),
    method: text_(fallbackMethod || "Не выбран"),
    recipient: text_(fallbackRecipient || "Не выбран"),
  }];
}

function totalPaid_(payments) {
  return payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

function paymentStatusFor_(price, paid) {
  if (paid <= 0) return "unpaid";
  if (paid >= price) return "paid";
  return "deposit";
}

function enrichBooking_(booking) {
  const listPrice = Number(booking.listPrice || booking.price) || 0;
  const salePrice = Number(booking.salePrice || booking.price || listPrice) || 0;
  const payments = normalizePayments_(
    booking.payments,
    booking.prepayment,
    booking.paidAt,
    booking.paymentMethod,
    booking.paymentRecipient
  );
  const prepayment = totalPaid_(payments);
  const balance = Math.max(0, salePrice - prepayment);
  const latestPayment = payments.length ? payments[payments.length - 1] : null;

  return Object.assign({}, booking, {
    price: salePrice,
    listPrice,
    salePrice,
    updatedAt: text_(booking.updatedAt || booking.createdAt || "").replace(/^'/, ""),
    confirmedAt: text_(booking.confirmedAt || "").replace(/^'/, ""),
    cancelledAt: text_(booking.cancelledAt || "").replace(/^'/, ""),
    source: booking.source || "Сайт",
    sourceDetail: booking.sourceDetail || "",
    status: normalizeStatus_(booking.status),
    paymentStatus: paymentStatusFor_(salePrice, prepayment),
    prepayment,
    balance,
    paymentMethod: latestPayment ? latestPayment.method : booking.paymentMethod || "Не выбран",
    paymentRecipient: latestPayment ? latestPayment.recipient : booking.paymentRecipient || "",
    paidAt: latestPayment ? latestPayment.date : text_(booking.paidAt || "").replace(/^'/, ""),
    comment: booking.comment || "",
    deletedAt: text_(booking.deletedAt || "").replace(/^'/, ""),
    payments,
  });
}

function applyLifecyclePatch_(current, patch) {
  const nextStatus = patch.status || current.status;
  const now = new Date().toISOString();
  return Object.assign({}, patch, {
    updatedAt: patch.updatedAt || now,
    confirmedAt: nextStatus === "confirmed"
      ? patch.confirmedAt || current.confirmedAt || now
      : patch.confirmedAt != null ? patch.confirmedAt : current.confirmedAt,
    cancelledAt: nextStatus === "cancelled"
      ? patch.cancelledAt || current.cancelledAt || now
      : nextStatus !== current.status && nextStatus !== "cancelled"
        ? ""
        : patch.cancelledAt != null ? patch.cancelledAt : current.cancelledAt,
  });
}

function normalizeStatus_(value) {
  return STATUSES.indexOf(text_(value)) !== -1 ? text_(value) : "new";
}

function normalizePaymentStatus_(value) {
  const status = text_(value);
  return ["unpaid", "deposit", "paid"].indexOf(status) !== -1 ? status : "unpaid";
}

function text_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  }
  return String(value == null ? "" : value);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
