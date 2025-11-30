// Global application context for state management
import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

// Helper function to convert database row to Order (with pre-fetched jobs)
function dbRowToOrder(row: any, jobsByOrderId: Map<string, OrderJob[]>): Order {
  const jobs: OrderJob[] = (jobsByOrderId.get(row.id) || []).sort((a, b) => a.position - b.position);
  
  return {
    id: row.id,
    clientId: row.clientId,
    status: row.status,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    taxRate: parseFloat(row.taxRate),
    globalMarkup: parseFloat(row.globalMarkup),
    currency: row.currency,
    orderType: row.orderType || '',
    orderTitle: row.orderTitle || '',
    jobs,
  };
}

// Helper function to batch fetch order_jobs for multiple orders
async function fetchOrderJobsBatch(orderIds: string[]): Promise<Map<string, OrderJob[]>> {
  if (orderIds.length === 0) {
    return new Map();
  }

  // Supabase .in() has a limit, so we need to batch if there are too many
  const batchSize = 1000;
  const jobsMap = new Map<string, OrderJob[]>();

  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);
    const { data: jobsData, error: jobsError } = await supabase
      .from('order_jobs')
      .select('*')
      .in('orderId', batch)
      .order('position');
    
    if (jobsError) {
      console.error('Error fetching order jobs batch:', jobsError);
      continue;
    }
    
    // Group jobs by orderId
    (jobsData || []).forEach((jobRow: any) => {
      const orderId = jobRow.orderId;
      if (!jobsMap.has(orderId)) {
        jobsMap.set(orderId, []);
      }
      jobsMap.get(orderId)!.push(dbRowToOrderJob(jobRow));
    });
  }

  return jobsMap;
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
  const queryClient = useQueryClient();
  const [clients, setClients] = useState<Client[]>([]);
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

  // Fetch a page of orders with batch job fetching
  const fetchOrdersPage = useCallback(async (from: number, to: number): Promise<Order[]> => {
    const { data, error: err } = await supabase
      .from('orders')
      .select('*')
      .order('createdAt', { ascending: false })
      .range(from, to);
    
    if (err) throw err;
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Batch fetch all order_jobs for these orders
    const orderIds = data.map(row => row.id);
    const jobsByOrderId = await fetchOrderJobsBatch(orderIds);
    
    // Convert rows to Order objects with pre-fetched jobs
    return data.map(row => dbRowToOrder(row, jobsByOrderId));
  }, []);

  // Progressive loading: fetch first page immediately, then load remaining in background
  const fetchAllOrdersProgressive = useCallback(async (): Promise<Order[]> => {
    // First, get total count
    const { count, error: countErr } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });
    
    if (countErr) throw countErr;
    const totalCount = count || 0;
    
    // Load first page immediately (100 orders)
    const initialPageSize = 100;
    const initialOrders = await fetchOrdersPage(0, initialPageSize - 1);
    
    // If there are more orders, load them in background batches
    if (totalCount > initialPageSize) {
      const batchSize = 1000;
      const batches: Promise<Order[]>[] = [];
      
      for (let from = initialPageSize; from < totalCount; from += batchSize) {
        const to = Math.min(from + batchSize - 1, totalCount - 1);
        batches.push(fetchOrdersPage(from, to));
      }
      
      // Load all batches in parallel
      const remainingBatches = await Promise.all(batches);
      const remainingOrders = remainingBatches.flat();
      
      return [...initialOrders, ...remainingOrders];
    }
    
    return initialOrders;
  }, [fetchOrdersPage]);

  // Fetch a page of job templates
  const fetchJobTemplatesPage = useCallback(async (from: number, to: number): Promise<JobTemplate[]> => {
    const { data, error: err } = await supabase
      .from('job_templates')
      .select('*')
      .order('name')
      .range(from, to);
    
    if (err) throw err;
    
    if (!data || data.length === 0) {
      return [];
    }
    
    return data.map(dbRowToJobTemplate);
  }, []);

  // Progressive loading: fetch first page immediately, then load remaining in background
  const fetchAllJobTemplatesProgressive = useCallback(async (): Promise<JobTemplate[]> => {
    // First, get total count
    const { count, error: countErr } = await supabase
      .from('job_templates')
      .select('*', { count: 'exact', head: true });
    
    if (countErr) throw countErr;
    const totalCount = count || 0;
    
    // Load first page immediately (200 jobs)
    const initialPageSize = 200;
    const initialJobs = await fetchJobTemplatesPage(0, initialPageSize - 1);
    
    // If there are more jobs, load them in background batches
    if (totalCount > initialPageSize) {
      const batchSize = 1000;
      const batches: Promise<JobTemplate[]>[] = [];
      
      for (let from = initialPageSize; from < totalCount; from += batchSize) {
        const to = Math.min(from + batchSize - 1, totalCount - 1);
        batches.push(fetchJobTemplatesPage(from, to));
      }
      
      // Load all batches in parallel
      const remainingBatches = await Promise.all(batches);
      const remainingJobs = remainingBatches.flat();
      
      return [...initialJobs, ...remainingJobs];
    }
    
    return initialJobs;
  }, [fetchJobTemplatesPage]);

  // React Query for orders
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: fetchAllOrdersProgressive,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // React Query for job templates
  const { data: jobTemplates = [], isLoading: jobTemplatesLoading } = useQuery({
    queryKey: ['jobTemplates'],
    queryFn: fetchAllJobTemplatesProgressive,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });

  // Load all data on mount (except orders and jobTemplates which are handled by React Query)
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setOtherDataLoading(true);
    setError(null);
    try {
      // Add minimum delay to ensure loading state is visible
      await Promise.all([
        Promise.all([
          refreshClients(),
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
      setOtherDataLoading(false);
    }
  };

  // Update loading state based on React Query loading states and other data loading
  const [otherDataLoading, setOtherDataLoading] = useState(true);
  
  useEffect(() => {
    setLoading(ordersLoading || jobTemplatesLoading || otherDataLoading);
  }, [ordersLoading, jobTemplatesLoading, otherDataLoading]);

  // Refresh methods
  const refreshClients = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('clients')
      .select('*')
      .order('createdAt', { ascending: false });
    
    if (err) throw err;
    setClients((data || []).map(dbRowToClient));
  }, []);

  // refreshOrders is now handled by React Query, but we keep it for compatibility
  const refreshOrders = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
  }, [queryClient]);

  // refreshJobTemplates is now handled by React Query, but we keep it for compatibility
  const refreshJobTemplates = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['jobTemplates'] });
  }, [queryClient]);

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
        const language = localeToLanguage(settings.locale);
        i18n.changeLanguage(language);
        // Save to localStorage for next page load
        localStorage.setItem('company_locale', settings.locale);
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

  // Order methods with React Query mutations
  const addOrderMutation = useMutation({
    mutationFn: async (order: Order) => {
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
          orderType: order.orderType,
          orderTitle: order.orderTitle,
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const addOrder = useCallback(async (order: Order) => {
    await addOrderMutation.mutateAsync(order);
  }, [addOrderMutation]);

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Order> }) => {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const updateOrder = useCallback(async (id: string, updates: Partial<Order>) => {
    await updateOrderMutation.mutateAsync({ id, updates });
  }, [updateOrderMutation]);

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase
        .from('orders')
        .delete()
        .eq('id', id);
      
      if (err) throw err;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const deleteOrder = useCallback(async (id: string) => {
    await deleteOrderMutation.mutateAsync(id);
  }, [deleteOrderMutation]);

  const getOrder = useCallback((id: string) => {
    return orders.find(o => o.id === id);
  }, [orders]);

  // Job template methods with React Query mutations
  const addJobTemplateMutation = useMutation({
    mutationFn: async (job: JobTemplate) => {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobTemplates'] });
    },
  });

  const addJobTemplate = useCallback(async (job: JobTemplate) => {
    await addJobTemplateMutation.mutateAsync(job);
  }, [addJobTemplateMutation]);

  const updateJobTemplateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<JobTemplate> }) => {
      const updateData: any = { ...updates };
      if (updates.lastUpdated) updateData.lastUpdated = updates.lastUpdated.toISOString();
      updateData.lastUpdated = new Date().toISOString();
      
      const { error: err } = await supabase
        .from('job_templates')
        .update(updateData)
        .eq('id', id);
      
      if (err) throw err;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobTemplates'] });
    },
  });

  const updateJobTemplate = useCallback(async (id: string, updates: Partial<JobTemplate>) => {
    await updateJobTemplateMutation.mutateAsync({ id, updates });
  }, [updateJobTemplateMutation]);

  const deleteJobTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase
        .from('job_templates')
        .delete()
        .eq('id', id);
      
      if (err) throw err;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobTemplates'] });
    },
  });

  const deleteJobTemplate = useCallback(async (id: string) => {
    await deleteJobTemplateMutation.mutateAsync(id);
  }, [deleteJobTemplateMutation]);

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
      const language = localeToLanguage(updates.locale);
      i18n.changeLanguage(language);
      // Save to localStorage for next page load
      localStorage.setItem('company_locale', updates.locale);
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
