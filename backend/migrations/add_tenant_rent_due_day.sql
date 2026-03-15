ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS rent_due_day INTEGER DEFAULT 1;

ALTER TABLE tenants
DROP CONSTRAINT IF EXISTS tenants_rent_due_day_valid;

ALTER TABLE tenants
ADD CONSTRAINT tenants_rent_due_day_valid
CHECK (rent_due_day >= 1 AND rent_due_day <= 31);
