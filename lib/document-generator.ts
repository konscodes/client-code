// Document generation utility for invoices and purchase orders
import type { Order, Client, CompanySettings, OrderJob } from './types';
import { getOrderTotals, formatDate } from './utils';

// Use Vercel serverless function endpoint
const PYTHON_SERVICE_URL = '/api/generate';

interface DocumentData {
  type: 'invoice' | 'po';
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
    taxId?: string;
  };
  client: {
    name: string;
    company: string;
    address: string;
    phone: string;
    email: string;
  };
  order: {
    id: string;
    date: string;
    invoiceNumber?: string;
    poNumber?: string;
    subtotal: string;
    tax: string;
    total: string;
  };
  jobs: Array<{
    code: string;
    name: string;
    qty: string;
    unit: string;
    unitPrice: string;
    lineTotal: string;
  }>;
}

function formatDocumentData(
  order: Order,
  client: Client,
  companySettings: CompanySettings,
  documentType: 'invoice' | 'po',
  documentNumber: string
): DocumentData {
  const totals = getOrderTotals(order);
  
  // Format jobs for the Python service
  const jobs = order.jobs.map((job: OrderJob, index: number) => {
    const lineTotal = job.quantity * job.unitPrice * (1 + job.lineMarkup / 100);
    
    return {
      code: `JOB-${(index + 1).toString().padStart(3, '0')}`,
      name: job.jobName || job.description || 'Job Item',
      qty: job.quantity.toString(),
      unit: 'unit', // Could be enhanced to use unitOfMeasure from job template
      unitPrice: job.unitPrice.toFixed(2),
      lineTotal: lineTotal.toFixed(2),
    };
  });
  
  const orderData: DocumentData = {
    type: documentType,
    company: {
      name: companySettings.name,
      address: companySettings.address,
      phone: companySettings.phone,
      email: companySettings.email,
      taxId: companySettings.taxId,
    },
    client: {
      name: client.name || 'Unknown',
      company: client.company || '',
      address: client.address || '',
      phone: client.phone || '',
      email: client.email || '',
    },
    order: {
      id: order.id,
      date: formatDate(order.createdAt),
      subtotal: totals.subtotal.toFixed(2),
      tax: totals.tax.toFixed(2),
      total: totals.total.toFixed(2),
    },
    jobs,
  };
  
  if (documentType === 'invoice') {
    orderData.order.invoiceNumber = documentNumber;
  } else {
    orderData.order.poNumber = documentNumber;
  }
  
  return orderData;
}

async function downloadDocument(data: DocumentData): Promise<void> {
  try {
    const response = await fetch(PYTHON_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`Document generation failed: ${response.statusText}`);
    }
    
    // Get the blob from response
    const blob = await response.blob();
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.type}-${data.order.id}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating document:', error);
    throw error;
  }
}

export async function generateInvoice(
  order: Order,
  client: Client,
  companySettings: CompanySettings,
  invoiceNumber: string
): Promise<void> {
  const data = formatDocumentData(order, client, companySettings, 'invoice', invoiceNumber);
  await downloadDocument(data);
}

export async function generatePurchaseOrder(
  order: Order,
  client: Client,
  companySettings: CompanySettings,
  poNumber: string
): Promise<void> {
  const data = formatDocumentData(order, client, companySettings, 'po', poNumber);
  await downloadDocument(data);
}

