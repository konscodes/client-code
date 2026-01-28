-- Add type field to preset_jobs table
-- Target: Yandex Cloud self-hosted Supabase instance (supabase.service-mk.ru)
-- This allows distinguishing between regular jobs and subcategory headers in presets

-- Add column with default value 'job' for existing records
ALTER TABLE preset_jobs
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'job';

-- For subcategory rows, we need a name field since they don't reference a jobId
-- Add subcategoryName column to store the name when type='subcategory'
ALTER TABLE preset_jobs
ADD COLUMN IF NOT EXISTS "subcategoryName" TEXT;

-- Update any NULL type values to 'job' (shouldn't be any, but just in case)
UPDATE preset_jobs
SET type = 'job'
WHERE type IS NULL;

-- Add check constraint to ensure only valid values
ALTER TABLE preset_jobs
ADD CONSTRAINT preset_jobs_type_check CHECK (type IN ('job', 'subcategory'));

-- Add comment to columns for documentation
COMMENT ON COLUMN preset_jobs.type IS 'Type of row: job (regular job item) or subcategory (section header/divider)';
COMMENT ON COLUMN preset_jobs."subcategoryName" IS 'Name of subcategory (only used when type=subcategory)';
