ALTER TABLE payments
ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'rent';

UPDATE payments
SET payment_type = 'rent'
WHERE payment_type IS NULL;

ALTER TABLE payments
DROP CONSTRAINT IF EXISTS payments_payment_type_valid;

ALTER TABLE payments
ADD CONSTRAINT payments_payment_type_valid
CHECK (payment_type IN ('rent', 'advance'));
