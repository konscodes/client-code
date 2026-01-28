-- Add defaultPrice field to preset_jobs table
-- Target: Yandex Cloud self-hosted Supabase instance (supabase.service-mk.ru)
-- This allows specifying a price override for each job in a preset

-- Add column for default price (nullable - if not set, job template price will be used)
ALTER TABLE preset_jobs
ADD COLUMN IF NOT EXISTS "defaultPrice" DECIMAL(10,2);

-- Add comment to column for documentation
COMMENT ON COLUMN preset_jobs."defaultPrice" IS 'Price override for job when preset is applied to an order';
