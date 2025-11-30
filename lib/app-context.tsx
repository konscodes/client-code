// Global application context for state management
import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { Client, JobTemplate, Order, OrderJob, JobPreset, PresetJob, CompanySettings, DocumentTemplate } from './types';
import { supabase } from './supabase';
import { normalizePhoneNumber } from './utils';
import { localeToLanguage } from './i18n';

interface AppContextType {
  clients: Client[];
  orders: Order[];
  jobTemplates: JobTemplate[];
  jobPresets: JobPreset[];
  companySettings: CompanySettings;
  documentTemplates: DocumentTemplate[];
  loading: boolean;
  error: string | null;
  
  // Client methods
  addClient: (client: Client) => Promise<void>;
  updateClient: (id: string, client: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  getClient: (id: string) => Client | undefined;
  
  // Order methods
  addOrder: (order: Order) => Promise<void>;
  updateOrder: (id: string, order: Partial<Order>) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  getOrder: (id: string) => Order | undefined;
  
  // Job template methods
  addJobTemplate: (job: JobTemplate) => Promise<void>;
  updateJobTemplate: (id: string, job: Partial<JobTemplate>) => Promise<void>;
  deleteJobTemplate: (id: string) => Promise<void>;
  
  // Job preset methods
  addJobPreset: (preset: JobPreset) => Promise<void>;
  updateJobPreset: (id: string, preset: Partial<JobPreset>) => Promise<void>;
  deleteJobPreset: (id: string) => Promise<void>;
  
  // Settings methods
  updateCompanySettings: (settings: Partial<CompanySettings>) => Promise<void>;
  
  // Document template methods
  addDocumentTemplate: (template: DocumentTemplate) => Promise<void>;
  updateDocumentTemplate: (id: string, template: Partial<DocumentTemplate>) => Promise<void>;
  deleteDocumentTemplate: (id: string) => Promise<void>;
  
  // Refresh methods
  refreshClients: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshJobTemplates: () => Promise<void>;
  refreshJobPresets: () => Promise<void>;
  refreshCompanySettings: () => Promise<void>;
  refreshDocumentTemplates: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper function to convert database row to Client
function dbRowToClient(row: any): Client {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    inn: row.inn,
    kpp: row.kpp,
    ogrn: row.ogrn,
    bank: row.bank,
    notes: row.notes,
    createdAt: new Date(row.createdAt),
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
  };
}

// Helper function to convert database row to OrderJob
function dbRowToOrderJob(row: any): OrderJob {
  return {
    id: row.id,
    orderId: row.orderId,
    jobId: row.jobId || '',
    jobName: row.jobName,
    description: row.description,
    quantity: parseFloat(row.quantity),
    unitPrice: parseFloat(row.unitPrice),
    lineMarkup: parseFloat(row.lineMarkup),
    taxApplicable: row.taxApplicable,
    position: row.position,
  };
}

// Helper function to convert database row to Order
async function dbRowToOrder(row: any): Promise<Order> {
  // Fetch order jobs
  const { data: jobsData, error: jobsError } = await supabase
    .from('order_jobs')
    .select('*')
    .eq('orderId', row.id)
    .order('position');
  
  if (jobsError) {
    console.error('Error fetching order jobs:', jobsError);
  }
  
  const jobs: OrderJob[] = (jobsData || []).map(dbRowToOrderJob);
  
  return {
    id: row.id,
    clientId: row.clientId,
    status: row.status,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    taxRate: parseFloat(row.taxRate),
    globalMarkup: parseFloat(row.globalMarkup),
    currency: row.currency,
    notesInternal: row.notesInternal || '',
    notesPublic: row.notesPublic || '',
    jobs,
  };
}

// Helper function to convert database row to JobTemplate
function dbRowToJobTemplate(row: any): JobTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    unitPrice: parseFloat(row.unitPrice),
    unitOfMeasure: row.unitOfMeasure,
    defaultTax: row.defaultTax,
    lastUpdated: new Date(row.lastUpdated),
  };
}

// Helper function to convert database row to JobPreset
async function dbRowToJobPreset(row: any): Promise<JobPreset> {
  // Fetch preset jobs
  const { data: presetJobsData, error: presetJobsError } = await supabase
    .from('preset_jobs')
    .select('*')
    .eq('presetId', row.id)
    .order('position');
  
  if (presetJobsError) {
    console.error('Error fetching preset jobs:', presetJobsError);
  }
  
  const jobs: PresetJob[] = (presetJobsData || []).map((pj: any) => ({
    jobId: pj.jobId,
    defaultQty: parseFloat(pj.defaultQty),
    position: pj.position,
  }));
  
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    jobs,
    lastUpdated: new Date(row.lastUpdated),
  };
}

// Helper function to convert database row to CompanySettings
function dbRowToCompanySettings(row: any): CompanySettings {
  return {
    name: row.name,
    legalName: row.legalName,
    logo: row.logo,
    address: row.address,
    phone: row.phone,
    email: row.email,
    taxId: row.taxId,
    currency: row.currency,
    locale: row.locale,
    defaultTaxRate: parseFloat(row.defaultTaxRate),
    defaultMarkup: parseFloat(row.defaultMarkup),
    invoicePrefix: row.invoicePrefix,
    poPrefix: row.poPrefix,
  };
}

// Helper function to convert database row to DocumentTemplate
function dbRowToDocumentTemplate(row: any): DocumentTemplate {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    htmlContent: row.htmlContent,
    isDefault: row.isDefault,
    lastUpdated: new Date(row.lastUpdated),
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [jobTemplates, setJobTemplates] = useState<JobTemplate[]>([]);
  const [jobPresets, setJobPresets] = useState<JobPreset[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings>({
    name: 'Premium Welding & Fabrication',
    legalName: 'Premium Welding & Fabrication LLC',
    address: '2500 Industrial Park Dr, Detroit, MI 48210',
    phone: '(555) 987-6543',
    email: 'info@premiumwelding.com',
    taxId: '38-9876543',
    currency: 'USD',
    locale: 'en-US',
    defaultTaxRate: 8.5,
    defaultMarkup: 20,
    invoicePrefix: 'INV',
    poPrefix: 'PO',
  });
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Add minimum delay to ensure loading state is visible
      await Promise.all([
        Promise.all([
          refreshClients(),
          refreshOrders(),
          refreshJobTemplates(),
          refreshJobPresets(),
          refreshCompanySettings(),
          refreshDocumentTemplates(),
        ]),
        new Promise(resolve => setTimeout(resolve, 500)), // Minimum 500ms loading time
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Refresh methods
  const refreshClients = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('clients')
      .select('*')
      .order('createdAt', { ascending: false });
    
    if (err) throw err;
    setClients((data || []).map(dbRowToClient));
  }, []);

  const refreshOrders = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('orders')
      .select('*')
      .order('createdAt', { ascending: false });
    
    if (err) throw err;
    const ordersData = await Promise.all((data || []).map(dbRowToOrder));
    setOrders(ordersData);
  }, []);

  const refreshJobTemplates = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('job_templates')
      .select('*')
      .order('name');
    
    if (err) throw err;
    setJobTemplates((data || []).map(dbRowToJobTemplate));
  }, []);

  const refreshJobPresets = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('job_presets')
      .select('*')
      .order('name');
    
    if (err) throw err;
    const presetsData = await Promise.all((data || []).map(dbRowToJobPreset));
    setJobPresets(presetsData);
  }, []);

  const refreshCompanySettings = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', 'default')
      .single();
    
    if (err && err.code !== 'PGRST116') { // PGRST116 is "not found"
      throw err;
    }
    if (data) {
      const settings = dbRowToCompanySettings(data);
      setCompanySettings(settings);
      
      // Update i18n language when settings are loaded
      if (typeof window !== 'undefined') {
        const { default: i18n } = await import('./i18n');
        i18n.changeLanguage(localeToLanguage(settings.locale));
      }
    }
  }, []);

  const refreshDocumentTemplates = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('document_templates')
      .select('*')
      .order('name');
    
    if (err) throw err;
    setDocumentTemplates((data || []).map(dbRowToDocumentTemplate));
  }, []);

  // Client methods
  const addClient = useCallback(async (client: Client) => {
    const { error: err } = await supabase
      .from('clients')
      .insert({
        id: client.id,
        name: client.name,
        company: client.company,
        phone: normalizePhoneNumber(client.phone),
        email: client.email,
        address: client.address,
        inn: client.inn,
        kpp: client.kpp,
        ogrn: client.ogrn,
        bank: client.bank,
        notes: client.notes,
        createdAt: client.createdAt.toISOString(),
        updatedAt: client.updatedAt?.toISOString(),
      });
    
    if (err) throw err;
    await refreshClients();
  }, [refreshClients]);

  const updateClient = useCallback(async (id: string, updates: Partial<Client>) => {
    const updateData: any = { ...updates };
    if (updates.createdAt) updateData.createdAt = updates.createdAt.toISOString();
    if (updates.updatedAt) updateData.updatedAt = updates.updatedAt.toISOString();
    if (updates.phone) updateData.phone = normalizePhoneNumber(updates.phone);
    updateData.updatedAt = new Date().toISOString();
    
    const { error: err } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', id);
    
    if (err) throw err;
    await refreshClients();
  }, [refreshClients]);

  const deleteClient = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);
    
    if (err) throw err;
    await refreshClients();
  }, [refreshClients]);

  const getClient = useCallback((id: string) => {
    return clients.find(c => c.id === id);
  }, [clients]);

  // Order methods
  const addOrder = useCallback(async (order: Order) => {
    // Insert order
    const { error: orderErr } = await supabase
      .from('orders')
      .insert({
        id: order.id,
        clientId: order.clientId,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        taxRate: order.taxRate,
        globalMarkup: order.globalMarkup,
        currency: order.currency,
        notesInternal: order.notesInternal,
        notesPublic: order.notesPublic,
      });
    
    if (orderErr) throw orderErr;
    
    // Insert order jobs
    if (order.jobs.length > 0) {
      const { error: jobsErr } = await supabase
        .from('order_jobs')
        .insert(order.jobs.map(job => ({
          id: job.id,
          orderId: order.id,
          jobId: job.jobId,
          jobName: job.jobName,
          description: job.description,
          quantity: job.quantity,
          unitPrice: job.unitPrice,
          lineMarkup: job.lineMarkup,
          taxApplicable: job.taxApplicable,
          position: job.position,
        })));
      
      if (jobsErr) throw jobsErr;
    }
    
    await refreshOrders();
  }, [refreshOrders]);

  const updateOrder = useCallback(async (id: string, updates: Partial<Order>) => {
    const updateData: any = { ...updates };
    if (updates.createdAt) updateData.createdAt = updates.createdAt.toISOString();
    if (updates.updatedAt) updateData.updatedAt = updates.updatedAt.toISOString();
    updateData.updatedAt = new Date().toISOString();
    
    // Remove jobs from updateData if present (handled separately)
    const jobs = updateData.jobs;
    delete updateData.jobs;
    
    const { error: err } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id);
    
    if (err) throw err;
    
    // Update jobs if provided
    if (jobs) {
      // Delete existing jobs
      await supabase.from('order_jobs').delete().eq('orderId', id);
      
      // Insert new jobs
      if (jobs.length > 0) {
        const { error: jobsErr } = await supabase
          .from('order_jobs')
          .insert(jobs.map((job: OrderJob) => ({
            id: job.id,
            orderId: id,
            jobId: job.jobId,
            jobName: job.jobName,
            description: job.description,
            quantity: job.quantity,
            unitPrice: job.unitPrice,
            lineMarkup: job.lineMarkup,
            taxApplicable: job.taxApplicable,
            position: job.position,
          })));
        
        if (jobsErr) throw jobsErr;
      }
    }
    
    await refreshOrders();
  }, [refreshOrders]);

  const deleteOrder = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('orders')
      .delete()
      .eq('id', id);
    
    if (err) throw err;
    await refreshOrders();
  }, [refreshOrders]);

  const getOrder = useCallback((id: string) => {
    return orders.find(o => o.id === id);
  }, [orders]);

  // Job template methods
  const addJobTemplate = useCallback(async (job: JobTemplate) => {
    const { error: err } = await supabase
      .from('job_templates')
      .insert({
        id: job.id,
        name: job.name,
        description: job.description,
        category: job.category,
        unitPrice: job.unitPrice,
        unitOfMeasure: job.unitOfMeasure,
        defaultTax: job.defaultTax,
        lastUpdated: job.lastUpdated.toISOString(),
      });
    
    if (err) throw err;
    await refreshJobTemplates();
  }, [refreshJobTemplates]);

  const updateJobTemplate = useCallback(async (id: string, updates: Partial<JobTemplate>) => {
    const updateData: any = { ...updates };
    if (updates.lastUpdated) updateData.lastUpdated = updates.lastUpdated.toISOString();
    updateData.lastUpdated = new Date().toISOString();
    
    const { error: err } = await supabase
      .from('job_templates')
      .update(updateData)
      .eq('id', id);
    
    if (err) throw err;
    await refreshJobTemplates();
  }, [refreshJobTemplates]);

  const deleteJobTemplate = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('job_templates')
      .delete()
      .eq('id', id);
    
    if (err) throw err;
    await refreshJobTemplates();
  }, [refreshJobTemplates]);

  // Job preset methods
  const addJobPreset = useCallback(async (preset: JobPreset) => {
    // Insert preset
    const { error: presetErr } = await supabase
      .from('job_presets')
      .insert({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        category: preset.category,
        lastUpdated: preset.lastUpdated.toISOString(),
      });
    
    if (presetErr) throw presetErr;
    
    // Insert preset jobs
    if (preset.jobs.length > 0) {
      const { error: jobsErr } = await supabase
        .from('preset_jobs')
        .insert(preset.jobs.map(job => ({
          presetId: preset.id,
          jobId: job.jobId,
          defaultQty: job.defaultQty,
          position: job.position,
        })));
      
      if (jobsErr) throw jobsErr;
    }
    
    await refreshJobPresets();
  }, [refreshJobPresets]);

  const updateJobPreset = useCallback(async (id: string, updates: Partial<JobPreset>) => {
    const updateData: any = { ...updates };
    if (updates.lastUpdated) updateData.lastUpdated = updates.lastUpdated.toISOString();
    updateData.lastUpdated = new Date().toISOString();
    
    // Remove jobs from updateData if present (handled separately)
    const jobs = updateData.jobs;
    delete updateData.jobs;
    
    const { error: err } = await supabase
      .from('job_presets')
      .update(updateData)
      .eq('id', id);
    
    if (err) throw err;
    
    // Update jobs if provided
    if (jobs) {
      // Delete existing jobs
      await supabase.from('preset_jobs').delete().eq('presetId', id);
      
      // Insert new jobs
      if (jobs.length > 0) {
        const { error: jobsErr } = await supabase
          .from('preset_jobs')
          .insert(jobs.map((job: PresetJob) => ({
            presetId: id,
            jobId: job.jobId,
            defaultQty: job.defaultQty,
            position: job.position,
          })));
        
        if (jobsErr) throw jobsErr;
      }
    }
    
    await refreshJobPresets();
  }, [refreshJobPresets]);

  const deleteJobPreset = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('job_presets')
      .delete()
      .eq('id', id);
    
    if (err) throw err;
    await refreshJobPresets();
  }, [refreshJobPresets]);

  // Settings methods
  const updateCompanySettings = useCallback(async (updates: Partial<CompanySettings>) => {
    const { error: err } = await supabase
      .from('company_settings')
      .upsert({
        id: 'default',
        ...companySettings,
        ...updates,
      });
    
    if (err) throw err;
    
    // Update i18n language if locale changed
    if (updates.locale && typeof window !== 'undefined') {
      const { default: i18n } = await import('./i18n');
      i18n.changeLanguage(localeToLanguage(updates.locale));
    }
    
    await refreshCompanySettings();
  }, [companySettings, refreshCompanySettings]);

  // Document template methods
  const addDocumentTemplate = useCallback(async (template: DocumentTemplate) => {
    const { error: err } = await supabase
      .from('document_templates')
      .insert({
        id: template.id,
        name: template.name,
        type: template.type,
        htmlContent: template.htmlContent,
        isDefault: template.isDefault,
        lastUpdated: template.lastUpdated.toISOString(),
      });
    
    if (err) throw err;
    await refreshDocumentTemplates();
  }, [refreshDocumentTemplates]);

  const updateDocumentTemplate = useCallback(async (id: string, updates: Partial<DocumentTemplate>) => {
    const updateData: any = { ...updates };
    if (updates.lastUpdated) updateData.lastUpdated = updates.lastUpdated.toISOString();
    updateData.lastUpdated = new Date().toISOString();
    
    const { error: err } = await supabase
      .from('document_templates')
      .update(updateData)
      .eq('id', id);
    
    if (err) throw err;
    await refreshDocumentTemplates();
  }, [refreshDocumentTemplates]);

  const deleteDocumentTemplate = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('document_templates')
      .delete()
      .eq('id', id);
    
    if (err) throw err;
    await refreshDocumentTemplates();
  }, [refreshDocumentTemplates]);

  const value: AppContextType = {
    clients,
    orders,
    jobTemplates,
    jobPresets,
    companySettings,
    documentTemplates,
    loading,
    error,
    
    addClient,
    updateClient,
    deleteClient,
    getClient,
    
    addOrder,
    updateOrder,
    deleteOrder,
    getOrder,
    
    addJobTemplate,
    updateJobTemplate,
    deleteJobTemplate,
    
    addJobPreset,
    updateJobPreset,
    deleteJobPreset,
    
    updateCompanySettings,
    
    addDocumentTemplate,
    updateDocumentTemplate,
    deleteDocumentTemplate,
    
    refreshClients,
    refreshOrders,
    refreshJobTemplates,
    refreshJobPresets,
    refreshCompanySettings,
    refreshDocumentTemplates,
  };
  
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
