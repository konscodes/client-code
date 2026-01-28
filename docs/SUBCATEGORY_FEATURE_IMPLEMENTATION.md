# Job Subcategories Feature Implementation

## Overview

This document describes the implementation of subcategory dividers for order jobs, enabling users to organize jobs into sections with drag-and-drop reordering.

## Feature Requirements

Based on the user's screenshot showing a Russian document with sections like "Лепестки грейфера" (Grapple petals), "Гидроцилиндры" (Hydraulic cylinders), and "Станина" (Frame):

1. **Subcategory dividers** in the order job list
2. **Visual distinction** for subcategory rows vs regular jobs
3. **Drag-and-drop** reordering for jobs and subcategories
4. **Document generation** that renders section headers
5. **Numbering restarts** for each subcategory section
6. **Empty subcategories** are allowed in UI but hidden in generated documents

## Database Schema Changes

### Migration: `add_order_jobs_type.sql`

Added `type` column to `order_jobs` table:

```sql
ALTER TABLE order_jobs
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'job';

ALTER TABLE order_jobs
ADD CONSTRAINT order_jobs_type_check CHECK (type IN ('job', 'subcategory'));
```

- `type = 'job'`: Regular job item (default)
- `type = 'subcategory'`: Section header/divider

When `type = 'subcategory'`:
- `jobName` stores the subcategory title
- Other fields (quantity, unitPrice, etc.) are null/zero

## TypeScript Changes

### `lib/types.ts`

```typescript
export type OrderJobType = 'job' | 'subcategory';

export interface OrderJob {
  // ... existing fields ...
  type?: OrderJobType; // Optional for backward compatibility, defaults to 'job'
}
```

### `lib/app-context.tsx`

- `dbRowToOrderJob()`: Includes `type: row.type || 'job'`
- Insert/update mutations include `type` field

### `lib/document-generator.ts`

- Updated `DocumentData` interface to include `type` in jobs array
- `formatDocumentData()` passes `type` field to Python service
- Subcategory items have zero values for qty, price, lineTotal

## UI Implementation

### `pages/order-detail.tsx`

#### New Imports
```typescript
import { GripVertical, FolderPlus } from 'lucide-react';
import { DndContext, closestCenter, ... } from '@dnd-kit/core';
import { arrayMove, SortableContext, ... } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

#### SortableRow Component
Wrapper component for drag-and-drop functionality on table rows.

#### Key Functions
- `handleAddSubcategory()`: Creates new subcategory row with edit mode
- `handleDragEnd()`: Reorders items and updates positions
- `hasSubcategories`: Computed value to force table view when subcategories exist

#### Visual Design
- Subcategory rows: Light blue background (`#F0F4F8`), bold text
- Name cell aligned with job name column (same width)
- Empty cells for qty/price/markup/total columns
- Drag handle on all rows
- Pencil edit button aligned with job rows

#### Mobile/Card View
When subcategories are present, forces table view (card view doesn't support subcategories well).

## Document Generation

### `python-service/docx_generator.py`

Updated `add_work_description()` function:

1. **Filter empty subcategories**: Subcategories with no jobs beneath them are excluded
2. **Render subcategory headers**: Full-width merged row with gray background (#D3D3D3), bold centered text
3. **Restart numbering**: Job numbers reset to 1 for each section
4. **Column width calculation**: Uses only actual jobs (not subcategories)

Example output:
```
|  №  | Наименование        | Кол-во | Стоимость | Сумма    |
|-----|---------------------|--------|-----------|----------|
|            Лепестки грейфера              |          |  <- merged, gray
|  1  | Замена коронок      | 5      | 12,063    | 60,315   |
|  2  | Восстановление...   | 5      | 20,438    | 102,190  |
|            Гидроцилиндры                  |          |  <- merged, gray
|  1  | Изготовление...     | 10     | 7,370     | 73,700   |
```

## Translations

### `locales/en.json`
```json
{
  "orderDetail": {
    "addSubcategory": "Add Subcategory",
    "subcategoryAdded": "Subcategory added",
    "subcategoryNamePlaceholder": "Enter subcategory name...",
    "editSubcategoryName": "Edit subcategory name"
  }
}
```

### `locales/ru.json`
```json
{
  "orderDetail": {
    "addSubcategory": "Добавить раздел",
    "subcategoryAdded": "Раздел добавлен",
    "subcategoryNamePlaceholder": "Введите название раздела...",
    "editSubcategoryName": "Редактировать название раздела"
  }
}
```

## Dependencies Added

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

## Files Modified

1. `migrations/add_order_jobs_type.sql` - New migration file
2. `lib/types.ts` - Added OrderJobType and type field
3. `lib/app-context.tsx` - Updated data handling
4. `lib/document-generator.ts` - Pass type to Python service
5. `pages/order-detail.tsx` - UI with drag-and-drop
6. `python-service/docx_generator.py` - Render subcategory headers
7. `locales/en.json` - English translations
8. `locales/ru.json` - Russian translations

## Presets Support (Phase 6)

### Database Migration: `add_preset_jobs_type.sql`

Added columns to `preset_jobs` table:

```sql
ALTER TABLE preset_jobs
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'job';

ALTER TABLE preset_jobs
ADD COLUMN IF NOT EXISTS "subcategoryName" TEXT;

ALTER TABLE preset_jobs
ADD CONSTRAINT preset_jobs_type_check CHECK (type IN ('job', 'subcategory'));
```

### `lib/types.ts`

```typescript
export type PresetJobType = 'job' | 'subcategory';

export interface PresetJob {
  jobId: string;
  defaultQty: number;
  position: number;
  type?: PresetJobType;
  subcategoryName?: string; // Only used when type='subcategory'
}
```

### `lib/app-context.tsx`

- Updated `dbRowToJobPreset` to include `type` and `subcategoryName`
- Updated insert operations for `preset_jobs` to save these fields

### Database Migration: `add_preset_jobs_price.sql`

Added price column to `preset_jobs` table:

```sql
ALTER TABLE preset_jobs
ADD COLUMN IF NOT EXISTS "defaultPrice" DECIMAL(10,2);
```

### `pages/job-presets.tsx`

- Added "Add Subcategory" button next to "Add Job"
- Subcategory rows shown with light blue background (`#F0F4F8`)
- Inline editing for subcategory names
- Same edit pattern as order page (click to edit, Enter to save)
- **Drag-and-drop reordering** using `@dnd-kit` for jobs and subcategories
- **Price input** for each job in preset (captured from job template, editable)

### `pages/order-detail.tsx`

Updated `handleAddPreset` to:
- Handle subcategory items from presets
- Create both jobs and subcategories when preset is applied
- Maintain relative positions

## Pending Implementation

### Phase 7: Review and Polish
- Test drag-and-drop edge cases
- Verify document generation with various configurations
- UI polish and responsive design

## Usage

### Adding a Subcategory
1. Click "Add Subcategory" button (or "Добавить раздел" in Russian)
2. Type the subcategory name in the inline input
3. Press Enter or click the check button to save

### Reordering
- Drag the grip handle (⋮⋮) on any row to reorder
- Jobs can be moved between subcategories
- Subcategories can be reordered (jobs within move with them)

### Document Generation
- Click any "Generate" button (Invoice/PO/Specification)
- Subcategory headers appear as merged gray rows
- Job numbering restarts within each section
- Empty subcategories are automatically excluded
