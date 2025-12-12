-- Migration: Convert order IDs from ORD-XML-* to order-* format
-- This migration updates 2,633 orders and cascades to 11,048 related order_jobs
-- 
-- Safety measures:
-- 1. Full database backup should be created before running this migration
-- 2. All operations are wrapped in a transaction for atomicity
-- 3. Pre-flight validation checks for conflicts
-- 4. Post-migration verification ensures data integrity

BEGIN;

-- ============================================================================
-- PRE-MIGRATION VALIDATION
-- ============================================================================

-- Check for potential ID conflicts
DO $$
DECLARE
    conflict_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO conflict_count
    FROM orders o1
    INNER JOIN orders o2 ON REPLACE(o1.id, 'ORD-XML-', 'order-') = o2.id
    WHERE o1.id LIKE 'ORD-XML-%';
    
    IF conflict_count > 0 THEN
        RAISE EXCEPTION 'Migration aborted: Found % potential ID conflicts. Please resolve before proceeding.', conflict_count;
    END IF;
    
    RAISE NOTICE 'Pre-migration validation passed: No ID conflicts found';
END $$;

-- Log current state
DO $$
DECLARE
    old_format_count INTEGER;
    new_format_count INTEGER;
    order_jobs_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO old_format_count FROM orders WHERE id LIKE 'ORD-XML-%';
    SELECT COUNT(*) INTO new_format_count FROM orders WHERE id LIKE 'order-%' AND id NOT LIKE 'ORD-XML-%';
    SELECT COUNT(*) INTO order_jobs_count FROM order_jobs oj
    INNER JOIN orders o ON oj."orderId" = o.id
    WHERE o.id LIKE 'ORD-XML-%';
    
    RAISE NOTICE 'Current state:';
    RAISE NOTICE '  - Orders with old format (ORD-XML-*): %', old_format_count;
    RAISE NOTICE '  - Orders with new format (order-*): %', new_format_count;
    RAISE NOTICE '  - Order jobs referencing old format orders: %', order_jobs_count;
END $$;

-- ============================================================================
-- CONSTRAINT MANAGEMENT
-- ============================================================================

-- Drop ALL foreign key constraints on order_jobs.orderId
-- We need to drop them before updating to avoid constraint violations
-- After migration, we'll recreate a single clean constraint with CASCADE
DO $$
BEGIN
    -- Drop the NO ACTION constraint (order_jobs_orderId_fkey)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'order_jobs_orderId_fkey' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE order_jobs DROP CONSTRAINT order_jobs_orderId_fkey;
        RAISE NOTICE 'Dropped constraint: order_jobs_orderId_fkey';
    END IF;
    
    -- Drop the CASCADE constraint (order_jobs_orderid_fkey) - we'll recreate it after migration
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'order_jobs_orderid_fkey' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE order_jobs DROP CONSTRAINT order_jobs_orderid_fkey;
        RAISE NOTICE 'Dropped constraint: order_jobs_orderid_fkey';
    END IF;
END $$;

-- ============================================================================
-- DATA MIGRATION
-- ============================================================================

-- Update all order IDs from ORD-XML-{id} to order-{id}
-- Note: We've dropped the foreign key constraints, so we need to manually update order_jobs.orderId
UPDATE orders
SET id = REPLACE(id, 'ORD-XML-', 'order-')
WHERE id LIKE 'ORD-XML-%';

-- Manually update all order_jobs.orderId to match the new order IDs
-- This replaces the CASCADE behavior since we dropped the constraints
UPDATE order_jobs
SET "orderId" = REPLACE("orderId", 'ORD-XML-', 'order-')
WHERE "orderId" LIKE 'ORD-XML-%';

-- Verify the update worked
DO $$
DECLARE
    remaining_old_format INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_old_format 
    FROM orders 
    WHERE id LIKE 'ORD-XML-%';
    
    IF remaining_old_format > 0 THEN
        RAISE EXCEPTION 'Migration failed: % orders still have old format', remaining_old_format;
    END IF;
    
    RAISE NOTICE 'Successfully updated all order IDs to new format';
END $$;

-- ============================================================================
-- RECREATE CONSTRAINTS
-- ============================================================================

-- Recreate a single clean foreign key constraint with CASCADE on update
-- This ensures future updates will cascade properly
DO $$
BEGIN
    -- Create a single clean constraint with CASCADE on both update and delete
    ALTER TABLE order_jobs
    ADD CONSTRAINT order_jobs_orderid_fkey 
    FOREIGN KEY ("orderId") 
    REFERENCES orders(id) 
    ON UPDATE CASCADE 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Recreated foreign key constraint with CASCADE';
END $$;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Verify all order IDs are in new format
DO $$
DECLARE
    old_format_count INTEGER;
    new_format_count INTEGER;
    total_orders INTEGER;
BEGIN
    SELECT COUNT(*) INTO old_format_count FROM orders WHERE id LIKE 'ORD-XML-%';
    SELECT COUNT(*) INTO new_format_count FROM orders WHERE id LIKE 'order-%' AND id NOT LIKE 'ORD-XML-%';
    SELECT COUNT(*) INTO total_orders FROM orders;
    
    IF old_format_count > 0 THEN
        RAISE EXCEPTION 'Verification failed: % orders still have old format', old_format_count;
    END IF;
    
    IF new_format_count != total_orders THEN
        RAISE WARNING 'Warning: Expected % orders with new format, found %', total_orders, new_format_count;
    END IF;
    
    RAISE NOTICE 'Order ID format verification passed:';
    RAISE NOTICE '  - Orders with old format: %', old_format_count;
    RAISE NOTICE '  - Orders with new format: %', new_format_count;
    RAISE NOTICE '  - Total orders: %', total_orders;
END $$;

-- Verify all order_jobs reference valid orders
DO $$
DECLARE
    orphaned_jobs INTEGER;
    total_jobs INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphaned_jobs
    FROM order_jobs oj
    LEFT JOIN orders o ON oj."orderId" = o.id
    WHERE o.id IS NULL;
    
    SELECT COUNT(*) INTO total_jobs FROM order_jobs;
    
    IF orphaned_jobs > 0 THEN
        RAISE EXCEPTION 'Verification failed: % order jobs reference non-existent orders', orphaned_jobs;
    END IF;
    
    RAISE NOTICE 'Order jobs references verification passed:';
    RAISE NOTICE '  - Total order jobs: %', total_jobs;
    RAISE NOTICE '  - Orphaned order jobs: %', orphaned_jobs;
END $$;

-- Verify constraint integrity
DO $$
DECLARE
    constraint_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'order_jobs'
      AND ccu.table_name = 'orders'
      AND ccu.column_name = 'id';
    
    IF constraint_count = 0 THEN
        RAISE EXCEPTION 'Verification failed: Foreign key constraint not found';
    END IF;
    
    IF constraint_count > 1 THEN
        RAISE WARNING 'Warning: Found % foreign key constraints (expected 1)', constraint_count;
    END IF;
    
    RAISE NOTICE 'Constraint integrity verification passed: Found % constraint(s)', constraint_count;
END $$;

-- Final summary
DO $$
DECLARE
    final_old_format INTEGER;
    final_new_format INTEGER;
    final_order_jobs INTEGER;
BEGIN
    SELECT COUNT(*) INTO final_old_format FROM orders WHERE id LIKE 'ORD-XML-%';
    SELECT COUNT(*) INTO final_new_format FROM orders WHERE id LIKE 'order-%' AND id NOT LIKE 'ORD-XML-%';
    SELECT COUNT(*) INTO final_order_jobs FROM order_jobs;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION COMPLETED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Final state:';
    RAISE NOTICE '  - Orders with old format: %', final_old_format;
    RAISE NOTICE '  - Orders with new format: %', final_new_format;
    RAISE NOTICE '  - Total order jobs: %', final_order_jobs;
    RAISE NOTICE '========================================';
END $$;

COMMIT;













