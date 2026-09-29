-- Split clients and orders into per-company workspaces
-- Target: Yandex Cloud self-hosted Supabase instance (supabase.service-mk.ru)
-- Each workspace is one legal entity (see lib/legal-entities.ts): 'mk' (МК СЕРВИС) or 'metservice' (МЕТСЕРВИС).
-- Existing data belongs to MK. Job catalog, presets and company settings stay shared.

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'mk';

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'mk';

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_workspace_id_check;
ALTER TABLE clients
ADD CONSTRAINT clients_workspace_id_check CHECK ("workspaceId" IN ('mk', 'metservice'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_workspace_id_check;
ALTER TABLE orders
ADD CONSTRAINT orders_workspace_id_check CHECK ("workspaceId" IN ('mk', 'metservice'));

CREATE INDEX IF NOT EXISTS clients_workspace_created_idx ON clients ("workspaceId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS orders_workspace_created_idx ON orders ("workspaceId", "createdAt" DESC);

COMMENT ON COLUMN clients."workspaceId" IS 'Company workspace the client belongs to: mk | metservice';
COMMENT ON COLUMN orders."workspaceId" IS 'Company workspace the order belongs to: mk | metservice';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Separate ID counters for the Metservice workspace
-- MK keeps next_client_id() / next_order_id() (client-N / order-N).
-- Metservice gets its own sequences with an ms- prefix so primary keys never collide.
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS public.metservice_client_id_seq START WITH 1;
-- Orders continue the existing МЕТСЕРВИС document journal (last issued: 21)
CREATE SEQUENCE IF NOT EXISTS public.metservice_order_id_seq START WITH 22;

CREATE OR REPLACE FUNCTION public.next_metservice_client_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'ms-client-' || nextval('public.metservice_client_id_seq');
$$;

CREATE OR REPLACE FUNCTION public.next_metservice_order_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'ms-order-' || nextval('public.metservice_order_id_seq');
$$;

REVOKE ALL ON FUNCTION public.next_metservice_client_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_metservice_order_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_metservice_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_metservice_order_id() TO authenticated;

NOTIFY pgrst, 'reload schema';
