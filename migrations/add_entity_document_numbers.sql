-- Sequential document numbers per legal entity (Metservice journal suffixes).
-- Format in generated docs: {orderNumber}-{sequence_suffix} e.g. 22817-22

CREATE TABLE IF NOT EXISTS public.entity_document_counters (
  entity_id text PRIMARY KEY,
  next_value integer NOT NULL DEFAULT 22
);

CREATE TABLE IF NOT EXISTS public.entity_document_numbers (
  entity_id text NOT NULL,
  order_id text NOT NULL,
  sequence_suffix integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, order_id)
);

INSERT INTO public.entity_document_counters (entity_id, next_value)
VALUES ('metservice', 22)
ON CONFLICT (entity_id) DO NOTHING;

ALTER TABLE public.entity_document_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_document_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_document_counters_authenticated" ON public.entity_document_counters;
CREATE POLICY "entity_document_counters_authenticated"
  ON public.entity_document_counters
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "entity_document_numbers_authenticated" ON public.entity_document_numbers;
CREATE POLICY "entity_document_numbers_authenticated"
  ON public.entity_document_numbers
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
