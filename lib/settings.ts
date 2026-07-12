import { FIELD_OPTIONS, FieldOption } from "./constants";
import { FieldFormat } from "./types";

export type AppSettings = {
  prices: Record<FieldFormat, number>;
};

const SETTINGS_CACHE_TTL = 60_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __airArenaSettingsCache: CacheEntry<AppSettings> | undefined;
}

export const defaultSettings: AppSettings = {
  prices: {
    quarter: 10000,
    half: 18000,
    full: 30000,
  },
};

function isAppsScriptConfigured() {
  return Boolean(process.env.GOOGLE_APPS_SCRIPT_URL && process.env.GOOGLE_APPS_SCRIPT_SECRET);
}

async function appsScriptSettingsRequest<T>(
  action: "getSettings" | "updateSettings",
  payload: Record<string, unknown> = {},
): Promise<T> {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL!;
  const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET!;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, secret, ...payload }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Apps Script returned ${response.status}`);
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Apps Script request failed");
  return result as T;
}

export function applySettingsToFieldOptions(settings: AppSettings): FieldOption[] {
  return FIELD_OPTIONS.map((option) => ({
    ...option,
    price: settings.prices[option.id] ?? option.price,
  }));
}

export async function getSettings(options: { fresh?: boolean } = {}): Promise<AppSettings> {
  if (!isAppsScriptConfigured()) return defaultSettings;
  const cached = globalThis.__airArenaSettingsCache;
  if (!options.fresh && cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const result = await appsScriptSettingsRequest<{ settings: AppSettings }>("getSettings");
    const settings = {
      prices: {
        ...defaultSettings.prices,
        ...result.settings?.prices,
      },
    };
    globalThis.__airArenaSettingsCache = {
      value: settings,
      expiresAt: Date.now() + SETTINGS_CACHE_TTL,
    };
    return settings;
  } catch (error) {
    console.error("Failed to load settings", error);
    return defaultSettings;
  }
}

export async function updateSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized: AppSettings = {
    prices: {
      quarter: Number(settings.prices.quarter) || defaultSettings.prices.quarter,
      half: Number(settings.prices.half) || defaultSettings.prices.half,
      full: Number(settings.prices.full) || defaultSettings.prices.full,
    },
  };

  if (isAppsScriptConfigured()) {
    await appsScriptSettingsRequest("updateSettings", { settings: normalized });
  }
  globalThis.__airArenaSettingsCache = {
    value: normalized,
    expiresAt: Date.now() + SETTINGS_CACHE_TTL,
  };
  return normalized;
}
