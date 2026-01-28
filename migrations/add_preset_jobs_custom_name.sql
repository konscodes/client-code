-- Add customName field to preset_jobs table
-- Target: Yandex Cloud self-hosted Supabase instance (supabase.service-mk.ru)
-- This allows adding manual/custom jobs that don't reference a job template

-- Add column for custom job name
ALTER TABLE preset_jobs
ADD COLUMN IF NOT EXISTS "customName" TEXT;

-- Add comment to column for documentation
COMMENT ON COLUMN preset_jobs."customName" IS 'Custom job name for manual jobs that do not reference a job template';
