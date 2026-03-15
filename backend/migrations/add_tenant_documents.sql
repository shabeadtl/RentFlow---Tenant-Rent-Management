ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS agreement_file_name TEXT,
ADD COLUMN IF NOT EXISTS agreement_file_url TEXT,
ADD COLUMN IF NOT EXISTS proof_file_name TEXT,
ADD COLUMN IF NOT EXISTS proof_file_url TEXT;
