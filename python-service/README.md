# Python DOCX Generation Service

This Python microservice generates professional DOCX documents for the Welding CRM application.

## Features

- **Professional formatting** with proper headers, tables, and styling
- **Purchase Orders** and **Invoices** generation
- **Company information** header with name, address, phone
- **Client billing information** section
- **Order details** with ID, date, PO/Invoice numbers
- **Items table** with proper formatting for job line items
- **Totals section** with subtotal, tax, and total amounts
- **REST API** for easy integration with React frontend

## Local Development Setup

1. **Install Python 3.8+** (if not already installed)

2. **Create virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the service:**
   ```bash
   python docx_generator.py
   ```

   Or use npm script from project root:
   ```bash
   npm run python:dev
   ```

The service will run on `http://localhost:5001` by default.

## Environment Variables

- `PORT` - Port number (default: 5001)
- `FLASK_DEBUG` - Enable debug mode (default: True)

Example:
```bash
PORT=5001 FLASK_DEBUG=False python docx_generator.py
```

## API Endpoints

### `POST /generate`
Generates a DOCX document from provided data.

**Request Body:**
```json
{
  "type": "po",  // or "invoice"
  "company": {
    "name": "Company Name",
    "phone": "555-1234",
    "address": "123 Main St",
    "email": "info@company.com",
    "taxId": "12-3456789"
  },
  "client": {
    "name": "Client Name",
    "company": "Client Company",
    "address": "456 Client St",
    "phone": "555-5678",
    "email": "client@example.com"
  },
  "order": {
    "id": "order-123",
    "date": "Jan 15, 2025",
    "poNumber": "PO-001",
    "invoiceNumber": "INV-001",
    "subtotal": "100.00",
    "tax": "13.00",
    "total": "113.00"
  },
  "jobs": [
    {
      "code": "JOB-001",
      "name": "Welding Service",
      "qty": "2",
      "unit": "hours",
      "unitPrice": "50.00",
      "lineTotal": "100.00"
    }
  ]
}
```

**Response:** DOCX file download

### `GET /health`
Health check endpoint.

**Response:**
```json
{"status": "healthy"}
```

## Document Format

The generated documents include:

1. **Company Header** - Name, address, phone
2. **Client Information** - Billing details
3. **Order Information** - Order ID, date, PO/Invoice numbers
4. **Items Table** - Professional table with:
   - Item code and description
   - Quantity and unit
   - Unit price
   - Line total
5. **Totals Section** - Subtotal, tax, and total amounts

## Production Deployment

Since Vercel doesn't support Python directly, deploy this service separately:

### Option 1: Railway (Recommended)
1. Create account at [railway.app](https://railway.app)
2. Create new project
3. Connect GitHub repository
4. Add Python service directory as root
5. Railway will auto-detect Python and install dependencies
6. Set environment variables in Railway dashboard
7. Get the deployed URL and add to Vercel environment variables as `VITE_DOCX_SERVICE_URL`

### Option 2: Render
1. Create account at [render.com](https://render.com)
2. Create new Web Service
3. Connect repository
4. Set build command: `pip install -r requirements.txt`
5. Set start command: `python docx_generator.py`
6. Set environment variables
7. Get the deployed URL and add to Vercel environment variables

### Option 3: Fly.io
1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Create `fly.toml` configuration
3. Deploy: `fly deploy`
4. Get the deployed URL and add to Vercel environment variables

### Option 4: Heroku
1. Create Heroku app
2. Add `Procfile` with: `web: python docx_generator.py`
3. Deploy via Git
4. Get the deployed URL and add to Vercel environment variables

## Frontend Integration

The React frontend uses the service URL from environment variable:

- Local: `http://localhost:5001/generate` (default)
- Production: Set `VITE_DOCX_SERVICE_URL` in Vercel environment variables

Example `.env.local`:
```
VITE_DOCX_SERVICE_URL=https://your-python-service.railway.app/generate
```

## Advantages over JavaScript Libraries

- ✅ **Much more reliable** than `docxtemplater` or `docx-templates`
- ✅ **Better formatting control** with `python-docx`
- ✅ **Professional table generation**
- ✅ **Proper styling and fonts**
- ✅ **Easier to debug and maintain**
- ✅ **No complex template parsing issues**















