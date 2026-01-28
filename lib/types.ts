// Core data types for the CRM application

export type OrderStatus = 'in-progress' | 'completed' | 'canceled' | 'proposal';

export interface Client {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  bank?: {
    name?: string;
    accountNumber?: string;
    correspondentAccount?: string;
    bik?: string;
  };
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface JobTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  unitPrice: number;
  unitOfMeasure: string;
  defaultTax: boolean;
  lastUpdated: Date;
}

export type OrderJobType = 'job' | 'subcategory';

export interface OrderJob {
  id: string;
  jobId: string;
  jobName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineMarkup: number;
  taxApplicable: boolean;
  position: number;
  type?: OrderJobType; // Optional for backward compatibility, defaults to 'job'
}

export interface Order {
  id: string;
  clientId: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  taxRate: number;
  globalMarkup: number;
  currency: string;
  orderType: string;
  orderTitle: string;
  timeEstimate?: number; // Time estimate in days
  jobs: OrderJob[];
  // Denormalized fields (from database)
  total?: number;      // Calculated total (with tax)
  subtotal?: number;   // Subtotal (before tax)
  job_count?: number;  // Number of jobs
}

export interface JobPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  jobs: PresetJob[];
  lastUpdated: Date;
}

export type PresetJobType = 'job' | 'subcategory';

export interface PresetJob {
  jobId: string;
  defaultQty: number;
  position: number;
  type?: PresetJobType; // Optional for backward compatibility, defaults to 'job'
  subcategoryName?: string; // Only used when type='subcategory'
  defaultPrice?: number; // Price override for job when preset is applied
  customName?: string; // Custom job name for manual/empty jobs (when jobId doesn't reference a template)
}

export interface CompanySettings {
  name: string;
  legalName: string;
  logo?: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  currency: string;
  locale: string;
  defaultTaxRate: number;
  defaultMarkup: number;
  invoicePrefix: string;
  poPrefix: string;
  specPrefix: string;
  // Russian banking/legal fields
  legalForm?: string; // ООО, ИП, etc.
  inn?: string; // ИНН - Taxpayer ID
  kpp?: string; // КПП - Registration Reason Code
  bankAccount?: string; // p/c - current account
  bankName?: string;
  correspondentAccount?: string; // к/с
  bankBik?: string; // БИК - Bank Identifier Code
  directorName?: string; // Technical Director name
}

