export const REFERRAL_CHANNELS: Record<string, string> = {
  instagram: "Instagram",
  insta: "Instagram",
  whatsapp: "WhatsApp",
  wa: "WhatsApp",
  phone: "Телефон",
  site: "Сайт",
  website: "Сайт",
  "2gis": "2GIS",
  gis: "2GIS",
  recommendation: "Рекомендация",
  recommend: "Рекомендация",
  manager: "Менеджер",
  other: "Другое",
};

export function normalizeReferralSource(value?: string | null) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  return REFERRAL_CHANNELS[key] || (value ? value.trim() : "Сайт");
}

export function referralDetail(source?: string | null, campaign?: string | null) {
  const parts = [source, campaign].map((item) => String(item || "").trim()).filter(Boolean);
  return parts.join(" / ");
}
