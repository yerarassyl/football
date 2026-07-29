import { FIELD_OPTIONS, FieldOption } from "./constants";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { FieldFormat } from "./types";

export type AppSettings = {
  prices: Record<FieldFormat, number>;
  promoPrices: Record<FieldFormat, number>;
};

const SETTINGS_CACHE_TTL = 60_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

declare global {
  var __airArenaSettingsCache: CacheEntry<AppSettings> | undefined;
}

export const defaultSettings: AppSettings = {
  prices: {
    quarter: 10000,
    half: 18000,
    full: 30000,
  },
  promoPrices: {
    quarter: 0,
    half: 0,
    full: 0,
  },
};

function setCachedSettings(settings: AppSettings): void {
  globalThis.__airArenaSettingsCache = { value: settings, expiresAt: Date.now() + SETTINGS_CACHE_TTL };
}

export function applySettingsToFieldOptions(settings: AppSettings): FieldOption[] {
  return FIELD_OPTIONS.map((option) => ({
    ...option,
    price: settings.prices[option.id] ?? option.price,
    promoPrice: settings.promoPrices?.[option.id] ?? option.promoPrice ?? 0,
  }));
}

/** Extract promo prices stored inside the prices JSONB (e.g. "promo_quarter", "promo_half", "promo_full"). */
function extractPromoPrices(prices: Record<string, unknown>): Record<FieldFormat, number> {
  return {
    quarter: Number(prices.promo_quarter) || 0,
    half: Number(prices.promo_half) || 0,
    full: Number(prices.promo_full) || 0,
  };
}

export async function getSettings(options: { fresh?: boolean } = {}): Promise<AppSettings> {
  if (!isSupabaseConfigured()) return defaultSettings;

  const cached = globalThis.__airArenaSettingsCache;
  if (!options.fresh && cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const supabase = getSupabase()!;
    const { data, error } = await supabase
      .from("settings")
      .select("prices")
      .eq("id", 1)
      .single();

    if (error || !data) {
      console.error("Failed to load settings from Supabase", error);
      return defaultSettings;
    }

    const row = data as { prices: Record<string, unknown> };
    const raw = row.prices || {};
    const settings: AppSettings = {
      prices: {
        quarter: Number(raw.quarter) || defaultSettings.prices.quarter,
        half: Number(raw.half) || defaultSettings.prices.half,
        full: Number(raw.full) || defaultSettings.prices.full,
      },
      promoPrices: extractPromoPrices(raw),
    };

    setCachedSettings(settings);
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
    promoPrices: {
      quarter: Number(settings.promoPrices.quarter) || 0,
      half: Number(settings.promoPrices.half) || 0,
      full: Number(settings.promoPrices.full) || 0,
    },
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabase()!;

    // Store promo prices inside the prices JSONB — no separate column needed
    const pricesPayload = {
      ...normalized.prices,
      promo_quarter: normalized.promoPrices.quarter,
      promo_half: normalized.promoPrices.half,
      promo_full: normalized.promoPrices.full,
    };

    const { error } = await supabase
      .from("settings")
      .upsert({
        id: 1,
        prices: pricesPayload,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Failed to update settings in Supabase", error);
      throw new Error("Не удалось сохранить настройки");
    }
  }

  setCachedSettings(normalized);
  return normalized;
}
