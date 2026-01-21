// Document generation utility for invoices and purchase orders
import type { Order, Client, CompanySettings, OrderJob } from './types';
import { getOrderTotals, formatDate } from './utils';
import { logger } from './logger';
import { supabase } from './supabase';

// Use local Python service in development, Vercel serverless function in production
const PYTHON_SERVICE_URL = 
  import.meta.env.VITE_DOCX_SERVICE_URL || 
  (import.meta.env.DEV ? 'http://localhost:5001/generate' : '/api/generate');

interface DocumentData {
  type: 'invoice' | 'po' | 'specification';
  locale?: string;
  documentPrefix?: string; // Prefix for filename (e.g., 'smeta', 'kp', 'spec')
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
    taxId?: string;
    legalForm?: string;
    inn?: string;
    kpp?: string;
    bankAccount?: string;
    bankName?: string;
    correspondentAccount?: string;
    bankBik?: string;
    directorName?: string;
    legalName?: string;
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
    taxRate: string;
    orderTitle?: string;
  };
  jobs: Array<{
    code: string;
    name: string;
    qty: string;
    unit: string;
    unitPrice: string;
    lineTotal: string;
  }>;
  workCompletionDays?: number;
}

function formatDocumentData(
  order: Order,
  client: Client,
  companySettings: CompanySettings,
  documentType: 'invoice' | 'po' | 'specification',
  documentNumber: string
): DocumentData {
  const taxRate = order.taxRate || 0;
  const hasTax = taxRate > 0;
  
  // Format jobs for the Python service - apply tax per line item if tax is set
  const jobs = order.jobs.map((job: OrderJob, index: number) => {
    // Calculate base line total (with markup)
    const baseLineTotal = job.quantity * job.unitPrice * (1 + job.lineMarkup / 100);
    
    // Apply tax per line item if tax is set
    const lineTotal = hasTax 
      ? baseLineTotal * (1 + taxRate / 100)
      : baseLineTotal;
    
    return {
      code: `JOB-${(index + 1).toString().padStart(3, '0')}`,
      name: job.jobName || job.description || 'Job Item',
      qty: job.quantity.toString(),
      unit: 'unit', // Could be enhanced to use unitOfMeasure from job template
      unitPrice: job.unitPrice.toFixed(2),
      lineTotal: lineTotal.toFixed(2),
    };
  });
  
  // Calculate totals from line items (tax already included in line items if applicable)
  const totalWithTax = jobs.reduce((sum, job) => sum + parseFloat(job.lineTotal), 0);
  
  // Calculate tax amount breakdown if tax is applied
  let subtotal = totalWithTax;
  let taxAmount = 0;
  
  if (hasTax) {
    // If tax is included in line items, calculate the subtotal (without tax) and tax amount
    subtotal = totalWithTax / (1 + taxRate / 100);
    taxAmount = totalWithTax - subtotal;
  }
  
  const totals = {
    subtotal,
    tax: taxAmount,
    total: totalWithTax,
  };
  
  // Determine document prefix based on type
  let documentPrefix = '';
  if (documentType === 'invoice') {
    documentPrefix = (companySettings.invoicePrefix || 'invoice').toLowerCase();
  } else if (documentType === 'po') {
    documentPrefix = (companySettings.poPrefix || 'po').toLowerCase();
  } else if (documentType === 'specification') {
    documentPrefix = (companySettings.specPrefix || 'spec').toLowerCase();
  }
  
  const orderData: DocumentData = {
    type: documentType,
    locale: companySettings.locale,
    documentPrefix,
    company: {
      name: companySettings.name,
      address: companySettings.address,
      phone: companySettings.phone,
      email: companySettings.email,
      taxId: companySettings.taxId,
      legalForm: companySettings.legalForm,
      inn: companySettings.inn,
      kpp: companySettings.kpp,
      bankAccount: companySettings.bankAccount,
      bankName: companySettings.bankName,
      correspondentAccount: companySettings.correspondentAccount,
      bankBik: companySettings.bankBik,
      directorName: companySettings.directorName,
      legalName: companySettings.legalName,
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
      taxRate: taxRate.toString(),
      orderTitle: order.orderTitle,
    },
    jobs,
    workCompletionDays: order.timeEstimate ?? 30, // Use order's timeEstimate, default to 30 days if not set
  };
  
  if (documentType === 'invoice') {
    orderData.order.invoiceNumber = documentNumber;
  } else if (documentType === 'po') {
    orderData.order.poNumber = documentNumber;
  } else if (documentType === 'specification') {
    orderData.order.invoiceNumber = documentNumber; // Use invoiceNumber field for specification
  }
  
  return orderData;
}

async function downloadDocument(data: DocumentData): Promise<void> {
  try {
    // Get current session token for authentication
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      throw new Error('Authentication required. Please log in again.');
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    
    logger.debug(`Calling document generation service: ${PYTHON_SERVICE_URL}`);
    
    const response = await fetch(PYTHON_SERVICE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication failed. Please log in again.');
      }
      
      // Try to get error details from response
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        if (errorData.details) {
          logger.error('Document generation error details', new Error(errorData.details));
        }
      } catch {
        // If JSON parsing fails, try text
        try {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        } catch {
          // Use status text as fallback
        }
      }
      
      logger.error(`Document generation failed: ${response.status} ${errorMessage}`, 
        new Error(`HTTP ${response.status}: ${errorMessage}`));
      throw new Error(`Document generation failed: ${errorMessage}`);
    }
    
    // Get the blob from response
    const blob = await response.blob();
    
    // Create download link
    // Filename will be set from Content-Disposition header, but we set a fallback
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // Fallback filename (actual filename comes from Content-Disposition header)
    const orderNumbers = data.order.id.replace(/\D/g, '');
    const fallbackPrefix = data.documentPrefix || data.type;
    link.download = `${fallbackPrefix}-${orderNumbers}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    logger.error('Error generating document', error);
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

export async function generateSpecification(
  order: Order,
  client: Client,
  companySettings: CompanySettings,
  specificationNumber: string
): Promise<void> {
  const data = formatDocumentData(order, client, companySettings, 'specification', specificationNumber);
  await downloadDocument(data);
}

