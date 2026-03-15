-- ============================================================
-- Rent Management System — Supabase Schema
-- Run this in your Supabase SQL Editor to create the tables.
-- ============================================================

-- App Users / Roles
CREATE TABLE IF NOT EXISTS app_users (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      TEXT NOT NULL,
    full_name  TEXT,
    role       TEXT NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('admin', 'manager', 'viewer')),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Properties
CREATE TABLE IF NOT EXISTS properties (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    address     TEXT NOT NULL,
    total_units INTEGER NOT NULL DEFAULT 1,
    rent_amount NUMERIC(10,2) NOT NULL,
    note        TEXT
);

-- Tenants
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    phone       TEXT,
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    unit_number TEXT,
    lease_start DATE,
    lease_end   DATE,
    status      TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'past')),
    electric_meter_reading TEXT,
    final_meter_reading TEXT,
    vacating_date DATE,
    outstanding_dues NUMERIC(10,2),
    rent_due_day INTEGER DEFAULT 1 CHECK (rent_due_day >= 1 AND rent_due_day <= 31),
    agreement_file_name TEXT,
    agreement_file_url TEXT,
    proof_file_name TEXT,
    proof_file_url TEXT,
    CHECK (lease_end IS NULL OR lease_start IS NULL OR lease_end >= lease_start)
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
    amount_paid   NUMERIC(10,2) NOT NULL,
    payment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_type  TEXT NOT NULL DEFAULT 'rent'
        CHECK (payment_type IN ('rent', 'advance')),
    note          TEXT,
    month_covered TEXT NOT NULL,
    CHECK (month_covered ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    UNIQUE (tenant_id, month_covered)  -- e.g. '2026-03'
);

-- ── Indexes for common queries ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_app_users_role    ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_active  ON app_users(is_active);
CREATE INDEX IF NOT EXISTS idx_tenants_property ON tenants(property_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant  ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_month   ON payments(month_covered);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_active_unit
    ON tenants(property_id, unit_number)
    WHERE status = 'active' AND unit_number IS NOT NULL;
