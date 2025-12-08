# Migration Checklist

Use this checklist when performing XML to Supabase migrations to avoid common issues.

## Pre-Migration

- [ ] Verify `.env.local` has `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Backup current Supabase database (if updating existing data)
- [ ] Review `docs/XML_MIGRATION_GUIDE.md` for latest field mappings
- [ ] Test migration script with a small sample (2-3 clients, 5-10 orders)

## During Migration

- [ ] Run migration script: `npx tsx scripts/migrate-xml-to-supabase.ts`
- [ ] Monitor for errors in console output
- [ ] Check for skipped records and investigate why

## Post-Migration Verification

### 1. Compare XML to Supabase
```bash
npx tsx scripts/compare-xml-to-supabase.ts
```
- [ ] All clients migrated (should show 0 missing)
- [ ] All orders migrated (should show 0 missing)
- [ ] Note any missing records and migrate them separately

### 2. Verify Order Titles
```bash
npx tsx scripts/check-order-titles.ts
```
- [ ] Orders have `orderType` populated
- [ ] Orders have `orderTitle` populated
- [ ] If missing, run: `npx tsx scripts/fix-order-titles.ts`

### 3. Verify Order Statuses
```bash
npx tsx scripts/compare-order-statuses.ts
```
- [ ] Status counts match expected values
- [ ] If mismatched, run: `npx tsx scripts/fix-order-statuses.ts`

### 4. Manual Verification
- [ ] Open app and check a few orders
- [ ] Verify order titles display correctly
- [ ] Verify order types are correct
- [ ] Check that order jobs are linked properly
- [ ] Verify client information is complete

## Common Issues to Check

### Field Name Issues
- [ ] Verify using `orderType` and `orderTitle` (NOT `notesInternal`/`notesPublic`)
- [ ] Check migration script uses correct field names

### XML Parsing Issues
- [ ] Verify `cleanString` function handles arrays
- [ ] Test with sample data to ensure parsing works
- [ ] Check for empty strings where data should exist

### Missing Data
- [ ] Run comparison script to find missing records
- [ ] Check migration logs for skipped records
- [ ] Verify client IDs exist before migrating orders

### Tax Rate
- [ ] Verify `taxRate` is set correctly (default 8.5, or 0 if needed)
- [ ] Check if tax rate should be different for specific orders

## Migration Script Updates Needed

If you encounter issues, update the migration script:

1. **Array Handling**: Ensure `cleanString` handles arrays
   ```typescript
   function cleanString(value: string | string[] | undefined): string {
     if (Array.isArray(value)) {
       return value[0] ? String(value[0]).trim() : '';
     }
     // ... rest of function
   }
   ```

2. **Field Names**: Use correct field names
   ```typescript
   // CORRECT
   orderType: cleanString(order.OrderType),
   orderTitle: cleanString(order.OrderName),
   
   // WRONG
   notesInternal: ...,
   notesPublic: ...,
   ```

3. **Tax Rate**: Set appropriately
   ```typescript
   taxRate: 0, // or 8.5, depending on requirements
   ```

## Quick Fix Scripts

If issues are found after migration:

- **Missing Orders**: `npx tsx scripts/migrate-missing-orders.ts`
- **Missing Titles**: `npx tsx scripts/fix-order-titles.ts`
- **Wrong Statuses**: `npx tsx scripts/fix-order-statuses.ts`
- **Check Titles**: `npx tsx scripts/check-order-titles.ts`

## Notes

- Always test with a small sample first
- Keep migration logs for reference
- Document any custom changes made during migration
- Update this checklist if new issues are discovered

