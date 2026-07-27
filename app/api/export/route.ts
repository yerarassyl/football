import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { getRequests } from "@/lib/db";
import { formatLabel } from "@/lib/booking";
import { formatDuration } from "@/lib/time";
import * as XLSX from "xlsx";

const HEADERS = [
  "ID",
  "Дата",
  "Время",
  "Длительность",
  "Формат",
  "Сектор",
  "Имя",
  "Телефон",
  "Команда",
  "Прайс",
  "Цена продажи",
  "Предоплата",
  "Долг",
  "Статус оплаты",
  "Способ оплаты",
  "Получатель оплаты",
  "Дата оплаты",
  "Статус",
  "Комментарий",
  "Источник",
  "Метка источника",
  "Создано",
  "Обновлено",
  "Подтверждено",
  "Отменено",
  "Удалено",
  "Платежи",
];

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Не оплачено",
  deposit: "Частично",
  paid: "Оплачено",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  confirmed: "Подтверждена",
  cancelled: "Отменена",
  deleted: "Удалена",
};

export async function GET(request: NextRequest) {
  if (!verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    const all = await getRequests();
    const bookings = all.filter((item) => {
      if (item.status === "deleted") return false;
      if (!from && !to) return true;
      if (from && item.date < from) return false;
      if (to && item.date > to) return false;
      return true;
    });

    const rows = bookings.map((item) => [
      item.id,
      item.date,
      item.time,
      formatDuration(item.duration),
      formatLabel(item.format),
      item.sector,
      item.name,
      item.phone,
      item.team,
      item.listPrice || item.price,
      item.salePrice || item.price,
      item.prepayment,
      item.balance,
      PAYMENT_STATUS_LABELS[item.paymentStatus] || item.paymentStatus,
      item.paymentMethod,
      item.paymentRecipient,
      item.paidAt,
      STATUS_LABELS[item.status] || item.status,
      item.comment,
      item.source,
      item.sourceDetail,
      item.createdAt?.slice(0, 19).replace("T", " ") || "",
      item.updatedAt?.slice(0, 19).replace("T", " ") || "",
      item.confirmedAt?.slice(0, 19).replace("T", " ") || "",
      item.cancelledAt?.slice(0, 19).replace("T", " ") || "",
      item.deletedAt?.slice(0, 19).replace("T", " ") || "",
      item.payments.length > 0 ? item.payments.map((p) => `${p.amount} ₸ (${p.date} ${p.method} → ${p.recipient})`).join(" | ") : "",
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);

    // Set column widths
    worksheet["!cols"] = HEADERS.map((header, i) => ({
      wch: Math.max(header.length + 4, i === 0 ? 24 : i >= 26 ? 30 : 14),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Брони");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const filename = `bookings_${from || "all"}_${to || "all"}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error("Failed to export bookings", error);
    return NextResponse.json({ error: "Не удалось экспортировать брони" }, { status: 500 });
  }
}
