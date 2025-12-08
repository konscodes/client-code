# Usage Guide - Premium Welding CRM

## Quick Start Workflows

### Creating Your First Order

1. **Navigate to Orders** - Click "Orders" in the sidebar
2. **Create New Order** - Click the "New Order" button
3. **Select Client** - Choose a client from the dropdown (or create a new one)
4. **Add Line Items**:
   - Click "Add Job" to select individual jobs
   - OR click "Add Preset" to add a bundle of jobs
5. **Adjust Quantities & Pricing**:
   - Edit quantity, unit price, or markup for each line item
   - Apply global markup to all items at once
6. **Set Tax Rate** - Adjust if different from default
7. **Save Order** - Click "Save Changes" or "Create Order"

### Managing Clients

#### Add a New Client
1. Click "Clients" in sidebar
2. Click "New Client" button
3. Fill in required fields (Name and Email are mandatory)
4. Add optional information (company, phone, address, tax ID, notes)
5. Click "Create Client"

#### View Client Details
1. Click on any client in the Clients list
2. View:
   - Contact information
   - Business details
   - Statistics (total orders, lifetime value)
   - Order history
3. Click "New Order" to create an order for this client

### Creating Job Templates

1. Navigate to "Job Catalog"
2. Click "New Job"
3. Enter job information:
   - Name (e.g., "MIG Welding - Steel")
   - Category (e.g., "Welding")
   - Description
   - Unit Price
   - Unit of Measure (e.g., "hour", "unit")
4. Check "Tax applicable" if this job should include tax by default
5. Click "Create Job"

### Building Job Presets

1. Navigate to "Presets"
2. Click "New Preset"
3. Enter preset information:
   - Name (e.g., "Standard Steel Welding Package")
   - Category
   - Description
4. Click "Add Job" to include jobs in the preset
5. Set default quantity for each job
6. Click "Create Preset"

### Understanding Order Status Flow

Orders progress through these statuses:
- **Draft** - Order is being created/edited
- **Approved** - Order approved, ready to start
- **In Progress** - Work is underway
- **Completed** - Work finished, ready to bill
- **Billed** - Invoice sent to client

### Working with Pricing

#### Line-Level Markup
- Each line item can have its own markup percentage
- Markup is calculated on top of (Quantity × Unit Price)
- Formula: `Total = (Qty × Price) × (1 + Markup/100)`

#### Global Markup
1. Set "Global Markup %" in the order sidebar
2. Click "Apply to All Jobs" to update all line items
3. You can still adjust individual line markups after applying

#### Tax Calculation
- Tax is calculated on the subtotal (after markup)
- Tax percentage can be customized per order
- Formula: `Tax = Subtotal × (Tax Rate / 100)`

### Generating Documents

1. Create and save an order
2. Add at least one line item
3. In the order detail page, find the "Documents" section
4. Click "Generate Invoice" or "Generate PO"
5. (Feature coming soon - currently shows placeholder)

### Configuring Company Settings

1. Navigate to "Settings" in sidebar
2. Choose a tab:
   - **Company** - Business information, contact details
   - **Financial** - Default tax rate, markup, currency
   - **Documents** - Invoice and PO number prefixes
3. Make changes
4. Click "Save Changes" when done

### Keyboard Shortcuts & Tips

- **Search** - Use the search bars to quickly find clients, orders, or jobs
- **Filters** - Use status filters on Orders page to focus on specific stages
- **Categories** - Filter Job Catalog and Presets by category
- **Quick Actions** - Dashboard provides quick links to create clients and orders

### Dashboard KPI Cards

Click on KPI cards to filter the Orders view:
- **Open Orders** - Shows In Progress + Approved orders
- **Awaiting Invoice** - Shows Completed orders
- **Draft Orders** - Shows draft orders
- **This Month Revenue** - Total from Completed + Billed orders this month

### Best Practices

1. **Create Job Templates First** - Build your catalog before creating orders
2. **Use Presets for Common Work** - Save time with frequently-used job combinations
3. **Set Realistic Markup** - Configure default markup in Settings
4. **Update Order Status** - Keep statuses current for accurate reporting
5. **Add Client Notes** - Document special requirements or preferences
6. **Review Before Billing** - Check all details before marking as Billed

### Data Organization Tips

#### Client Naming
- Use consistent naming format
- Include company name for clarity

#### Job Categorization
Common categories:
- Welding
- Fabrication
- Finishing
- Repair
- Cutting

#### Order Notes
- **Internal Notes** - For your team (not shown to clients)
- **Public Notes** - Appears on invoices and documents

### Troubleshooting

**Can't save an order?**
- Ensure a client is selected
- Check that required fields are filled

**Pricing doesn't look right?**
- Verify markup percentages
- Check tax rate setting
- Ensure unit prices are correct

**Can't find a job?**
- Use the search function
- Check category filters
- Verify job exists in Job Catalog

**Changes not saving?**
- Look for "Save" or "Save Changes" button
- Check for validation errors (shown in red)

## Example Workflows

### Scenario: Rush Welding Job

1. Go to Orders → New Order
2. Select client "Anderson Manufacturing"
3. Click "Add Preset" → "Standard Steel Welding Package"
4. Adjust quantities as needed
5. Add internal note: "Rush order - customer needs by end of week"
6. Set status to "Approved"
7. Save order
8. Generate invoice when complete

### Scenario: Custom Fabrication Quote

1. Create new client (if needed)
2. Create new order
3. Add individual jobs:
   - Steel Cutting (8 hours)
   - Frame Fabrication (2 units)
   - MIG Welding (10 hours)
   - Powder Coating (2 units)
4. Apply 25% markup
5. Review pricing in summary
6. Keep as "Draft" until approved
7. Generate PO for client review

## Support

This is a prototype application. For additional features or customization, modifications can be made to the source code.
