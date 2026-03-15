DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'payments_tenant_month_unique'
    ) THEN
        ALTER TABLE payments
        ADD CONSTRAINT payments_tenant_month_unique
        UNIQUE (tenant_id, month_covered);
    END IF;
END $$;
