-- Add type field to order_jobs table
-- Target: Yandex Cloud self-hosted Supabase instance (supabase.service-mk.ru)
-- This allows distinguishing between regular jobs and subcategory headers

-- Add column with default value 'job' for existing records
ALTER TABLE order_jobs
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'job';

-- Update any NULL values to 'job' (shouldn't be any, but just in case)
UPDATE order_jobs
SET type = 'job'
WHERE type IS NULL;

-- Add check constraint to ensure only valid values
ALTER TABLE order_jobs
ADD CONSTRAINT order_jobs_type_check CHECK (type IN ('job', 'subcategory'));

-- Add comment to column for documentation
COMMENT ON COLUMN order_jobs.type IS 'Type of row: job (regular job item) or subcategory (section header/divider)';
