-- Add Russian banking and legal fields to company_settings table
-- These fields are optional and nullable for backward compatibility

ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS legal_form TEXT,
ADD COLUMN IF NOT EXISTS inn TEXT,
ADD COLUMN IF NOT EXISTS kpp TEXT,
ADD COLUMN IF NOT EXISTS bank_account TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS correspondent_account TEXT,
ADD COLUMN IF NOT EXISTS bank_bik TEXT,
ADD COLUMN IF NOT EXISTS director_name TEXT;

