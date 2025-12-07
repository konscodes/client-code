from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from http.server import BaseHTTPRequestHandler
import io
import json

def add_company_header(doc, company_data):
    """Add company information header"""
    # Company name
    company_name = doc.add_paragraph()
    company_name.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = company_name.add_run(company_data.get('name', ''))
    run.font.size = Pt(16)
    run.font.bold = True
    
    # Company details
    if company_data.get('address'):
        doc.add_paragraph(company_data['address'])
    if company_data.get('phone'):
        doc.add_paragraph(f"Phone: {company_data['phone']}")
    
    # Add spacing
    doc.add_paragraph()

def add_client_info(doc, client_data):
    """Add client billing information"""
    doc.add_paragraph("Bill To:", style='Heading 3')
    
    client_name = doc.add_paragraph()
    client_name.add_run(client_data.get('name', '')).bold = True
    
    if client_data.get('address'):
        doc.add_paragraph(client_data['address'])
    if client_data.get('phone'):
        doc.add_paragraph(f"Phone: {client_data['phone']}")
    
    doc.add_paragraph()

def add_order_info(doc, order_data, doc_type):
    """Add order information"""
    info_para = doc.add_paragraph()
    
    if doc_type == 'po':
        info_para.add_run("PURCHASE ORDER").bold = True
        info_para.add_run(f"\nOrder #: {order_data.get('id', '')}")
        info_para.add_run(f"\nDate: {order_data.get('date', '')}")
        if order_data.get('poNumber'):
            info_para.add_run(f"\nPO Number: {order_data['poNumber']}")
    else:  # invoice
        info_para.add_run("INVOICE").bold = True
        info_para.add_run(f"\nInvoice #: {order_data.get('invoiceNumber', '')}")
        info_para.add_run(f"\nDate: {order_data.get('date', '')}")
        info_para.add_run(f"\nOrder #: {order_data.get('id', '')}")
    
    doc.add_paragraph()

def add_items_table(doc, jobs_data):
    """Add items table with proper formatting"""
    if not jobs_data:
        doc.add_paragraph("No items")
        return
    
    # Create table
    table = doc.add_table(rows=1, cols=5)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    # Header row
    hdr_cells = table.rows[0].cells
    headers = ['Item', 'Description', 'Quantity', 'Unit Price', 'Total']
    
    for i, header in enumerate(headers):
        cell = hdr_cells[i]
        cell.text = header
        # Make header bold
        for paragraph in cell.paragraphs:
            for run in paragraph.runs:
                run.font.bold = True
    
    # Add data rows
    for job in jobs_data:
        row_cells = table.add_row().cells
        row_cells[0].text = job.get('code', '')
        row_cells[1].text = job.get('name', '')
        row_cells[2].text = f"{job.get('qty', 0)} {job.get('unit', '')}"
        row_cells[3].text = f"${job.get('unitPrice', '0.00')}"
        row_cells[4].text = f"${job.get('lineTotal', '0.00')}"
    
    doc.add_paragraph()

def add_totals(doc, order_data):
    """Add totals section"""
    doc.add_paragraph()
    
    # Create totals table
    totals_table = doc.add_table(rows=3, cols=2)
    totals_table.style = 'Table Grid'
    
    # Subtotal
    totals_table.cell(0, 0).text = "Subtotal:"
    totals_table.cell(0, 1).text = f"${order_data.get('subtotal', '0.00')}"
    
    # Tax
    totals_table.cell(1, 0).text = "Tax:"
    totals_table.cell(1, 1).text = f"${order_data.get('tax', '0.00')}"
    
    # Total
    total_cell = totals_table.cell(2, 0)
    total_cell.text = "TOTAL:"
    for paragraph in total_cell.paragraphs:
        for run in paragraph.runs:
            run.font.bold = True
    
    total_amount_cell = totals_table.cell(2, 1)
    total_amount_cell.text = f"${order_data.get('total', '0.00')}"
    for paragraph in total_amount_cell.paragraphs:
        for run in paragraph.runs:
            run.font.bold = True

def generate_document(data, doc_type):
    """Generate DOCX document from data"""
    doc = Document()
    
    # Add company header
    add_company_header(doc, data.get('company', {}))
    
    # Add client info
    add_client_info(doc, data.get('client', {}))
    
    # Add order info
    add_order_info(doc, data.get('order', {}), doc_type)
    
    # Add items table
    add_items_table(doc, data.get('jobs', []))
    
    # Add totals
    add_totals(doc, data.get('order', {}))
    
    return doc

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        """Handle POST requests to generate DOCX documents"""
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error_response(400, 'Request body is required')
                return
            
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            doc_type = data.get('type', 'po')
            
            # Generate document
            doc = generate_document(data, doc_type)
            
            # Save to BytesIO
            doc_buffer = io.BytesIO()
            doc.save(doc_buffer)
            doc_buffer.seek(0)
            doc_bytes = doc_buffer.getvalue()
            
            # Generate filename
            filename = f"{doc_type}-{data.get('order', {}).get('id', 'document')}.docx"
            
            # Send response
            self.send_response(200)
            self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(doc_bytes)))
            self.end_headers()
            self.wfile.write(doc_bytes)
            
        except json.JSONDecodeError as e:
            self.send_error_response(400, f'Invalid JSON: {str(e)}')
        except Exception as e:
            self.send_error_response(500, f'Error generating document: {str(e)}')
    
    def do_GET(self):
        """Handle GET requests for health check"""
        if self.path == '/api/generate' or self.path.endswith('/generate'):
            # Health check endpoint
            response = json.dumps({'status': 'healthy'}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(response)))
            self.end_headers()
            self.wfile.write(response)
        else:
            self.send_error_response(404, 'Not Found')
    
    def send_error_response(self, status_code, message):
        """Send error response with JSON body"""
        error_response = json.dumps({'error': message}).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(error_response)))
        self.end_headers()
        self.wfile.write(error_response)
    
    def log_message(self, format, *args):
        """Suppress default logging"""
        pass

