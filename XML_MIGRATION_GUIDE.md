# XML to Supabase Database Migration Guide

This document contains the complete data mapping and conversion rules for migrating data from the XML database export (`servicemk3.xml`) to Supabase.

## Overview

The XML database contains 15 tables with Russian-language data from a ServiceMK3 system. This guide documents how to map and convert this data to the application's data structure.

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
| `OrderID` | `tblOrders` | `id` | Prefix with 'ORD-XML-' for imported orders |
| `OrderClientID` | `tblOrders` | `clientId` | Map to client ID (e.g., 'client-xml-10001') |
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
| `WorksPrice` | `tblWorks` | `unitPrice` | Parse as float, handle comma decimal separator |
| `WorksQuantity` | `tblWorks` | `quantity` | Parse as float, handle comma decimal separator |
| `WorksRatio` | `tblWorks` | `lineMarkup` | **See Markup Conversion below** |
| `WorksCWorksID` | `tblWorks` | `jobId` | Link to catalog if exists, otherwise empty string |
| `WorksOrderID` | `tblWorks` | - | Used for joining to parent order |
| - | - | `taxApplicable` | Default: true |
| - | - | `position` | Sequential index (0, 1, 2, ...) |

### Markup Conversion Formula

**CRITICAL**: XML uses a different markup representation than the application.

- **XML Format**: Ratio where 100 = no markup (0%), 110 = 10% markup
- **Application Format**: Percentage where 0 = no markup, 10 = 10% markup

**Conversion Formula**:
```
lineMarkup = (WorksRatio - 100) / 10
```

**Examples**:
- XML `WorksRatio = 100` → `lineMarkup = 0` (0% markup)
- XML `WorksRatio = 110` → `lineMarkup = 10` (10% markup)
- XML `WorksRatio = 120` → `lineMarkup = 20` (20% markup)
- XML `WorksRatio = 150` → `lineMarkup = 50` (50% markup)

**Implementation**:
```javascript
const xmlRatio = parseFloat(worksRatio.replace(',', '.'));
const lineMarkup = (xmlRatio - 100) / 10;
```

### Status Mapping (Russian → English)

| XML Status (Russian) | Application Status |
|---------------------|-------------------|
| `Выполнен` | `completed` |
| `В работе` | `in-progress` |
| `Ожидает` | `approved` |
| `Черновик` | `draft` |
| `Оплачен` | `billed` |
| (other/unknown) | `completed` (default) |

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
  CONCAT('ORD-XML-', o.OrderID) as id,
  CONCAT('client-xml-', o.OrderClientID) as "clientId",
  CASE o.OrderStatus
    WHEN 'Выполнен' THEN 'completed'
    WHEN 'В работе' THEN 'in-progress'
    WHEN 'Ожидает' THEN 'approved'
    WHEN 'Черновик' THEN 'draft'
    WHEN 'Оплачен' THEN 'billed'
    ELSE 'completed'
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
  CONCAT('oj-xml-', w.WorksOrderID, '-', ROW_NUMBER() OVER (PARTITION BY w.WorksOrderID ORDER BY w.ID)) as id,
  CONCAT('ORD-XML-', w.WorksOrderID) as "orderId",
  COALESCE(w.WorksCWorksID, '') as "jobId",
  w.WorksName as "jobName",
  w.WorksName as description,
  CAST(REPLACE(w.WorksQuantity, ',', '.') AS NUMERIC) as quantity,
  CAST(REPLACE(w.WorksPrice, ',', '.') AS NUMERIC) as "unitPrice",
  (CAST(REPLACE(w.WorksRatio, ',', '.') AS NUMERIC) - 100) / 10 as "lineMarkup",
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
   - Insert orders
   - Insert order jobs
   - Handle conflicts (update vs. skip)

5. **Verify Migration**:
   - Count records
   - Spot check sample records
   - Verify relationships
   - Check calculated fields

## Notes

- All dates should be stored as UTC timestamps in Supabase
- Bank information is stored as JSONB object in `bank` column
- Tax IDs (INN, KPP, OGRN) are stored as strings
- Markup values are stored as numeric percentages (0-100+)
- Order jobs are linked to orders via `orderId` foreign key
- Client IDs from XML should be preserved in a mapping table for reference

## Testing

Before full migration:
1. Test with small sample (2-3 clients, 5-10 orders)
2. Verify all mappings work correctly
3. Check markup conversion accuracy
4. Validate date parsing
5. Test contact handling with multiple contacts
6. Verify status mappings

