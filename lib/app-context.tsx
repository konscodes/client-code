// Global application context for state management
import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Client, JobTemplate, Order, OrderJob, JobPreset, PresetJob, CompanySettings } from './types';
import { supabase } from './supabase';
import { normalizePhoneNumber } from './utils';
import { localeToLanguage } from './i18n';
import { logger } from './logger';

interface AppContextType {
  clients: Client[];
  orders: Order[];
  jobTemplates: JobTemplate[];
  jobPresets: JobPreset[];
  companySettings: CompanySettings;
  loading: boolean;
  error: string | null;
  
  // Client methods
  addClient: (client: Client) => Promise<string>;
  updateClient: (id: string, client: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  getClient: (id: string) => Client | undefined;
  
  // Order methods
  addOrder: (order: Order) => Promise<string>;
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
  
  // Refresh methods
  refreshClients: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshJobTemplates: () => Promise<void>;
  refreshJobPresets: () => Promise<void>;
  refreshCompanySettings: () => Promise<void>;
  // Progressive loading methods
  ensureOrderJobsLoaded: (orderIds: string[]) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper function to convert database row to Client
function dbRowToClient(row: any): Client {
  // Safely extract email - handle [object Object] and other edge cases
  let email = '';
  if (row.email) {
    if (typeof row.email === 'string' && row.email !== '[object Object]') {
      email = row.email.trim();
    }
    // If email is an object or [object Object], leave it as empty string
  }
  
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    phone: row.phone || '',
    email,
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
    timeEstimate: row.timeEstimate !== undefined && row.timeEstimate !== null ? parseInt(row.timeEstimate, 10) : undefined,
    jobs,
    // Denormalized fields (from database)
    total: row.total !== undefined && row.total !== null ? parseFloat(row.total) : undefined,
    subtotal: row.subtotal !== undefined && row.subtotal !== null ? parseFloat(row.subtotal) : undefined,
    job_count: row.job_count !== undefined && row.job_count !== null ? parseInt(row.job_count, 10) : undefined,
  };
}

// Helper function to batch fetch order_jobs for multiple orders
async function fetchOrderJobsBatch(orderIds: string[]): Promise<Map<string, OrderJob[]>> {
  if (orderIds.length === 0) {
    return new Map();
  }

  // Supabase .in() has a limit, so we need to batch if there are too many
  // Set to 200 to avoid URI length limits (414 errors) - 200 IDs ≈ 7KB encoded
  const batchSize = 200;
  const jobsMap = new Map<string, OrderJob[]>();

  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);
    const { data: jobsData, error: jobsError } = await supabase
      .from('order_jobs')
      .select('*')
      .in('orderId', batch)
      .order('position');
    
    if (jobsError) {
      logger.error('Error fetching order jobs batch', jobsError);
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
    logger.error('Error fetching preset jobs', presetJobsError);
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
    // Russian banking/legal fields
    legalForm: row.legal_form,
    inn: row.inn,
    kpp: row.kpp,
    bankAccount: row.bank_account,
    bankName: row.bank_name,
    correspondentAccount: row.correspondent_account,
    bankBik: row.bank_bik,
    directorName: row.director_name,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch a page of orders with optional selective job fetching
  const fetchOrdersPage = useCallback(async (
    from: number, 
    to: number, 
    options: { 
      includeJobs?: boolean;
      jobsDateFilter?: { startDate: Date; endDate: Date }; // For dashboard: last 30 days
    } = {}
  ): Promise<Order[]> => {
    const { includeJobs = false, jobsDateFilter } = options;
    
    const { data, error: err } = await supabase
      .from('orders')
      .select('*, total, subtotal, job_count')  // Select denormalized fields
      .order('createdAt', { ascending: false })
      .range(from, to);
    
    if (err) throw err;
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Only fetch jobs if requested
    if (includeJobs) {
      let orderIdsToFetch = data.map(row => row.id);
      
      // If date filter provided, only fetch jobs for orders in that date range
      if (jobsDateFilter) {
        orderIdsToFetch = data
          .filter(row => {
            const orderDate = new Date(row.createdAt);
            return orderDate >= jobsDateFilter.startDate && 
                   orderDate <= jobsDateFilter.endDate;
          })
          .map(row => row.id);
      }
      
      if (orderIdsToFetch.length > 0) {
        const jobsByOrderId = await fetchOrderJobsBatch(orderIdsToFetch);
        return data.map(row => dbRowToOrder(row, jobsByOrderId));
      }
    }
    
    // Return orders with empty jobs array (fast)
    return data.map(row => dbRowToOrder(row, new Map()));
  }, []);

  // Background job loading function (non-blocking)
  const loadRemainingOrderJobsInBackground = useCallback(async (orders: Order[]) => {
    // Load jobs in batches of 200 order IDs
    const batchSize = 200;
    const orderIds = orders.map(o => o.id);
    
    for (let i = 0; i < orderIds.length; i += batchSize) {
      const batch = orderIds.slice(i, i + batchSize);
      
      try {
        const jobsByOrderId = await fetchOrderJobsBatch(batch);
        
        // Update React Query cache with loaded jobs
        queryClient.setQueryData(['orders'], (oldOrders: Order[] = []) => {
          return oldOrders.map(order => {
            const jobs = jobsByOrderId.get(order.id);
            if (jobs && jobs.length > 0) {
              return { ...order, jobs };
            }
            return order;
          });
        });
      } catch (error) {
        logger.error('Error loading jobs in background', error);
        // Continue with next batch even if this one fails
      }
      
      // Small delay between batches to avoid overwhelming the server
      if (i + batchSize < orderIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }, [queryClient]);

  // Progressive loading: fast initial load, dashboard priority, background jobs
  const fetchAllOrdersProgressive = useCallback(async (): Promise<Order[]> => {
    // Step 1: Get total count
    const { count, error: countErr } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });
    
    if (countErr) throw countErr;
    const totalCount = count || 0;
    
    // Step 2: Load first page WITHOUT jobs (fast initial render)
    const initialPageSize = 100;
    const initialOrders = await fetchOrdersPage(0, initialPageSize - 1, { 
      includeJobs: false 
    });
    
    // Step 3: Calculate date range for dashboard (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Step 4: Load jobs for dashboard needs:
    // - Completed orders from past 30 days (for month revenue KPI)
    // - Recent 5 orders (for displaying totals in recent orders list)
    const completedRecentOrderIds = initialOrders
      .filter(order => {
        const orderDate = new Date(order.createdAt);
        return order.status === 'completed' &&
               orderDate >= thirtyDaysAgo &&
               orderDate <= now;
      })
      .map(order => order.id);
    
    // Get recent 5 orders (sorted by createdAt desc, take first 5)
    const recent5OrderIds = [...initialOrders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map(order => order.id);
    
    // Combine both sets (remove duplicates)
    const dashboardOrderIds = Array.from(new Set([...completedRecentOrderIds, ...recent5OrderIds]));
    
    // Load jobs for these orders
    let dashboardJobsMap = new Map<string, OrderJob[]>();
    if (dashboardOrderIds.length > 0) {
      try {
        dashboardJobsMap = await fetchOrderJobsBatch(dashboardOrderIds);
      } catch (error) {
        logger.error('Error loading dashboard jobs', error);
      }
    }
    
    // Merge jobs into initial orders
    const ordersWithDashboardJobs = initialOrders.map(order => ({
      ...order,
      jobs: dashboardJobsMap.get(order.id) || []
    }));
    
    // Step 5: Load remaining orders in background (without jobs)
    let remainingOrdersPromise: Promise<Order[]> = Promise.resolve([]);
    if (totalCount > initialPageSize) {
      const batchSize = 500; // Pagination batch size (offset/limit, no URI length issues)
      const batches: Promise<Order[]>[] = [];
      
      for (let from = initialPageSize; from < totalCount; from += batchSize) {
        const to = Math.min(from + batchSize - 1, totalCount - 1);
        batches.push(fetchOrdersPage(from, to, { includeJobs: false }));
      }
      
      remainingOrdersPromise = Promise.all(batches).then(batches => batches.flat());
    }
    
    // Step 6: Wait for remaining orders
    const remainingOrders = await remainingOrdersPromise;
    
    // Step 7: Start background job loading for remaining orders (don't await - non-blocking)
    if (remainingOrders.length > 0) {
      // Load jobs in background batches (non-blocking)
      loadRemainingOrderJobsInBackground(remainingOrders).catch(error => {
        logger.error('Background job loading failed', error);
      });
    }
    
    return [...ordersWithDashboardJobs, ...remainingOrders];
  }, [fetchOrdersPage, loadRemainingOrderJobsInBackground]);

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
      const batchSize = 500; // Pagination batch size (offset/limit, no URI length issues)
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
      // Step 1: Load essential data first (clients + company settings)
      await Promise.all([
        refreshClients(),           // Essential for search
        refreshCompanySettings(),   // Essential for defaults
        new Promise(resolve => setTimeout(resolve, 500)), // Minimum 500ms loading time
      ]);
      
      // Step 2: Essential data loaded, unblock UI
      setOtherDataLoading(false);
      
      // Step 3: Load background data (non-blocking, doesn't affect loading state)
      refreshJobPresets().catch(err => {
        logger.error('Error loading job presets in background', err);
        // Don't set error state - background loading failures are non-critical
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load essential data');
      logger.error('Error loading essential data', err);
      setOtherDataLoading(false);
    }
  };

  // Update loading state based on React Query loading states and other data loading
  const [otherDataLoading, setOtherDataLoading] = useState(true);
  
  useEffect(() => {
    // Only block on essential data and orders
    // jobTemplatesLoading removed - job templates load in background (non-blocking)
    setLoading(ordersLoading || otherDataLoading);
  }, [ordersLoading, otherDataLoading]);

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


  // Client methods
  const addClient = useCallback(async (client: Client): Promise<string> => {
    // Generate ID from database sequence if not provided
    let clientId = client.id;
    if (!clientId || clientId === 'new') {
      const { data: idData, error: idError } = await supabase.rpc('next_client_id');
      if (idError) {
        logger.error('Error generating client ID', idError);
        throw idError;
      }
      clientId = idData;
    }
    
    const { error: err } = await supabase
      .from('clients')
      .insert({
        id: clientId,
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
    return clientId;
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
    mutationFn: async (order: Order): Promise<string> => {
      // Generate ID from database sequence if not provided
      let orderId = order.id;
      if (!orderId || orderId === 'new') {
        const { data: idData, error: idError } = await supabase.rpc('next_order_id');
        if (idError) {
          logger.error('Error generating order ID', idError);
          throw idError;
        }
        orderId = idData;
      }
      
      // Insert order
      const { error: orderErr } = await supabase
        .from('orders')
        .insert({
          id: orderId,
          clientId: order.clientId,
          status: order.status,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
          taxRate: order.taxRate,
          globalMarkup: order.globalMarkup,
          currency: order.currency,
          orderType: order.orderType,
          orderTitle: order.orderTitle,
          timeEstimate: order.timeEstimate,
        });
      
      if (orderErr) throw orderErr;
      
      // Insert order jobs
      if (order.jobs.length > 0) {
        const { error: jobsErr } = await supabase
          .from('order_jobs')
          .insert(order.jobs.map(job => ({
            id: job.id,
            orderId: orderId, // Use the generated orderId
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
      
      return orderId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const addOrder = useCallback(async (order: Order): Promise<string> => {
    return await addOrderMutation.mutateAsync(order);
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
      // Generate ID from database sequence if not provided
      let jobId = job.id;
      if (!jobId || jobId === 'new') {
        const { data: idData, error: idError } = await supabase.rpc('next_job_id');
        if (idError) {
          logger.error('Error generating job ID', idError);
          throw idError;
        }
        jobId = idData;
      }
      
      const { error: err } = await supabase
        .from('job_templates')
        .insert({
          id: jobId,
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
    // Merge updates with existing settings
    const mergedSettings = { ...companySettings, ...updates };
    
    // Convert camelCase to snake_case for database fields
    const dbUpdates: any = {
      id: 'default',
      name: mergedSettings.name,
      legalName: mergedSettings.legalName,
      logo: mergedSettings.logo,
      address: mergedSettings.address,
      phone: mergedSettings.phone,
      email: mergedSettings.email,
      taxId: mergedSettings.taxId,
      currency: mergedSettings.currency,
      locale: mergedSettings.locale,
      defaultTaxRate: mergedSettings.defaultTaxRate,
      defaultMarkup: mergedSettings.defaultMarkup,
      invoicePrefix: mergedSettings.invoicePrefix,
      poPrefix: mergedSettings.poPrefix,
      // Convert new banking fields to snake_case
      legal_form: mergedSettings.legalForm,
      inn: mergedSettings.inn,
      kpp: mergedSettings.kpp,
      bank_account: mergedSettings.bankAccount,
      bank_name: mergedSettings.bankName,
      correspondent_account: mergedSettings.correspondentAccount,
      bank_bik: mergedSettings.bankBik,
      director_name: mergedSettings.directorName,
    };
    
    const { error: err } = await supabase
      .from('company_settings')
      .upsert(dbUpdates);
    
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


  // On-demand job loading for orders list (check and load if missing)
  const ensureOrderJobsLoaded = useCallback(async (
    orderIds: string[]
  ): Promise<void> => {
    // Get current orders from cache
    const currentOrders = queryClient.getQueryData<Order[]>(['orders']) || [];
    
    // Find orders that need jobs loaded
    const ordersNeedingJobs = orderIds.filter(orderId => {
      const order = currentOrders.find(o => o.id === orderId);
      return order && order.jobs.length === 0;
    });
    
    if (ordersNeedingJobs.length === 0) {
      return; // All jobs already loaded
    }
    
    // Load jobs for missing orders (priority load)
    try {
      const jobsByOrderId = await fetchOrderJobsBatch(ordersNeedingJobs);
      
      // Update cache
      queryClient.setQueryData(['orders'], (oldOrders: Order[] = []) => {
        return oldOrders.map(order => {
          const jobs = jobsByOrderId.get(order.id);
          if (jobs !== undefined) {
            // Update jobs array even if empty (to properly reflect deleted jobs)
            return { ...order, jobs };
          }
          return order;
        });
      });
    } catch (error) {
      logger.error('Error loading jobs on demand', error);
    }
  }, [queryClient]);

  const value: AppContextType = {
    clients,
    orders,
    jobTemplates,
    jobPresets,
    companySettings,
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
    
    refreshClients,
    refreshOrders,
    refreshJobTemplates,
    refreshJobPresets,
    refreshCompanySettings,
    ensureOrderJobsLoaded,
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
