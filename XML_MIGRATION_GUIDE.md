# XML to Supabase Database Migration Guide

This document contains the complete data mapping and conversion rules for migrating data from the XML database export (`servicemk3.xml`) to Supabase.

## Overview

The XML database contains 15 tables with Russian-language data from a ServiceMK3 system. This guide documents how to map and convert this data to the application's data structure.

## Quick Start

1. **Prepare Environment**:
   ```bash
   # Ensure .env.local has SUPABASE_SERVICE_ROLE_KEY
   cp .env.example .env.local
   # Add your SUPABASE_SERVICE_ROLE_KEY
   ```

2. **Run Migration**:
   ```bash
   npm run migrate
   # or
   npx tsx scripts/migrate-xml-to-supabase.ts
   ```

3. **Verify Migration**:
   ```bash
   npx tsx scripts/compare-order-statuses.ts
   ```

4. **Fix Statuses if Needed**:
   ```bash
   npx tsx scripts/fix-order-statuses.ts
   ```

## Tables to Migrate

### ✅ Migrate These Tables:
- `tblMain` + `tblContacts` → `clients` table
- `tblOrders` + `tblWorks` → `orders` and `order_jobs` tables

### ❌ Skip These Tables:
- `tblCatalogWorks` (job catalog)
- `tblContracts` (contracts)
- `tblMaterials` / `tblCatalogMatarials` (materials)
- `tblSettings` (application settings)
- `tblDocs`, `tblProcedures`, `tblUsers`, `tblEmployees`, etc.

## Client Data Mapping (tblMain + tblContacts → clients)

### Data Source
- Primary table: `tblMain` (client/company master data)
- Related table: `tblContacts` (contact persons linked to clients)
- Join: `tblMain.ClientID = tblContacts.ContactClientID`

### Field Mappings

| XML Field | Source Table | Target Field | Notes |
|-----------|-------------|--------------|-------|
| `ContactName` | `tblContacts` | `name` | Use most recent contact (by `ContactAddTime`) |
| `ClientCompany` | `tblMain` | `company` | |
| `ContactMobilePhone` | `tblContacts` | `phone` | Fallback to `ClientPhone` from `tblMain` if empty |
| `ContactEmail` | `tblContacts` | `email` | Fallback to `ClientEmail` from `tblMain` if empty |
| `ClientAddressReg` | `tblMain` | `address` | Full registered address |
| `ClientComments` | `tblMain` | `notes` | Base notes from client record |
| `ContactAddTime` | `tblContacts` | `createdAt` | Parse as Date object |
| `ClientInn` | `tblMain` | `inn` | Russian Tax ID (ИНН) |
| `ClientKpp` | `tblMain` | `kpp` | Russian Registration Code (КПП) |
| `ClientOgrn` | `tblMain` | `ogrn` | Russian State Registration Number (ОГРН) |
| `ClientBank` | `tblMain` | `bank.name` | Bank name |
| `ClientBankRasSchet` | `tblMain` | `bank.accountNumber` | Account number |
| `ClientBankKorSchet` | `tblMain` | `bank.correspondentAccount` | Correspondent account |
| `ClientBankBik` | `tblMain` | `bank.bik` | BIK code |
| - | - | `updatedAt` | Leave undefined if not available in XML |

### Contact Handling Rules

1. **Primary Contact Selection**:
   - Select the most recent contact by `ContactAddTime` (descending order)
   - Use this contact's `ContactName`, `ContactMobilePhone`, and `ContactEmail` for primary fields

2. **Fallback Logic**:
   - If `ContactMobilePhone` is empty → use `ClientPhone` from `tblMain`
   - If `ContactEmail` is empty → use `ClientEmail` from `tblMain`

3. **Additional Contacts**:
   - If multiple contacts exist for a client, append them to the `notes` field
   - Format: `"Additional contact: Name (phone, email)"` or `"Additional contacts: Name1 (phone1, email1), Name2 (phone2, email2)"`
   - Only include phone/email if they are not empty
   - Example: `"Additional contact: Мюнц Владимир Константинович (+7(903)2221694, munz1@ya.ru)"`

### Date Parsing

- Parse date strings from XML format: `"YYYY-MM-DD HH:MM:SS"` or `"YYYY-MM-DD"`
- Convert to JavaScript Date objects or PostgreSQL timestamps
- If date parsing fails, use current date or leave as null

### Example SQL Mapping Query

```sql
-- Pseudocode for client migration
SELECT 
  c.ClientID as id,
  contact.ContactName as name,
  c.ClientCompany as company,
  COALESCE(contact.ContactMobilePhone, c.ClientPhone, '') as phone,
  COALESCE(contact.ContactEmail, c.ClientEmail, '') as email,
  c.ClientAddressReg as address,
  c.ClientInn as inn,
  c.ClientKpp as kpp,
  c.ClientOgrn as ogrn,
  jsonb_build_object(
    'name', c.ClientBank,
    'accountNumber', c.ClientBankRasSchet,
    'correspondentAccount', c.ClientBankKorSchet,
    'bik', c.ClientBankBik
  ) as bank,
  -- Combine notes with additional contacts
  CONCAT_WS(' | ', 
    c.ClientComments,
    additional_contacts_text
  ) as notes,
  contact.ContactAddTime::timestamp as "createdAt"
FROM tblMain c
LEFT JOIN LATERAL (
  SELECT * FROM tblContacts 
  WHERE ContactClientID = c.ClientID 
  ORDER BY ContactAddTime DESC 
  LIMIT 1
) contact ON true
-- Additional contacts aggregation would go here
```

## Order Data Mapping (tblOrders + tblWorks → orders + order_jobs)

### Data Source
- Primary table: `tblOrders` (order headers)
- Related table: `tblWorks` (work items/jobs within orders)
- Join: `tblOrders.OrderID = tblWorks.WorksOrderID`

### Order Field Mappings

| XML Field | Source Table | Target Field | Notes |
|-----------|-------------|--------------|-------|
| `OrderID` | `tblOrders` | `id` | Prefix with 'order-' for imported orders |
| `OrderClientID` | `tblOrders` | `clientId` | Map to client ID (e.g., 'client-10001') |
| `OrderDate` | `tblOrders` | `createdAt` | Parse as Date object |
| `OrderAddTime` | `tblOrders` | `updatedAt` | Parse as Date object, fallback to `OrderDate` if empty |
| `OrderID` + `OrderType` + `OrderComments` | `tblOrders` | `notesInternal` | Concatenate with ' \| ' separator |
| `OrderName` | `tblOrders` | `notesPublic` | Order description/name |
| `OrderStatus` | `tblOrders` | `status` | Map Russian status to English (see Status Mapping) |
| - | - | `taxRate` | Default: 8.5 |
| - | - | `globalMarkup` | Default: 20 |
| - | - | `currency` | Default: 'USD' |

### Order Job (Works) Field Mappings

| XML Field | Source Table | Target Field | Notes |
|-----------|-------------|--------------|-------|
| `WorksName` | `tblWorks` | `jobName` | Job name |
| `WorksName` | `tblWorks` | `description` | Same as jobName |
| `WorksFirstPrice` | `tblWorks` | `unitPrice` | **Base price BEFORE markup** - Parse as float, handle comma decimal separator. Fallback to `WorksPrice` if `WorksFirstPrice` not available |
| `WorksQuantity` | `tblWorks` | `quantity` | Parse as float, handle comma decimal separator |
| `WorksRatio` | `tblWorks` | `lineMarkup` | **See Markup Conversion below** |
| `WorksCWorksID` | `tblWorks` | `jobId` | Link to catalog if exists, otherwise empty string |
| `WorksOrderID` | `tblWorks` | - | Used for joining to parent order |
| `ID` | `tblWorks` | - | Used for sorting jobs within an order |
| - | - | `taxApplicable` | Default: true |
| - | - | `position` | Sequential index (0, 1, 2, ...) based on `ID` field |

**IMPORTANT - Price Field Selection**:
- **Use `WorksFirstPrice`** (base price before markup) for `unitPrice`
- **Do NOT use `WorksPrice`** (price with markup already applied)
- Relationship: `WorksPrice = WorksFirstPrice × WorksRatio`
- The application calculates final price as: `unitPrice × (1 + lineMarkup/100)`
- If `WorksFirstPrice` is missing, fallback to `WorksPrice` (for backward compatibility)

**Important**: Order jobs are sorted by their `ID` field within each order to maintain the correct sequence.

### Markup Conversion Formula

**CRITICAL**: XML uses a ratio format (multiplier) while the application uses percentage markup.

- **XML Format**: Ratio multiplier where 1.0 = no markup (0%), 1.5 = 50% markup, 1.7 = 70% markup
- **Application Format**: Percentage where 0 = no markup, 50 = 50% markup, 70 = 70% markup

**Conversion Formula**:
```
lineMarkup = (WorksRatio - 1) × 100
```

**Examples**:
- XML `WorksRatio = 1,0` (1.0) → `lineMarkup = 0` (0% markup)
- XML `WorksRatio = 1,5` (1.5) → `lineMarkup = 50` (50% markup)
- XML `WorksRatio = 1,7` (1.7) → `lineMarkup = 70` (70% markup)
- XML `WorksRatio = 1,35` (1.35) → `lineMarkup = 35` (35% markup)

**Implementation**:
```javascript
// Handle comma as decimal separator (Russian format)
const xmlRatio = parseFloat(worksRatio.replace(',', '.'));
// Convert ratio (1.5) to percentage markup (50%)
const lineMarkup = (xmlRatio - 1) * 100;
```

**Price Calculation**:
- XML: `WorksPrice = WorksFirstPrice × WorksRatio`
- Application: `finalPrice = unitPrice × (1 + lineMarkup/100)`
- Example: Base price 100, markup 50% → Final price = 100 × 1.5 = 150

### Status Mapping (Russian → English)

**IMPORTANT**: This mapping has been updated to match the actual XML data and application requirements.

| XML Status (Russian) | Application Status | Count in XML | Notes |
|---------------------|-------------------|-------------|-------|
| `Выполнен` | `completed` | ~1,779 | "Completed" - Finished orders |
| `Принят` | `in-progress` | ~352 | "Accepted" - Orders in progress |
| `Отменен` | `canceled` | ~271 | "Cancelled" - Cancelled orders |
| `Предложение` | `proposal` | ~231 | "Proposal" - Proposal/offer orders |
| (other/unknown) | `proposal` (default) | - | Unknown statuses default to proposal |

**Status Mapping Implementation**:
```typescript
const STATUS_MAP: Record<string, string> = {
  'Выполнен': 'completed',
  'Принят': 'in-progress',
  'Отменен': 'canceled',
  'Предложение': 'proposal',
};

function mapStatus(russianStatus: string): string {
  return STATUS_MAP[russianStatus] || 'proposal'; // Default to 'proposal' for unknown
}
```

**Note**: The old statuses (`draft`, `approved`, `billed`) are no longer used. All orders should map to one of the four statuses above.

### Date Parsing

- Parse `OrderDate` and `OrderAddTime` from format: `"YYYY-MM-DD HH:MM:SS"` or `"YYYY-MM-DD"`
- Convert to JavaScript Date objects or PostgreSQL timestamps
- If `OrderAddTime` is empty, use `OrderDate` for `updatedAt`

### Number Parsing

- Handle comma as decimal separator (Russian format)
- Example: `"36,85"` → `36.85`
- Use: `parseFloat(value.replace(',', '.'))`

### Example SQL Mapping Query

```sql
-- Pseudocode for order migration
SELECT 
  CONCAT('order-', o.OrderID) as id,
  CONCAT('client-', o.OrderClientID) as "clientId",
  CASE o.OrderStatus
    WHEN 'Выполнен' THEN 'completed'
    WHEN 'Принят' THEN 'in-progress'
    WHEN 'Отменен' THEN 'canceled'
    WHEN 'Предложение' THEN 'proposal'
    ELSE 'proposal'
  END as status,
  o.OrderDate::timestamp as "createdAt",
  COALESCE(o.OrderAddTime::timestamp, o.OrderDate::timestamp) as "updatedAt",
  CONCAT_WS(' | ', o.OrderID, o.OrderType, o.OrderComments) as "notesInternal",
  o.OrderName as "notesPublic",
  8.5 as "taxRate",
  20 as "globalMarkup",
  'USD' as currency
FROM tblOrders o
WHERE o.OrderClientID IN ('10001', '10004', '10008', ...) -- Filter by client IDs

-- Order jobs query
SELECT 
  CONCAT('oj-', w.WorksOrderID, '-', ROW_NUMBER() OVER (PARTITION BY w.WorksOrderID ORDER BY w.ID)) as id,
  CONCAT('order-', w.WorksOrderID) as "orderId",
  COALESCE(w.WorksCWorksID, '') as "jobId",
  w.WorksName as "jobName",
  w.WorksName as description,
  CAST(REPLACE(w.WorksQuantity, ',', '.') AS NUMERIC) as quantity,
  CAST(REPLACE(COALESCE(w.WorksFirstPrice, w.WorksPrice), ',', '.') AS NUMERIC) as "unitPrice",
  (CAST(REPLACE(w.WorksRatio, ',', '.') AS NUMERIC) - 1) * 100 as "lineMarkup",
  true as "taxApplicable",
  ROW_NUMBER() OVER (PARTITION BY w.WorksOrderID ORDER BY w.ID) - 1 as position
FROM tblWorks w
WHERE w.WorksOrderID IN (SELECT OrderID FROM tblOrders WHERE OrderClientID IN (...))
```

## Data Validation Rules

1. **Required Fields**:
   - Client: `name`, `company`, `createdAt`
   - Order: `id`, `clientId`, `status`, `createdAt`
   - OrderJob: `id`, `orderId`, `jobName`, `quantity`, `unitPrice`, `lineMarkup`

2. **Data Cleaning**:
   - Trim whitespace from all string fields
   - Remove empty/null values where appropriate
   - Validate date formats before parsing
   - Validate numeric formats (handle comma decimals)

3. **Error Handling**:
   - Log skipped records with reasons
   - Handle missing foreign key references
   - Default values for optional fields
   - Validate markup conversion results (should be >= 0)

## Migration Steps

1. **Parse XML File**:
   - Use XML parser to extract table data
   - Handle encoding (UTF-8)
   - Parse all relevant tables

2. **Transform Data**:
   - Apply field mappings
   - Convert data types
   - Apply conversion formulas (markup, dates, numbers)
   - Handle multiple contacts per client
   - Join orders with works

3. **Validate Data**:
   - Check required fields
   - Validate data types
   - Check foreign key relationships
   - Verify conversion results

4. **Insert into Supabase**:
   - Insert clients first (for foreign key constraints)
   - Insert orders in batches (100 per batch)
   - Insert order jobs in batches (100 per batch)
   - Handle conflicts (update vs. skip)

5. **Verify Migration**:
   - Count records
   - Spot check sample records
   - Verify relationships
   - Check calculated fields
   - Run status comparison script to verify all statuses match XML

## Notes

- All dates should be stored as UTC timestamps in Supabase
- Bank information is stored as JSONB object in `bank` column
- Tax IDs (INN, KPP, OGRN) are stored as strings
- Markup values are stored as numeric percentages (0-100+)
- Order jobs are linked to orders via `orderId` foreign key
- Client IDs from XML should be preserved in a mapping table for reference
- **Status Mapping**: Only 4 statuses are used: `completed`, `in-progress`, `canceled`, `proposal`
- **Batch Processing**: Order jobs are fetched in batches to avoid N+1 query problems
- **Default Status**: Unknown statuses default to `proposal` (not `completed`)

## Migration Script Features

The migration script (`scripts/migrate-xml-to-supabase.ts`) includes:

1. **Batch Job Fetching**: Fetches all `order_jobs` in batches instead of per-order queries (avoids N+1 problem)
2. **Progressive Loading Support**: Designed to work with progressive loading in the application
3. **Status Mapping**: Correctly maps all XML statuses to application statuses (see Status Mapping section)
4. **Error Handling**: Logs errors and continues processing
5. **Upsert Support**: Uses upsert to handle duplicate IDs gracefully
6. **XML Pre-processing**: Handles invalid XML tags (e.g., email addresses as tag names)
7. **Fallback Parsing**: If `tblWorks` not found in main parse, uses regex fallback to extract works section

### Batch Processing Details

- **Clients**: Inserted in batches of 100
- **Orders**: Inserted in batches of 100
- **Order Jobs**: Inserted in batches of 100
- **Job Fetching**: All order_jobs for a batch of orders are fetched in a single query using `.in()` operator

## Troubleshooting

### Status Mismatches

If statuses don't match after migration:
1. Run `npx tsx scripts/compare-order-statuses.ts` to identify discrepancies
2. Run `npx tsx scripts/fix-order-statuses.ts` to correct them

### Missing Orders

If some orders are missing:
1. Check XML file for parsing errors
2. Verify client IDs exist in the database
3. Check migration script logs for skipped orders

### Performance Issues

For large datasets (2000+ orders):
- The script uses batch processing
- Consider running during off-peak hours
- Monitor Supabase rate limits

## Testing

Before full migration:
1. Test with small sample (2-3 clients, 5-10 orders)
2. Verify all mappings work correctly
3. Check markup conversion accuracy
4. Validate date parsing
5. Test contact handling with multiple contacts
6. Verify status mappings

## Post-Migration Verification

After running the migration script, verify the data:

1. **Status Distribution Check**:
   ```bash
   # Run the comparison script to verify all statuses match XML
   npx tsx scripts/compare-order-statuses.ts
   ```

2. **Expected Status Counts** (from XML):
   - `completed`: ~1,779 orders (Выполнен)
   - `in-progress`: ~352 orders (Принят)
   - `canceled`: ~271 orders (Отменен)
   - `proposal`: ~231 orders (Предложение)

3. **Fix Statuses if Needed**:
   ```bash
   # If statuses don't match, run the fix script
   npx tsx scripts/fix-order-statuses.ts
   ```

## Important Notes

- **Status Mapping**: The status mapping has been updated. Old statuses (`draft`, `approved`, `billed`) are no longer used.
- **Default Status**: Unknown statuses default to `proposal` (not `completed`).
- **Batch Job Fetching**: The migration script now uses batch fetching for `order_jobs` to avoid N+1 query problems.
- **Progressive Loading**: For large datasets, consider using progressive loading when fetching orders in the application.

