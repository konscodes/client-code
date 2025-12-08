# XML to Supabase Field Mapping

## Order Fields Mapping

| XML Field | Supabase Field | Transformation | Notes |
|-----------|---------------|----------------|-------|
| `OrderID` | `id` | `order-{OrderID}` | Prefix "order-" added |
| `OrderClientID` | `clientId` | `client-{OrderClientID}` | Via client ID mapping |
| `OrderDate` | `createdAt` | Parsed to ISO date string | Format: "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD" |
| `OrderAddTime` (or `OrderDate`) | `updatedAt` | Parsed to ISO date string | Falls back to OrderDate if OrderAddTime missing |
| `OrderStatus` | `status` | Status mapping (see below) | Russian → English mapping |
| `OrderType` | `orderType` | Cleaned string | Order type (e.g., "Ремонтные работы", "Поставка") |
| `OrderName` | `orderTitle` | Cleaned string | Order description/name |
| - | `taxRate` | **8.5** | Default value (can be set to 0 if needed) |
| - | `globalMarkup` | **20** | Default value |
| - | `currency` | **'USD'** | Default value |

### Status Mapping (Russian → English)
- `Выполнен` → `completed`
- `Принят` → `in-progress`
- `Отменен` → `canceled`
- `Предложение` → `proposal`
- Unknown → `proposal` (default)

## Order Jobs (tblWorks) Fields Mapping

| XML Field | Supabase Field | Transformation | Notes |
|-----------|---------------|----------------|-------|
| `WorksOrderID` | `orderId` | `order-{WorksOrderID}` | Links to order |
| - | `id` | `oj-{WorksOrderID}-{position}` | Generated ID (position starts at 1) |
| `WorksCWorksID` | `jobId` | Cleaned string | Catalog work ID reference |
| `WorksName` | `jobName` | Cleaned string | Trimmed whitespace |
| `WorksName` | `description` | Cleaned string | Same as jobName |
| `WorksQuantity` | `quantity` | Parsed number | Handles comma decimal separator |
| `WorksFirstPrice` (or `WorksPrice`) | `unitPrice` | Parsed number | Prefers WorksFirstPrice (base price) |
| `WorksRatio` | `lineMarkup` | Converted to percentage | Formula: `(ratio - 1) * 100` |
| - | `taxApplicable` | **true** | Default value |
| - | `position` | Index in order | 0-based position within order |

### Markup Conversion
- XML format: `WorksRatio = "1,5"` means 1.5x multiplier = 50% markup
- Supabase format: `lineMarkup = 50` means 50% markup
- Formula: `(ratio - 1) * 100`

### Number Parsing
- Handles comma as decimal separator (Russian format: "1,5" → 1.5)
- Empty values default to 0

## Data Processing Notes

1. **Date Parsing**: Handles both "YYYY-MM-DD" and "YYYY-MM-DD HH:MM:SS" formats
2. **String Cleaning**: Trims whitespace, handles empty/undefined values
3. **Array Handling**: ⚠️ **CRITICAL** - XML parser may return arrays instead of strings
   - Example: `OrderName` might be `["Ремонт кузова"]` instead of `"Ремонт кузова"`
   - Always handle arrays in `cleanString` function:
     ```typescript
     function cleanString(value: string | string[] | undefined): string {
       if (!value) return '';
       if (Array.isArray(value)) {
         return value[0] ? String(value[0]).trim() : '';
       }
       if (typeof value === 'string') {
         return value.trim();
       }
       return String(value).trim();
     }
     ```
4. **Works Sorting**: Order jobs are sorted by their XML ID within each order
5. **Batch Insertion**: Orders and jobs are inserted in batches of 100

## Common Pitfalls

### ⚠️ Field Name Mismatch
- **WRONG**: Using `notesInternal` and `notesPublic`
- **CORRECT**: Use `orderType` and `orderTitle`
- Always verify field names match the actual database schema

### ⚠️ XML Parser Arrays
- The XML parser may return arrays for single-value fields
- Always test parsing with sample data before full migration
- Update `cleanString` to handle arrays

### ⚠️ Missing Order Titles
- After migration, verify orders have `orderTitle` populated
- Run `npx tsx scripts/check-order-titles.ts` to verify
- Use `npx tsx scripts/fix-order-titles.ts` to fix missing titles

