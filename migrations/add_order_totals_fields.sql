-- Add denormalized fields to orders table
-- Target: Yandex Cloud self-hosted Supabase instance (supabase.service-mk.ru)
-- This allows displaying order totals without loading all order_jobs

-- Add columns
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS total NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS job_count INTEGER DEFAULT 0;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_total ON orders(total);
CREATE INDEX IF NOT EXISTS idx_orders_job_count ON orders(job_count);

-- Update existing orders with calculated values
UPDATE orders o
SET 
  subtotal = COALESCE((
    SELECT SUM(
      (oj.quantity * oj."unitPrice") * (1 + oj."lineMarkup" / 100.0)
    )
    FROM order_jobs oj
    WHERE oj."orderId" = o.id
  ), 0),
  job_count = (
    SELECT COUNT(*)
    FROM order_jobs oj
    WHERE oj."orderId" = o.id
  );

-- Calculate total (subtotal + tax)
UPDATE orders
SET total = subtotal * (1 + "taxRate" / 100.0)
WHERE subtotal > 0;

-- Create trigger function to maintain denormalized fields
CREATE OR REPLACE FUNCTION update_order_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal NUMERIC(12, 2);
  v_job_count INTEGER;
  v_total NUMERIC(12, 2);
  v_tax_rate NUMERIC(12, 2);
BEGIN
  -- Get tax rate for the order
  SELECT "taxRate" INTO v_tax_rate
  FROM orders
  WHERE id = COALESCE(NEW."orderId", OLD."orderId");
  
  -- Calculate subtotal and job count
  SELECT 
    COALESCE(SUM((quantity * "unitPrice") * (1 + "lineMarkup" / 100.0)), 0),
    COUNT(*)
  INTO v_subtotal, v_job_count
  FROM order_jobs
  WHERE "orderId" = COALESCE(NEW."orderId", OLD."orderId");
  
  -- Calculate total (subtotal + tax)
  v_total := v_subtotal * (1 + COALESCE(v_tax_rate, 0) / 100.0);
  
  -- Update orders table
  UPDATE orders
  SET 
    subtotal = v_subtotal,
    job_count = v_job_count,
    total = v_total,
    "updatedAt" = NOW()
  WHERE id = COALESCE(NEW."orderId", OLD."orderId");
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger on order_jobs changes
DROP TRIGGER IF EXISTS order_jobs_totals_trigger ON order_jobs;
CREATE TRIGGER order_jobs_totals_trigger
AFTER INSERT OR UPDATE OR DELETE ON order_jobs
FOR EACH ROW EXECUTE FUNCTION update_order_totals();

-- Trigger on orders taxRate changes
CREATE OR REPLACE FUNCTION update_order_total_on_tax_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."taxRate" IS DISTINCT FROM NEW."taxRate" THEN
    NEW.total = NEW.subtotal * (1 + NEW."taxRate" / 100.0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_tax_update_trigger ON orders;
CREATE TRIGGER orders_tax_update_trigger
BEFORE UPDATE OF "taxRate" ON orders
FOR EACH ROW EXECUTE FUNCTION update_order_total_on_tax_change();









