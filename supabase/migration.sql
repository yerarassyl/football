-- Air Arena Football Booking — Supabase Migration
-- Run this in the Supabase SQL Editor to set up the database schema.

-- ============================================================
-- Bookings table (main data store)
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id              TEXT PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  date            TEXT NOT NULL,            -- YYYY-MM-DD
  time            TEXT NOT NULL,            -- HH:MM
  duration        INTEGER NOT NULL DEFAULT 60,
  format          TEXT NOT NULL,            -- quarter | half | full
  sector          TEXT NOT NULL,
  price           INTEGER NOT NULL DEFAULT 0,
  list_price      INTEGER NOT NULL DEFAULT 0,
  sale_price      INTEGER NOT NULL DEFAULT 0,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  team            TEXT DEFAULT '',
  source          TEXT DEFAULT 'Сайт',
  source_detail   TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'new',      -- new | in_progress | confirmed | cancelled | deleted
  payment_status  TEXT NOT NULL DEFAULT 'unpaid',    -- unpaid | deposit | paid
  prepayment      INTEGER NOT NULL DEFAULT 0,
  balance         INTEGER NOT NULL DEFAULT 0,
  payment_method   TEXT DEFAULT 'Не выбран',
  payment_recipient TEXT DEFAULT '',
  paid_at          TEXT DEFAULT '',
  comment         TEXT DEFAULT '',
  deleted_at      TEXT DEFAULT '',
  payments        JSONB DEFAULT '[]'::jsonb
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bookings_date       ON bookings (date);
CREATE INDEX IF NOT EXISTS idx_bookings_status     ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings (created_at DESC);

-- ============================================================
-- Settings table (singleton — single row with id=1)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  prices     JSONB NOT NULL DEFAULT '{"quarter":10000,"half":18000,"full":30000}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert the default settings row if it doesn't exist
INSERT INTO settings (id, prices)
VALUES (1, '{"quarter":10000,"half":18000,"full":30000}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Telegram chats table (for admin notifications)
-- ============================================================
CREATE TABLE IF NOT EXISTS telegram_chats (
  chat_id      TEXT PRIMARY KEY,
  name         TEXT DEFAULT '',
  username     TEXT DEFAULT '',
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Helper: updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to bookings (but NOT to the updated_at set manually by the app)
-- The app manages updated_at itself, so we skip this trigger for bookings.
-- Apply it to settings only.
DROP TRIGGER IF EXISTS trg_settings_updated_at ON settings;
CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
