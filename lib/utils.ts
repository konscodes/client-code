// Utility functions for the application
import type { Order, OrderJob, Client } from './types';

export function formatCurrency(
  amount: number, 
  currency?: string, 
  locale?: string
): string {
  // Default to USD and en-US if not provided
  const finalCurrency = currency || 'USD';
  const finalLocale = locale || 'en-US';
  
  return new Intl.NumberFormat(finalLocale, {
    style: 'currency',
    currency: finalCurrency,
  }).format(amount);
}

export function formatDate(date: Date, locale?: string): string {
  const finalLocale = locale || 'en-US';
  
  return new Intl.DateTimeFormat(finalLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(date: Date, locale?: string): string {
  const finalLocale = locale || 'en-US';
  
  return new Intl.DateTimeFormat(finalLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function calculateLineTotal(job: OrderJob): number {
  const baseTotal = job.quantity * job.unitPrice;
  const markupAmount = baseTotal * (job.lineMarkup / 100);
  return baseTotal + markupAmount;
}

export function calculateOrderSubtotal(jobs: OrderJob[]): number {
  return jobs.reduce((sum, job) => sum + calculateLineTotal(job), 0);
}

export function calculateOrderTax(subtotal: number, taxRate: number): number {
  return subtotal * (taxRate / 100);
}

export function calculateOrderTotal(order: Order): number {
  const subtotal = calculateOrderSubtotal(order.jobs);
  const tax = calculateOrderTax(subtotal, order.taxRate);
  return subtotal + tax;
}

export function getOrderTotals(order: Order) {
  const subtotal = calculateOrderSubtotal(order.jobs);
  const tax = calculateOrderTax(subtotal, order.taxRate);
  const total = subtotal + tax;
  
  return {
    subtotal,
    tax,
    total,
  };
}

export function generateOrderId(prefix: string = 'ORD'): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${year}-${random}`;
}

export function generateId(prefix: string = 'item'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getClientOrders(orders: Order[], clientId: string): Order[] {
  return orders.filter(order => order.clientId === clientId);
}

export function getClientLifetimeValue(orders: Order[], clientId: string): number {
  const clientOrders = getClientOrders(orders, clientId);
  return clientOrders.reduce((sum, order) => {
    if (order.status === 'completed' || order.status === 'billed') {
      return sum + calculateOrderTotal(order);
    }
    return sum;
  }, 0);
}

export function getClientLastOrderDate(orders: Order[], clientId: string): Date | null {
  const clientOrders = getClientOrders(orders, clientId);
  if (clientOrders.length === 0) return null;
  
  return clientOrders.reduce((latest, order) => {
    return order.createdAt > latest ? order.createdAt : latest;
  }, clientOrders[0].createdAt);
}

/**
 * Normalizes a phone number to a standard format (digits only with country code)
 * Converts various formats to: 7XXXXXXXXXX (11 digits starting with 7)
 * Examples:
 * - "+7(999)9999999" -> "79999999999"
 * - "+7 999 999 99 99" -> "79999999999"
 * - "8(999)9999999" -> "79999999999"
 * - "9999999999" -> "79999999999" (assumes missing country code)
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove all non-digit characters except leading +
  let digits = phone.replace(/\D/g, '');
  
  // Handle different starting patterns
  if (digits.startsWith('8') && digits.length === 11) {
    // Replace leading 8 with 7 (Russian format)
    digits = '7' + digits.substring(1);
  } else if (digits.startsWith('7') && digits.length === 11) {
    // Already correct format
    digits = digits;
  } else if (digits.length === 10) {
    // Missing country code, add 7
    digits = '7' + digits;
  } else if (digits.length > 11) {
    // Too many digits, take first 11
    digits = digits.substring(0, 11);
  } else if (digits.length < 10) {
    // Too few digits, return as-is (might be incomplete)
    return digits;
  }
  
  // Ensure it starts with 7 and has 11 digits
  if (digits.startsWith('7') && digits.length === 11) {
    return digits;
  }
  
  // If we can't normalize, return original digits
  return digits;
}

/**
 * Formats a phone number for display in Russian format
 * Mobile: +7 (XXX) XXX-XX-XX
 * Landline: +7 (XXXX) XXX-XX-XX or +7 (XXXXX) XX-XX-XX
 * 
 * @param phone - Normalized phone number (11 digits starting with 7) or any format
 * @returns Formatted phone number string
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Normalize first
  const normalized = normalizePhoneNumber(phone);
  
  if (!normalized || normalized.length < 10) {
    // If we can't normalize properly, return original
    return phone;
  }
  
  // Extract the 10 digits after country code (7)
  const digits = normalized.startsWith('7') ? normalized.substring(1) : normalized;
  
  if (digits.length === 10) {
    // Determine if it's mobile or landline based on area code
    const areaCode = digits.substring(0, 3);
    const isMobile = ['9', '8'].includes(areaCode[0]) || 
                     ['900', '901', '902', '903', '904', '905', '906', '907', '908', '909',
                      '910', '911', '912', '913', '914', '915', '916', '917', '918', '919',
                      '920', '921', '922', '923', '924', '925', '926', '927', '928', '929',
                      '930', '931', '932', '933', '934', '935', '936', '937', '938', '939',
                      '950', '951', '952', '953', '960', '961', '962', '963', '964', '965',
                      '966', '967', '968', '969', '977', '978', '980', '981', '982', '983',
                      '984', '985', '986', '987', '988', '989', '991', '992', '993', '994',
                      '995', '996', '997', '999'].includes(areaCode);
    
    if (isMobile) {
      // Mobile format: +7 (XXX) XXX-XX-XX
      return `+7 (${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6, 8)}-${digits.substring(8, 10)}`;
    } else {
      // Landline format: +7 (XXXX) XXX-XX-XX or +7 (XXXXX) XX-XX-XX
      // Most landlines have 3-digit area codes, but some have 4-5
      if (digits.length === 10) {
        // Try 3-digit area code first (most common)
        return `+7 (${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6, 8)}-${digits.substring(8, 10)}`;
      }
    }
  }
  
  // Fallback: format as mobile
  if (digits.length >= 10) {
    return `+7 (${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6, 8)}-${digits.substring(8, 10)}`;
  }
  
  // If we can't format, return original
  return phone;
}

/**
 * Extracts only numeric digits from an ID string
 * @param id - The ID string (e.g., "ORD-XML-22638" or "CLI-123")
 * @returns Only the numeric portion (e.g., "22638" or "123")
 */
export function extractIdNumbers(id: string): string {
  return id.replace(/\D/g, '');
}

/**
 * Validates an email address
 * @param email - Email address to validate
 * @returns true if email is valid, false otherwise
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email || email.trim() === '') return false;
  
  // RFC 5322 compliant regex (simplified version)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Generates a document number (invoice or PO) based on prefix, order ID, and date
 * Format: {prefix}-{year}-{sequential}
 * Sequential is derived from order ID to ensure consistency
 * 
 * @param prefix - Document prefix (e.g., "INV", "PO")
 * @param orderId - Order ID to derive sequential number from
 * @param createdAt - Order creation date
 * @returns Formatted document number (e.g., "INV-2025-001")
 */
export function generateDocumentNumber(
  prefix: string,
  orderId: string,
  createdAt: Date
): string {
  const year = createdAt.getFullYear();
  
  // Extract numeric portion from order ID for sequential number
  // This ensures the same order always gets the same document number
  const orderNumeric = extractIdNumbers(orderId);
  const sequential = orderNumeric.slice(-3).padStart(3, '0');
  
  return `${prefix}-${year}-${sequential}`;
}
