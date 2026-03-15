DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenants_lease_dates_valid'
    ) THEN
        ALTER TABLE tenants
        ADD CONSTRAINT tenants_lease_dates_valid
        CHECK (lease_end IS NULL OR lease_start IS NULL OR lease_end >= lease_start);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_active_unit
ON tenants(property_id, unit_number)
WHERE status = 'active' AND unit_number IS NOT NULL;
