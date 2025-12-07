-- Migration: Convert client IDs from client-xml-* to client-* format
-- This migration updates 317 clients and cascades to 2,633 related orders
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
    FROM clients c1
    INNER JOIN clients c2 ON REPLACE(c1.id, 'client-xml-', 'client-') = c2.id
    WHERE c1.id LIKE 'client-xml-%';
    
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
    orders_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO old_format_count FROM clients WHERE id LIKE 'client-xml-%';
    SELECT COUNT(*) INTO new_format_count FROM clients WHERE id LIKE 'client-%' AND id NOT LIKE 'client-xml-%';
    SELECT COUNT(*) INTO orders_count FROM orders o
    INNER JOIN clients c ON o."clientId" = c.id
    WHERE c.id LIKE 'client-xml-%';
    
    RAISE NOTICE 'Current state:';
    RAISE NOTICE '  - Clients with old format (client-xml-*): %', old_format_count;
    RAISE NOTICE '  - Clients with new format (client-*): %', new_format_count;
    RAISE NOTICE '  - Orders referencing old format clients: %', orders_count;
END $$;

-- ============================================================================
-- CONSTRAINT MANAGEMENT
-- ============================================================================

-- Drop ALL foreign key constraints on orders.clientId
-- We need to drop them before updating to avoid constraint violations
-- After migration, we'll recreate a single clean constraint with CASCADE
DO $$
BEGIN
    -- Drop the NO ACTION constraint (orders_clientId_fkey)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_clientId_fkey' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE orders DROP CONSTRAINT orders_clientId_fkey;
        RAISE NOTICE 'Dropped constraint: orders_clientId_fkey';
    END IF;
    
    -- Drop the CASCADE constraint (orders_clientid_fkey) - we'll recreate it after migration
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_clientid_fkey' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE orders DROP CONSTRAINT orders_clientid_fkey;
        RAISE NOTICE 'Dropped constraint: orders_clientid_fkey';
    END IF;
END $$;

-- ============================================================================
-- DATA MIGRATION
-- ============================================================================

-- Update all client IDs from client-xml-{id} to client-{id}
-- Note: We've dropped the foreign key constraints, so we need to manually update orders.clientId
UPDATE clients
SET id = REPLACE(id, 'client-xml-', 'client-')
WHERE id LIKE 'client-xml-%';

-- Manually update all orders.clientId to match the new client IDs
-- This replaces the CASCADE behavior since we dropped the constraints
UPDATE orders
SET "clientId" = REPLACE("clientId", 'client-xml-', 'client-')
WHERE "clientId" LIKE 'client-xml-%';

-- Verify the update worked
DO $$
DECLARE
    updated_count INTEGER;
    remaining_old_format INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_old_format 
    FROM clients 
    WHERE id LIKE 'client-xml-%';
    
    IF remaining_old_format > 0 THEN
        RAISE EXCEPTION 'Migration failed: % clients still have old format', remaining_old_format;
    END IF;
    
    RAISE NOTICE 'Successfully updated all client IDs to new format';
END $$;

-- ============================================================================
-- RECREATE CONSTRAINTS
-- ============================================================================

-- Recreate a single clean foreign key constraint with CASCADE on update
-- This ensures future updates will cascade properly
DO $$
BEGIN
    -- Drop the existing CASCADE constraint if it exists (we'll recreate it)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_clientid_fkey' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_clientid_fkey;
    END IF;
    
    -- Create a single clean constraint with CASCADE on both update and delete
    ALTER TABLE orders
    ADD CONSTRAINT orders_clientid_fkey 
    FOREIGN KEY ("clientId") 
    REFERENCES clients(id) 
    ON UPDATE CASCADE 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Recreated foreign key constraint with CASCADE';
END $$;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Verify all client IDs are in new format
DO $$
DECLARE
    old_format_count INTEGER;
    new_format_count INTEGER;
    total_clients INTEGER;
BEGIN
    SELECT COUNT(*) INTO old_format_count FROM clients WHERE id LIKE 'client-xml-%';
    SELECT COUNT(*) INTO new_format_count FROM clients WHERE id LIKE 'client-%' AND id NOT LIKE 'client-xml-%';
    SELECT COUNT(*) INTO total_clients FROM clients;
    
    IF old_format_count > 0 THEN
        RAISE EXCEPTION 'Verification failed: % clients still have old format', old_format_count;
    END IF;
    
    IF new_format_count != total_clients THEN
        RAISE WARNING 'Warning: Expected % clients with new format, found %', total_clients, new_format_count;
    END IF;
    
    RAISE NOTICE 'Client ID format verification passed:';
    RAISE NOTICE '  - Clients with old format: %', old_format_count;
    RAISE NOTICE '  - Clients with new format: %', new_format_count;
    RAISE NOTICE '  - Total clients: %', total_clients;
END $$;

-- Verify all orders reference valid clients
DO $$
DECLARE
    orphaned_orders INTEGER;
    total_orders INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphaned_orders
    FROM orders o
    LEFT JOIN clients c ON o."clientId" = c.id
    WHERE c.id IS NULL;
    
    SELECT COUNT(*) INTO total_orders FROM orders;
    
    IF orphaned_orders > 0 THEN
        RAISE EXCEPTION 'Verification failed: % orders reference non-existent clients', orphaned_orders;
    END IF;
    
    RAISE NOTICE 'Order references verification passed:';
    RAISE NOTICE '  - Total orders: %', total_orders;
    RAISE NOTICE '  - Orphaned orders: %', orphaned_orders;
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
      AND tc.table_name = 'orders'
      AND ccu.table_name = 'clients'
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
    final_orders INTEGER;
BEGIN
    SELECT COUNT(*) INTO final_old_format FROM clients WHERE id LIKE 'client-xml-%';
    SELECT COUNT(*) INTO final_new_format FROM clients WHERE id LIKE 'client-%' AND id NOT LIKE 'client-xml-%';
    SELECT COUNT(*) INTO final_orders FROM orders;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION COMPLETED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Final state:';
    RAISE NOTICE '  - Clients with old format: %', final_old_format;
    RAISE NOTICE '  - Clients with new format: %', final_new_format;
    RAISE NOTICE '  - Total orders: %', final_orders;
    RAISE NOTICE '========================================';
END $$;

COMMIT;

