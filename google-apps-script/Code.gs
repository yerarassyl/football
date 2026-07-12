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
  "Платежи",
];
const STATUSES = ["new", "in_progress", "confirmed", "cancelled", "deleted"];

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
      if (hasConflict_(booking)) {
        return json_({ ok: true, conflict: true });
      }
      appendBooking_(booking);
      return json_({ ok: true, booking, conflict: false });
    }

    if (body.action === "batchCreate") {
      const results = [];
      const inputs = body.bookings || [];
      for (let i = 0; i < inputs.length; i++) {
        var booking = enrichBooking_(inputs[i]);
        if (hasConflict_(booking)) {
          results.push({ index: i, conflict: true });
        } else {
          appendBooking_(booking);
          results.push({ index: i, conflict: false, booking: booking });
        }
      }
      return json_({ ok: true, results: results });
    }

    if (body.action === "update") {
      const booking = updateBooking_(body.id, body.patch);
      return json_({ ok: true, booking });
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

function authorize_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!expected || secret !== expected) {
    throw new Error("Нет доступа");
  }
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

  const updated = enrichBooking_(Object.assign(fromRow_(rows[index]), patch, { id }));
  sheet.getRange(index + 2, 1, 1, HEADERS.length).setValues([toRow_(updated)]);
  return updated;
}

function hasConflict_(booking) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const requestedSectors = text_(booking.sector).split("+");
  const requestedSlots = bookingSlots_(booking.time, Number(booking.duration) || 60);
  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  return rows.map(fromRow_).some((item) => {
    if (item.date !== text_(booking.date).replace(/^'/, "")) return false;
    if (item.status === "cancelled" || item.status === "deleted") return false;

    const itemSlots = bookingSlots_(item.time, item.duration);
    const sectors = item.sector.split("+");
    return itemSlots.some((slot) => requestedSlots.indexOf(slot) !== -1) &&
      sectors.some((sector) => requestedSectors.indexOf(sector) !== -1);
  });
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
  return sheet
    .getRange(2, 1, lastRow - 1, 4)
    .getValues()
    .map((row) => ({
      chatId: text_(row[0]).replace(/^'/, ""),
      name: text_(row[1]),
      username: text_(row[2]),
      activatedAt: text_(row[3]).replace(/^'/, ""),
    }))
    .filter((chat) => chat.chatId);
}

function registerTelegramChat_(chat) {
  const sheet = getTelegramSheet_();
  const chatId = String(chat.chatId || "");
  if (!chatId) throw new Error("Не указан chatId");

  const rows = readTelegramChats_();
  const existingIndex = rows.findIndex((row) => row.chatId === chatId);
  const row = [
    "'" + chatId,
    chat.name || "",
    chat.username || "",
    "'" + new Date().toISOString(),
  ];

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
  
  let payments = [];
  try {
    const paymentsStr = hasFinanceColumns && row[23] ? text_(row[23]) : "";
    if (paymentsStr) payments = JSON.parse(paymentsStr);
  } catch (e) {}
  
  const totalFromPayments = payments.reduce(function(sum, p) { return sum + (p.amount || 0); }, 0);
  const prepayment = totalFromPayments > 0 ? totalFromPayments : Number(hasFinanceColumns ? row[16] : hasSourceColumns ? row[15] : row[13]) || 0;

  return enrichBooking_({
    id: text_(row[0]).replace(/^'/, ""),
    createdAt: text_(row[1]).replace(/^'/, ""),
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
    payments: payments,
    comment: hasFinanceColumns ? text_(row[21]) : hasSourceColumns ? text_(row[17]) : text_(row[15]),
    deletedAt: hasFinanceColumns ? text_(row[22]) : "",
  });
}

function toRow_(booking) {
  const item = enrichBooking_(booking);
  const payments = booking.payments || [];
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
    "",
    "",
    "",
    item.comment,
    item.deletedAt,
    JSON.stringify(payments),
  ];
}

function enrichBooking_(booking) {
  const listPrice = Number(booking.listPrice || booking.price) || 0;
  const salePrice = Number(booking.salePrice || booking.price || listPrice) || 0;
  const prepayment = Number(booking.prepayment) || 0;
  return Object.assign({}, booking, {
    price: salePrice,
    listPrice,
    salePrice,
    source: booking.source || "Сайт",
    sourceDetail: booking.sourceDetail || "",
    status: normalizeStatus_(booking.status),
    paymentStatus: normalizePaymentStatus_(booking.paymentStatus),
    prepayment,
    balance: Math.max(0, salePrice - prepayment),
    payments: booking.payments || [],
    comment: booking.comment || "",
    deletedAt: text_(booking.deletedAt || "").replace(/^'/, ""),
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
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss"
    );
  }
  return String(value == null ? "" : value);
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
