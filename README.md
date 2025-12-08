# Premium Welding & Fabrication CRM

A comprehensive Customer Relationship Management (CRM) and job management application designed for small welding and repair businesses.

## Features

### Core Functionality

1. **Client Management**
   - Store and manage customer profiles
   - Track contact details and business information
   - View client order history and lifetime value
   - Quick access to client-related orders

2. **Order Creation & Tracking**
   - Create and manage orders linked to clients
   - Track order status through workflow stages
   - Add line items from job catalog
   - Real-time pricing calculations

3. **Job Catalog**
   - Maintain reusable job templates
   - Set default pricing and units of measure
   - Organize by categories
   - Quick search and filtering

4. **Job Presets**
   - Bundle frequently used jobs together
   - Set default quantities for preset items
   - Rapid order assembly for common work packages

5. **Markup & Pricing Control**
   - Apply global or per-line markup percentages
   - Configure tax rates
   - Real-time total calculations
   - Override pricing on individual line items

6. **Document Generation**
   - Generate professional invoices
   - Create purchase orders
   - Customizable templates with variable substitution
   - Preview before export

7. **Business Settings**
   - Configure company information
   - Set financial defaults (tax rates, markup)
   - Customize document numbering formats
   - Manage preferences

## Pages

### Dashboard
- Overview of business metrics (open orders, revenue, etc.)
- Recent orders and clients
- Quick actions for common tasks

### Clients
- Searchable client list
- Filter and sort capabilities
- Quick access to client details

### Client Detail
- Complete client profile
- Order history
- Contact information
- Notes and files (coming soon)

### Orders
- All orders with advanced filtering
- Filter by status (Draft, Approved, In Progress, Completed, Billed)
- Search by order ID, client, or notes

### Order Detail/Builder
- Core workspace for order management
- Add jobs individually or via presets
- Inline editing of quantities, prices, and markup
- Real-time pricing summary
- Document generation

### Job Catalog
- Browse and manage job templates
- Create, edit, and delete jobs
- Filter by category
- Set default pricing and tax behavior

### Job Presets
- Create bundles of common job combinations
- Set default quantities
- Organize by category

### Document Templates
- View invoice and PO templates
- Variable reference guide
- Template customization (coming soon)

### Settings
- Company information management
- Financial defaults
- Document numbering configuration

## Design System

### Colors
- **Primary**: #1F744F (Deep Green)
- **Secondary**: #1E2025 (Dark Neutral Gray)
- **Accent**: #50CF56 (Bright Green)
- **Background**: #F7F8F8
- **Surface**: #FFFFFF

### Typography
- **Font Family**: Inter
- **Base Size**: 16px
- **Line Height**: 140% (body), 120% (headings)

### Spacing
- Base unit: 4px
- Scale: xs(4px), sm(8px), md(12px), lg(16px), xl(24px), 2xl(32px), 3xl(48px), 4xl(64px)

### Components
- **Border Radius**: 8px (inputs/buttons), 12px (cards)
- **Shadows**: Minimal, only on hover states
- **Status Pills**: Color-coded by order status

## Accessibility

- WCAG AA compliant
- Semantic HTML throughout
- Proper ARIA labels and roles
- Keyboard navigation support
- Focus indicators
- Screen reader friendly

## Technology Stack

- **Framework**: React 18
- **Styling**: Tailwind CSS v4
- **UI Components**: Custom component library (shadcn/ui)
- **Icons**: Lucide React
- **State Management**: React Context API
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Notifications**: Sonner

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase project (see [DEPLOYMENT.md](./DEPLOYMENT.md))
- Admin user account in Supabase Auth

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/konscodes/client-code.git
   cd client-code
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   - Copy `.env.example` to `.env.local`
   - Add your Supabase URL and anon key:
     ```env
     VITE_SUPABASE_URL=your-project-url
     VITE_SUPABASE_ANON_KEY=your-anon-key
     ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Access the application:**
   - Open http://localhost:5173
   - Log in with your Supabase admin credentials

### Data Migration (Optional)

If you have XML data to migrate:

1. Place `servicemk3.xml` in the project root
2. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`
3. Run migration:
   ```bash
   npm run migrate
   ```

See [XML_MIGRATION_GUIDE.md](./docs/XML_MIGRATION_GUIDE.md) for detailed migration instructions.

### Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Future Enhancements

- [ ] PDF export for invoices and POs
- [ ] Email integration
- [ ] File attachments for clients and orders
- [ ] Advanced reporting and analytics
- [ ] User management and permissions
- [ ] Data import/export
- [ ] Mobile responsive improvements
- [ ] Dark mode support

## Architecture

### Component Structure
```
/components
  /ui - Reusable UI components
  app-layout.tsx - Main application shell
  kpi-card.tsx - Dashboard metric cards
  status-pill.tsx - Order status indicators

/pages
  dashboard.tsx - Main dashboard
  clients-list.tsx - Client browse/search
  client-detail.tsx - Single client view
  orders-list.tsx - Order browse/search
  order-detail.tsx - Order builder/editor
  job-catalog.tsx - Job template management
  job-presets.tsx - Preset bundle management
  document-templates.tsx - Template configuration
  settings.tsx - Application settings

/lib
  app-context.tsx - Global state management
  types.ts - TypeScript type definitions
  utils.ts - Helper functions
```

### State Management
- Global application state managed via React Context
- Supabase database for data persistence
- Real-time data synchronization with Supabase
- Authentication state managed via Supabase Auth

## License

This is a prototype application built for demonstration purposes.
