// Order detail page - create and manage orders with job line items
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../lib/app-context';
import { useFormatting } from '../lib/use-formatting';
import { useIsMobile } from '../components/ui/use-mobile';
import { 
  calculateLineTotal,
  getOrderTotals,
  generateId,
  generateDocumentNumber,
  extractIdNumbers
} from '../lib/utils';
import { generateInvoice, generatePurchaseOrder, generateSpecification } from '../lib/document-generator';
import { logger } from '../lib/logger';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save,
  FileText,
  Layers,
  Search,
  Loader2,
  Copy,
  Edit2,
  Check,
  X,
  ChevronDown,
  Eraser,
  GripVertical,
  FolderPlus,
  Calendar
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Button } from '../components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import { DatePicker } from '../components/date-picker';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import type { Order, OrderJob, OrderStatus } from '../lib/types';
import { toast } from 'sonner';

// Order type options
const ORDER_TYPES = [
  { value: 'Поставка', labelEn: 'Supply/Delivery', labelRu: 'Поставка' },
  { value: 'Ремонтные работы', labelEn: 'Repair work', labelRu: 'Ремонтные работы' },
  { value: 'Оказание иных услуг', labelEn: 'Provision of other services', labelRu: 'Оказание иных услуг' },
];

// Sortable row wrapper component for drag-and-drop
interface SortableRowProps {
  id: string;
  children: React.ReactNode;
  isSubcategory?: boolean;
}

function SortableRow({ id, children, isSubcategory }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: isSubcategory ? '#F0F4F8' : undefined,
  };
  
  return (
    <tr ref={setNodeRef} style={style} {...attributes} data-job-id={id}>
      <td className="px-2 py-4 border-b border-[#E4E7E7] w-10 cursor-grab active:cursor-grabbing" {...listeners}>
        <GripVertical size={18} className="text-[#7C8085]" />
      </td>
      {children}
    </tr>
  );
}

interface OrderDetailProps {
  orderId: string;
  onNavigate: (page: string, id?: string) => void;
  previousPage?: { page: string; id?: string } | null;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
}

export function OrderDetail({ orderId, onNavigate, previousPage, onUnsavedChangesChange }: OrderDetailProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { orders, clients, jobTemplates, jobPresets, companySettings, addOrder, updateOrder, duplicateOrder, ensureOrderJobsLoaded } = useApp();
  const { formatCurrency, formatDate } = useFormatting();
  
  // Get order type label based on current language
  const getOrderTypeLabel = (value: string) => {
    const orderType = ORDER_TYPES.find(ot => ot.value === value);
    if (!orderType) return value;
    return i18n.language === 'ru' ? orderType.labelRu : orderType.labelEn;
  };
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [generatingPO, setGeneratingPO] = useState(false);
  const [generatingSpecification, setGeneratingSpecification] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [timeEstimateMode, setTimeEstimateMode] = useState<'preset' | 'custom'>('preset');
  const [customTimeEstimate, setCustomTimeEstimate] = useState<string>('');
  const [originalTimeEstimate, setOriginalTimeEstimate] = useState<number | undefined>(undefined);
  const customTimeEstimateInputRef = useRef<HTMLInputElement>(null);
  
  // Parse orderId to extract client ID from query string (e.g., "new?client=client-10328")
  const parsedOrderId = orderId?.includes('?') ? orderId.split('?')[0] : orderId;
  const clientIdFromQuery = orderId?.includes('?client=') 
    ? orderId.split('?client=')[1]?.split('&')[0] 
    : null;
  
  const isNewOrder = parsedOrderId === 'new';
  const existingOrder = useMemo(() => 
    isNewOrder ? null : orders.find(o => o.id === parsedOrderId),
    [orders, parsedOrderId, isNewOrder]
  );
  
  const [formData, setFormData] = useState<Partial<Order>>(() => {
    if (existingOrder) {
      // Strip denormalized fields so totals are always calculated from jobs during editing
      const { total, subtotal, job_count, ...orderWithoutDenormalized } = existingOrder;
      return orderWithoutDenormalized;
    }
    return {
      id: 'new', // Will be generated by database sequence in addOrder
      clientId: clientIdFromQuery || '',
      status: 'proposal',
      createdAt: new Date(),
      taxRate: companySettings?.defaultTaxRate ?? 0,
      globalMarkup: companySettings?.defaultMarkup ?? 0,
      currency: 'USD',
      orderType: 'Ремонтные работы',
      orderTitle: '',
      timeEstimate: 10, // Default to 10 days
      jobs: [],
    };
  });
  
  // Update clientId if it was provided in query string (handles case where clients haven't loaded yet)
  useEffect(() => {
    if (isNewOrder && clientIdFromQuery && formData.clientId !== clientIdFromQuery && !existingOrder) {
      setFormData(prev => ({ ...prev, clientId: clientIdFromQuery }));
    }
  }, [isNewOrder, clientIdFromQuery, formData.clientId, existingOrder]);
  
  // Update tax rate and markup when companySettings loads (if it wasn't available initially)
  // Only update if we're still using the hardcoded fallback defaults (meaning companySettings wasn't available on mount)
  useEffect(() => {
    if (isNewOrder && !existingOrder && companySettings) {
      setFormData(prev => {
        const needsUpdate = 
          (prev.taxRate === 0 && companySettings.defaultTaxRate !== 0) ||
          (prev.globalMarkup === 0 && companySettings.defaultMarkup !== 0);
        
        if (needsUpdate) {
          return {
            ...prev,
            taxRate: prev.taxRate === 0 ? companySettings.defaultTaxRate : prev.taxRate,
            globalMarkup: prev.globalMarkup === 0 ? companySettings.defaultMarkup : prev.globalMarkup,
          };
        }
        return prev;
      });
    }
  }, [isNewOrder, existingOrder, companySettings]);

  // Track if we've initialized formData from existingOrder to prevent overwriting user changes
  const [hasInitializedFromOrder, setHasInitializedFromOrder] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  
  // Track jobs loading state to distinguish between "not loaded" and "loaded but empty"
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Load jobs with priority when order is opened (if not already loaded)
  useEffect(() => {
    if (!isNewOrder && parsedOrderId && existingOrder) {
      // If order has denormalized fields but no jobs, jobs haven't been loaded yet
      const hasDenormalizedData = existingOrder.total !== undefined || 
                                   existingOrder.subtotal !== undefined;
      const jobsNotLoaded = existingOrder.jobs.length === 0 && hasDenormalizedData;
      
      if (jobsNotLoaded && !jobsLoaded && !jobsLoading) {
        setJobsLoading(true);
        ensureOrderJobsLoaded([parsedOrderId])
          .then(() => {
            setJobsLoaded(true);
            setJobsLoading(false);
          })
          .catch(error => {
            logger.error('Error loading jobs', error);
            setJobsLoading(false);
            // If loading fails, mark as loaded to avoid infinite retry
            setJobsLoaded(true);
          });
      } else if (existingOrder.jobs.length > 0) {
        // Jobs are already loaded
        setJobsLoaded(true);
      }
    }
  }, [isNewOrder, parsedOrderId, existingOrder, ensureOrderJobsLoaded, jobsLoaded, jobsLoading]);
  
  // Reset initialization flag and jobs loaded state when order changes
  useEffect(() => {
    if (parsedOrderId !== lastOrderId) {
      setHasInitializedFromOrder(false);
      setJobsLoaded(false);
      setJobsLoading(false);
      setLastOrderId(parsedOrderId || null);
    }
  }, [parsedOrderId, lastOrderId]);
  
  // Sync formData when existingOrder updates (e.g., when jobs are loaded for the first time)
  useEffect(() => {
    if (!isNewOrder && existingOrder && !hasInitializedFromOrder) {
      // Only sync on initial load when formData hasn't been initialized yet
      // This prevents overwriting user changes (like deleted jobs)
      const { total, subtotal, job_count, ...orderWithoutDenormalized } = existingOrder;
      setFormData(prev => ({
        ...prev,
        ...orderWithoutDenormalized
      }));
      setHasInitializedFromOrder(true);
      
      // Initialize time estimate mode - always start in preset mode
      // Only switch to custom when user explicitly selects "custom" option
      const currentValue = orderWithoutDenormalized.timeEstimate ?? 10;
      const presetValues = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 30];
      
      // Always start in preset mode, preserve the actual value
      setTimeEstimateMode('preset');
      setCustomTimeEstimate('');
      // Store original value only if it's not a preset (for when user switches to custom)
      if (!presetValues.includes(currentValue)) {
        setOriginalTimeEstimate(currentValue);
      } else {
        setOriginalTimeEstimate(undefined);
      }
    }
  }, [existingOrder, isNewOrder, hasInitializedFromOrder]);
  
  // Auto-focus and select input when switching to custom mode
  useEffect(() => {
    if (timeEstimateMode === 'custom' && customTimeEstimateInputRef.current) {
      // Use setTimeout to ensure the input is fully rendered
      setTimeout(() => {
        customTimeEstimateInputRef.current?.focus();
        customTimeEstimateInputRef.current?.select();
      }, 0);
    }
  }, [timeEstimateMode]);

  // Sync jobs when they load (even if formData was already initialized)
  // This handles the case where jobs load after formData was initialized
  useEffect(() => {
    if (!isNewOrder && existingOrder && jobsLoaded && (formData.jobs?.length ?? 0) === 0) {
      // Jobs just loaded, sync them to formData
      // Only sync if formData.jobs is empty (to avoid overwriting user deletions)
      if (existingOrder.jobs.length > 0) {
        setFormData(prev => ({
          ...prev,
          jobs: existingOrder.jobs
        }));
      }
    }
  }, [isNewOrder, existingOrder, jobsLoaded, formData.jobs?.length]);
  
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editingJobName, setEditingJobName] = useState('');
  const [focusedPriceInputs, setFocusedPriceInputs] = useState<Set<string>>(new Set());
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [pendingDocumentAction, setPendingDocumentAction] = useState<(() => Promise<void>) | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [clientValidationError, setClientValidationError] = useState<string>('');
  const [orderTitleValidationError, setOrderTitleValidationError] = useState<string>('');
  const [touchedOrderTitle, setTouchedOrderTitle] = useState(false);
  const [showDocumentDropdown, setShowDocumentDropdown] = useState(false);
  const documentDropdownRef = useRef<HTMLDivElement>(null);
  const [showTaxPopover, setShowTaxPopover] = useState(false);
  const [showMarkupPopover, setShowMarkupPopover] = useState(false);
  const [markupPopoverValue, setMarkupPopoverValue] = useState<string>('');
  
  // Resizable column width state
  const [jobColumnWidth, setJobColumnWidth] = useState(() => {
    const saved = localStorage.getItem('orderDetail_jobColumnWidth');
    return saved ? parseInt(saved, 10) : 300; // Default 300px
  });
  const [isResizing, setIsResizing] = useState(false);
  
  // View state for jobs - auto-switch to card on small screens (tablets and phones)
  const isMobile = useIsMobile();
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024; // lg breakpoint (tablets and phones)
  });
  
  // Detect screen size changes
  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 1024);
    };
    
    window.addEventListener('resize', checkScreenSize);
    checkScreenSize();
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);
  
  // Check if there are any subcategories in the jobs list
  const hasSubcategories = useMemo(() => 
    formData.jobs?.some(job => job.type === 'subcategory') ?? false,
    [formData.jobs]
  );
  
  // Automatically use card view on small screens, table view on larger screens
  // Force table view when subcategories are present (card view doesn't support subcategories well)
  const jobsView: 'table' | 'card' = hasSubcategories ? 'table' : (isSmallScreen ? 'card' : 'table');
  
  const selectedClient = useMemo(() => 
    formData.clientId ? clients.find(c => c.id === formData.clientId) : null,
    [clients, formData.clientId]
  );
  
  const totals = useMemo(() => {
    const order = formData as Order;
    
    // Edge case 1: New order - always calculate from jobs (will be 0)
    if (isNewOrder) {
      return getOrderTotals(order);
    }
    
    // Edge case 2: Jobs not loaded yet - use denormalized from existingOrder
    const shouldUseDenormalized = 
      !jobsLoaded && 
      existingOrder && 
      existingOrder.jobs.length === 0 &&
      (existingOrder.total !== undefined || existingOrder.subtotal !== undefined);
    
    if (shouldUseDenormalized) {
      return {
        subtotal: existingOrder.subtotal ?? 0,
        tax: (existingOrder.total ?? 0) - (existingOrder.subtotal ?? 0),
        total: existingOrder.total ?? 0,
      };
    }
    
    // Edge case: Jobs loaded but formData.jobs is empty (sync hasn't happened yet)
    // Use existingOrder.jobs if available as fallback
    if (jobsLoaded && (formData.jobs?.length ?? 0) === 0 && existingOrder && existingOrder.jobs.length > 0) {
      return getOrderTotals(existingOrder);
    }
    
    // Edge cases 3 & 4: Jobs loaded (or user deleted all) - calculate from jobs
    // This will return 0 if jobs array is empty
    return getOrderTotals(order);
  }, [formData, isNewOrder, existingOrder, jobsLoaded]);
  
  const filteredJobs = useMemo(() => {
    if (!jobSearchQuery.trim()) return [];
    const query = jobSearchQuery.toLowerCase().trim();
    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    
    return jobTemplates
      .filter(job => {
        const searchableText = `${job.name} ${job.description} ${job.category}`.toLowerCase();
        // Check if all query words appear in the searchable text
        return queryWords.every(word => searchableText.includes(word));
      })
      .slice(0, 10);
  }, [jobTemplates, jobSearchQuery]);
  
  const filteredPresets = useMemo(() => {
    if (!presetSearchQuery.trim()) return jobPresets;
    const query = presetSearchQuery.toLowerCase().trim();
    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    
    return jobPresets.filter(preset => {
      const searchableText = `${preset.name} ${preset.description} ${preset.category}`.toLowerCase();
      // Check if all query words appear in the searchable text
      return queryWords.every(word => searchableText.includes(word));
    });
  }, [jobPresets, presetSearchQuery]);

  const filteredClients = useMemo(() => {
    if (!clientSearchQuery.trim()) return [];
    const query = clientSearchQuery.toLowerCase().trim();
    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    
    return clients.filter(client => {
      const searchableText = `${client.name} ${client.company} ${client.email} ${client.phone}`.toLowerCase();
      // Check if all query words appear in the searchable text
      return queryWords.every(word => searchableText.includes(word));
    });
  }, [clients, clientSearchQuery]);
  
  // Limit displayed clients to 15
  const displayedClients = useMemo(() => {
    return filteredClients.slice(0, 15);
  }, [filteredClients]);
  
  const hasMoreClients = filteredClients.length > 15;
  
  // Check if order is saved (exists in orders list)
  const isOrderSaved = useMemo(() => {
    // If existingOrder exists, the order is saved
    return !!existingOrder;
  }, [existingOrder]);
  
  // Check if order has unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    // If order is saved, compare formData to existingOrder to detect changes
    if (isOrderSaved && existingOrder) {
      // Deep comparison of jobs array
      const jobsChanged = JSON.stringify(formData.jobs || []) !== JSON.stringify(existingOrder.jobs || []);
      
      // Check if any field has changed
      return (
        formData.clientId !== existingOrder.clientId ||
        formData.status !== existingOrder.status ||
        formData.orderType !== existingOrder.orderType ||
        formData.orderTitle !== existingOrder.orderTitle ||
        formData.taxRate !== existingOrder.taxRate ||
        formData.globalMarkup !== existingOrder.globalMarkup ||
        formData.currency !== existingOrder.currency ||
        formData.timeEstimate !== existingOrder.timeEstimate ||
        jobsChanged
      );
    }
    
    // For new orders, check if any data has been entered
    if (isNewOrder) {
      return !!(formData.clientId || (formData.jobs && formData.jobs.length > 0));
    }
    
    // For orders that don't exist yet, no unsaved changes
    return false;
  }, [isOrderSaved, existingOrder, isNewOrder, formData.clientId, formData.status, formData.orderType, formData.orderTitle, formData.taxRate, formData.globalMarkup, formData.currency, formData.timeEstimate, formData.jobs]);
  
  // Notify parent component about unsaved changes state
  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChangesChange]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (documentDropdownRef.current && !documentDropdownRef.current.contains(event.target as Node)) {
        setShowDocumentDropdown(false);
      }
    };
    
    if (showDocumentDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDocumentDropdown]);
  
  const handleCancel = () => {
    // Navigate back to previous page, or default to orders list
    if (previousPage) {
      onNavigate(previousPage.page, previousPage.id);
    } else {
      onNavigate('orders');
    }
  };

  const handleCreate = async () => {
    // Validate client is selected
    if (!formData.clientId) {
      setClientValidationError(t('orderDetail.selectClientRequired') || 'Please select a client');
      toast.error(t('orderDetail.selectClientRequired') || 'Please select a client');
      return;
    }
    
    // Validate order title is provided
    if (!formData.orderTitle || formData.orderTitle.trim() === '') {
      setTouchedOrderTitle(true);
      setOrderTitleValidationError(t('orderDetail.orderTitleRequired') || 'Order title is required');
      toast.error(t('orderDetail.orderTitleRequired') || 'Order title is required');
      return;
    }
    
    setClientValidationError('');
    setOrderTitleValidationError('');
    setIsSaving(true);
    
    try {
      const orderData: Order = {
        id: 'new',
        clientId: formData.clientId,
        status: formData.status as OrderStatus || 'proposal',
        createdAt: formData.createdAt || new Date(),
        updatedAt: new Date(),
        taxRate: formData.taxRate ?? companySettings?.defaultTaxRate ?? 0,
        globalMarkup: formData.globalMarkup ?? companySettings?.defaultMarkup ?? 0,
        currency: formData.currency || 'USD',
        orderType: formData.orderType || '',
        orderTitle: formData.orderTitle || '',
        timeEstimate: formData.timeEstimate ?? 10,
        jobs: [],
      };
      
      const generatedOrderId = await addOrder(orderData);
      
      // Construct the order object with the database-generated ID
      const newOrder: Order = {
        id: generatedOrderId,
        clientId: orderData.clientId,
        status: orderData.status,
        createdAt: orderData.createdAt,
        updatedAt: orderData.updatedAt,
        taxRate: orderData.taxRate,
        globalMarkup: orderData.globalMarkup,
        currency: orderData.currency,
        orderType: orderData.orderType,
        orderTitle: orderData.orderTitle,
        timeEstimate: orderData.timeEstimate,
        jobs: [], // New orders have no jobs
      };
      
      // Add to cache directly (no refetch needed - much faster!)
      queryClient.setQueryData<Order[]>(['orders'], (oldOrders = []) => {
        // Add new order at the beginning (most recent first, matching the fetch order)
        return [newOrder, ...oldOrders];
      });
      
      toast.success(t('orderDetail.orderCreatedSuccess'));
      // Navigate to the new order with the database-generated ID
      onNavigate('order-detail', generatedOrderId);
    } catch (error: any) {
      logger.error('Error creating order', error);
      const errorMessage = error?.message || error?.error?.message || t('orderDetail.saveOrderFailed');
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!formData.clientId) {
      toast.error(t('orderDetail.selectClientRequired') || 'Please select a client');
      return;
    }
    
    // Validate order title is provided
    if (!formData.orderTitle || formData.orderTitle.trim() === '') {
      setTouchedOrderTitle(true);
      setOrderTitleValidationError(t('orderDetail.orderTitleRequired') || 'Order title is required');
      toast.error(t('orderDetail.orderTitleRequired') || 'Order title is required');
      return;
    }
    
    setOrderTitleValidationError('');
    setIsSaving(true);
    try {
      const orderData: Order = {
        id: existingOrder?.id || formData.id || '',
        clientId: formData.clientId,
        status: formData.status as OrderStatus || 'proposal',
        createdAt: formData.createdAt || existingOrder?.createdAt || new Date(),
        updatedAt: new Date(),
        taxRate: formData.taxRate ?? companySettings?.defaultTaxRate ?? 0,
        globalMarkup: formData.globalMarkup ?? companySettings?.defaultMarkup ?? 0,
        currency: formData.currency || 'USD',
        orderType: formData.orderType || '',
        orderTitle: formData.orderTitle || '',
        timeEstimate: formData.timeEstimate ?? 10,
        jobs: formData.jobs || [],
      };
      
      await updateOrder(orderData.id, orderData);
      
      // Optimistically update the query cache so existingOrder updates immediately
      // This ensures hasUnsavedChanges becomes false right after saving
      queryClient.setQueryData<Order[]>(['orders'], (oldOrders = []) => {
        return oldOrders.map(order => 
          order.id === orderData.id ? orderData : order
        );
      });
      
      // Update formData to reflect saved state
      setFormData({ ...formData, ...orderData });
      
      toast.success(t('orderDetail.orderUpdatedSuccess'));
    } catch (error: any) {
      logger.error('Error saving order', error);
      const errorMessage = error?.message || error?.error?.message || t('orderDetail.saveOrderFailed');
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle duplicate order - creates a copy in the database and navigates to it
  const handleDuplicateOrder = () => {
    // Always show confirmation dialog
    setShowDuplicateDialog(true);
  };

  const performDuplicateOrder = async () => {
    if (!existingOrder) return;
    
    setIsDuplicating(true);
    setShowDuplicateDialog(false);
    
    try {
      // Create duplicate from the saved order data (not unsaved formData)
      const newOrderId = await duplicateOrder(existingOrder);
      toast.success(t('orderDetail.orderDuplicated') || 'Order duplicated successfully');
      onNavigate('order-detail', newOrderId);
    } catch (error: any) {
      logger.error('Error duplicating order', error);
      const errorMessage = error?.message || error?.error?.message || t('orderDetail.duplicateOrderFailed') || 'Failed to duplicate order';
      toast.error(errorMessage);
    } finally {
      setIsDuplicating(false);
    }
  };
  
  const handleAddJob = (jobId: string) => {
    const job = jobTemplates.find(j => j.id === jobId);
    if (!job) return;
    
    const newJob: OrderJob = {
      id: generateId('job'),
      jobId: job.id,
      jobName: job.name,
      description: job.description,
      quantity: 1,
      unitPrice: job.unitPrice,
      lineMarkup: formData.globalMarkup || 0,
      taxApplicable: job.defaultTax,
      position: formData.jobs?.length || 0,
      type: 'job',
    };
    
    setFormData({
      ...formData,
      jobs: [...(formData.jobs || []), newJob],
    });
    
    toast.success(t('orderDetail.jobAdded', { jobName: job.name }) || `Added ${job.name}`);
  };
  
  const handleAddEmptyJob = () => {
    const newJob: OrderJob = {
      id: generateId('job'),
      jobId: '',
      jobName: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
      lineMarkup: formData.globalMarkup || 0,
      taxApplicable: false,
      position: formData.jobs?.length || 0,
      type: 'job',
    };
    
    setFormData({
      ...formData,
      jobs: [...(formData.jobs || []), newJob],
    });
    
    // Automatically start editing the job name
    setTimeout(() => {
      setEditingJobId(newJob.id);
      setEditingJobName('');
    }, 100);
    
    toast.success(t('orderDetail.emptyJobAdded') || 'Empty job line added');
  };
  
  const handleAddSubcategory = () => {
    const newSubcategory: OrderJob = {
      id: generateId('subcategory'),
      jobId: '',
      jobName: '',
      description: '',
      quantity: 0,
      unitPrice: 0,
      lineMarkup: 0,
      taxApplicable: false,
      position: formData.jobs?.length || 0,
      type: 'subcategory',
    };
    
    setFormData({
      ...formData,
      jobs: [...(formData.jobs || []), newSubcategory],
    });
    
    // Automatically start editing the subcategory name
    setTimeout(() => {
      setEditingJobId(newSubcategory.id);
      setEditingJobName('');
    }, 100);
    
    toast.success(t('orderDetail.subcategoryAdded') || 'Subcategory added');
  };
  
  const handleAddPreset = (presetId: string) => {
    const preset = jobPresets.find(p => p.id === presetId);
    if (!preset) return;
    
    const basePosition = formData.jobs?.length || 0;
    
    const newJobs: OrderJob[] = preset.jobs.map((presetJob, index) => {
      const presetJobType = presetJob.type || 'job';
      
      // Handle subcategory items
      if (presetJobType === 'subcategory') {
        return {
          id: generateId('subcategory'),
          jobId: '',
          jobName: presetJob.subcategoryName || '',
          description: '',
          quantity: 0,
          unitPrice: 0,
          lineMarkup: 0,
          taxApplicable: false,
          position: basePosition + index,
          type: 'subcategory' as const,
        };
      }
      
      // Handle regular job items
      const job = jobTemplates.find(j => j.id === presetJob.jobId);
      
      // Handle custom/manual jobs (no template reference)
      if (!job && presetJob.customName) {
        return {
          id: generateId('job'),
          jobId: '',
          jobName: presetJob.customName,
          description: '',
          quantity: presetJob.defaultQty,
          unitPrice: presetJob.defaultPrice ?? 0,
          lineMarkup: formData.globalMarkup || 0,
          taxApplicable: false,
          position: basePosition + index,
          type: 'job' as const,
        };
      }
      
      if (!job) return null;
      
      return {
        id: generateId('job'),
        jobId: job.id,
        jobName: job.name,
        description: job.description,
        quantity: presetJob.defaultQty,
        unitPrice: presetJob.defaultPrice ?? job.unitPrice, // Use preset price if set
        lineMarkup: formData.globalMarkup || 0,
        taxApplicable: job.defaultTax,
        position: basePosition + index,
        type: 'job' as const,
      };
    }).filter(Boolean) as OrderJob[];
    
    setFormData({
      ...formData,
      jobs: [...(formData.jobs || []), ...newJobs],
    });
    
    setShowPresetPicker(false);
    toast.success(t('orderDetail.presetAdded', { presetName: preset.name }) || `Added ${preset.name} preset`);
  };
  
  const handleRemoveJob = (jobId: string) => {
    setFormData({
      ...formData,
      jobs: formData.jobs?.filter(j => j.id !== jobId) || [],
    });
  };
  
  const handleDuplicateJob = (jobId: string) => {
    const jobToDuplicate = formData.jobs?.find(j => j.id === jobId);
    if (!jobToDuplicate) return;
    
    const duplicatedJob: OrderJob = {
      ...jobToDuplicate,
      id: generateId('order-job'),
    };
    
    setFormData({
      ...formData,
      jobs: [...(formData.jobs || []), duplicatedJob],
    });
    
    // Enter edit mode for the duplicated job's title
    setTimeout(() => {
      setEditingJobId(duplicatedJob.id);
      setEditingJobName(duplicatedJob.jobName || '');
    }, 0);
  };
  
  const handleStartEditJobName = (jobId: string) => {
    const job = formData.jobs?.find(j => j.id === jobId);
    if (job) {
      setEditingJobId(jobId);
      setEditingJobName(job.jobName);
    }
  };
  
  const handleSaveJobName = (jobId: string) => {
    if (editingJobName.trim()) {
      handleUpdateJob(jobId, { jobName: editingJobName.trim() });
    }
    setEditingJobId(null);
    setEditingJobName('');
  };
  
  const handleCancelEditJobName = () => {
    setEditingJobId(null);
    setEditingJobName('');
  };
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Handle drag end for reordering jobs/subcategories
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      return;
    }
    
    const jobs = formData.jobs || [];
    const oldIndex = jobs.findIndex(j => j.id === active.id);
    const newIndex = jobs.findIndex(j => j.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    
    // Reorder the array
    const newJobs = arrayMove(jobs, oldIndex, newIndex);
    
    // Update positions to match new order
    const updatedJobs = newJobs.map((job, index) => ({
      ...job,
      position: index,
    }));
    
    setFormData({
      ...formData,
      jobs: updatedJobs,
    });
  };
  
  // Document generation handlers
  const handleGenerateDocument = async (action: () => Promise<void>) => {
    if (!isOrderSaved) {
      setPendingDocumentAction(() => action);
      setShowDocumentDialog(true);
      return;
    }
    await action();
  };
  
  const handleCreateDocumentAnyway = async () => {
    setShowDocumentDialog(false);
    if (pendingDocumentAction) {
      await pendingDocumentAction();
      setPendingDocumentAction(null);
    }
  };
  
  const handleSaveAndCreateDocument = async () => {
    setShowDocumentDialog(false);
    
    // Save the order first
    if (!formData.clientId) {
      toast.error(t('orderDetail.selectClientRequired') || 'Please select a client');
      setPendingDocumentAction(null);
      return;
    }
    
    // Validate order title is provided
    if (!formData.orderTitle || formData.orderTitle.trim() === '') {
      setTouchedOrderTitle(true);
      setOrderTitleValidationError(t('orderDetail.orderTitleRequired') || 'Order title is required');
      toast.error(t('orderDetail.orderTitleRequired') || 'Order title is required');
      setPendingDocumentAction(null);
      return;
    }
    
    try {
      const orderData: Order = {
        id: isNewOrder ? 'new' : (existingOrder?.id || formData.id || ''),
        clientId: formData.clientId,
        status: (formData.status || 'proposal') as OrderStatus,
        orderType: formData.orderType || '',
        orderTitle: formData.orderTitle || '',
        jobs: formData.jobs || [],
        createdAt: existingOrder?.createdAt || new Date(),
        updatedAt: new Date(),
        taxRate: formData.taxRate ?? companySettings?.defaultTaxRate ?? 0,
        globalMarkup: formData.globalMarkup ?? companySettings?.defaultMarkup ?? 0,
        currency: formData.currency || 'USD',
      };
      
      if (isNewOrder) {
        const generatedOrderId = await addOrder(orderData);
        toast.success(t('orderDetail.orderCreatedSuccess'));
        // Update formData with the new order ID and all order data
        // This ensures the order is recognized as saved
        setFormData({ ...formData, ...orderData, id: generatedOrderId });
      } else {
        await updateOrder(orderData.id, orderData);
        
        // Optimistically update the query cache so existingOrder updates immediately
        queryClient.setQueryData<Order[]>(['orders'], (oldOrders = []) => {
          return oldOrders.map(order => 
            order.id === orderData.id ? orderData : order
          );
        });
        
        toast.success(t('orderDetail.orderUpdatedSuccess'));
        // Update formData to reflect saved state
        setFormData({ ...formData, ...orderData });
      }
      
      // Small delay to ensure orders list updates and state propagates
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Now generate the document
      if (pendingDocumentAction) {
        await pendingDocumentAction();
        setPendingDocumentAction(null);
      }
    } catch (error) {
      logger.error('Error saving order', error);
      toast.error(t('orderDetail.saveOrderFailed'));
      setPendingDocumentAction(null);
    }
  };
  
  const handleCancelDocumentDialog = () => {
    setShowDocumentDialog(false);
    setPendingDocumentAction(null);
  };
  
  // Document generation handlers
  const handleGenerateInvoice = async () => {
    if (!formData.clientId || !formData.jobs || formData.jobs.length === 0) {
      toast.error(t('orderDetail.selectClientAndAddItems') || 'Please select a client and add line items');
      return;
    }
    
    const client = clients.find(c => c.id === formData.clientId);
    if (!client) {
      toast.error(t('orderDetail.clientNotFound') || 'Client not found');
      return;
    }
    
    await handleGenerateDocument(async () => {
      setGeneratingInvoice(true);
      try {
        const order = formData as Order;
        const invoiceNumber = generateDocumentNumber(
          companySettings.invoicePrefix,
          order.id,
          order.createdAt || new Date()
        );
        await generateInvoice(order, client, companySettings, invoiceNumber);
        toast.success(t('orderDetail.invoiceGeneratedSuccess'));
      } catch (error) {
        logger.error('Error generating invoice', error);
        toast.error(t('orderDetail.invoiceGenerationFailed'));
      } finally {
        setGeneratingInvoice(false);
      }
    });
  };
  
  const handleGeneratePO = async () => {
    if (!formData.clientId || !formData.jobs || formData.jobs.length === 0) {
      toast.error(t('orderDetail.selectClientAndAddItems') || 'Please select a client and add line items');
      return;
    }
    
    const client = clients.find(c => c.id === formData.clientId);
    if (!client) {
      toast.error(t('orderDetail.clientNotFound') || 'Client not found');
      return;
    }
    
    await handleGenerateDocument(async () => {
      setGeneratingPO(true);
      try {
        const order = formData as Order;
        const poNumber = generateDocumentNumber(
          companySettings.poPrefix,
          order.id,
          order.createdAt || new Date()
        );
        await generatePurchaseOrder(order, client, companySettings, poNumber);
        toast.success(t('orderDetail.poGeneratedSuccess'));
      } catch (error) {
        logger.error('Error generating PO', error);
        toast.error(t('orderDetail.poGenerationFailed'));
      } finally {
        setGeneratingPO(false);
      }
    });
  };
  
  const handleGenerateSpecification = async () => {
    if (!formData.clientId || !formData.jobs || formData.jobs.length === 0) {
      toast.error(t('orderDetail.selectClientAndAddItems') || 'Please select a client and add line items');
      return;
    }
    
    const client = clients.find(c => c.id === formData.clientId);
    if (!client) {
      toast.error(t('orderDetail.clientNotFound') || 'Client not found');
      return;
    }
    
    await handleGenerateDocument(async () => {
      setGeneratingSpecification(true);
      try {
        const order = formData as Order;
        const specificationNumber = generateDocumentNumber(
          companySettings.invoicePrefix,
          order.id,
          order.createdAt || new Date()
        );
        await generateSpecification(order, client, companySettings, specificationNumber);
        toast.success(t('orderDetail.specificationGeneratedSuccess'));
      } catch (error) {
        logger.error('Error generating specification', error);
        toast.error(t('orderDetail.specificationGenerationFailed'));
      } finally {
        setGeneratingSpecification(false);
      }
    });
  };
  
  // Number formatting helpers
  const formatNumber = (value: number, locale?: string): string => {
    const finalLocale = locale || (i18n.language === 'ru' ? 'ru-RU' : 'en-US');
    // Round to integer (no cents/kopecks)
    const roundedValue = Math.round(value);
    return new Intl.NumberFormat(finalLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(roundedValue);
  };
  
  const parseFormattedNumber = (value: string): number => {
    // Remove all non-digit characters except decimal point
    const cleaned = value.replace(/[^\d.,]/g, '');
    // Replace comma with dot for parsing
    const normalized = cleaned.replace(',', '.');
    return parseFloat(normalized) || 0;
  };
  
  const handlePriceFocus = (jobId: string) => {
    setFocusedPriceInputs(prev => new Set(prev).add(jobId));
  };
  
  const handlePriceBlur = (jobId: string, currentValue: string) => {
    const parsed = parseFormattedNumber(currentValue);
    handleUpdateJob(jobId, { unitPrice: parsed });
    setFocusedPriceInputs(prev => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    });
  };
  
  // Column resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    
    // Add visual feedback
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    
    const startX = e.clientX;
    const startWidth = jobColumnWidth;
    let currentWidth = startWidth;
    
    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      currentWidth = Math.max(150, Math.min(800, startWidth + diff)); // Min 150px, max 800px
      setJobColumnWidth(currentWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem('orderDetail_jobColumnWidth', currentWidth.toString());
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [jobColumnWidth]);
  
  const handleUpdateJob = (jobId: string, updates: Partial<OrderJob>) => {
    setFormData({
      ...formData,
      jobs: formData.jobs?.map(j => 
        j.id === jobId ? { ...j, ...updates } : j
      ) || [],
    });
  };
  
  const handleApplyGlobalMarkup = (markupValue?: number) => {
    if (!formData.jobs) return;
    
    const markupToApply = markupValue !== undefined ? markupValue : (formData.globalMarkup || 0);
    
    setFormData({
      ...formData,
      globalMarkup: markupToApply,
      jobs: formData.jobs.map(j => ({
        ...j,
        lineMarkup: markupToApply,
      })),
    });
    
    setShowMarkupPopover(false);
    setMarkupPopoverValue('');
    toast.success(t('orderDetail.markupApplied') || 'Markup applied to all jobs');
  };
  
  if (!isNewOrder && !existingOrder) {
    return (
      <div className="text-center py-12">
        <p className="text-[#7C8085] mb-4">Order not found</p>
        <button
          onClick={() => onNavigate('orders')}
          className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors cursor-pointer"
        >
          Back to Orders
        </button>
      </div>
    );
  }
  
  // Simplified create form for new orders
  if (isNewOrder) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleCancel}
              className="p-2 hover:bg-[#E4E7E7] rounded-lg transition-colors cursor-pointer"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-[#1E2025] mb-1">
                {isNewOrder 
                  ? t('orderDetail.newOrder') 
                  : t('orderDetail.orderNumber', { number: extractIdNumbers(parsedOrderId) })
                }
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 justify-end">
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors cursor-pointer"
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              onClick={handleCreate}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                  {t('common.saving') || 'Saving...'}
                </>
              ) : (
                <>
                  <Save size={20} aria-hidden="true" />
                  {t('orderDetail.createOrder') || 'Create Order'}
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Basic Order Information Card */}
        <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: Client and Order Title */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client">{t('orderDetail.clientRequired')}</Label>
                <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="client"
                      variant="outline"
                      role="combobox"
                      className={`w-full justify-between text-left font-normal h-9 min-w-0 ${
                        clientValidationError ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/50' : ''
                      }`}
                    >
                      <span className="truncate flex-1 text-left">
                        {selectedClient 
                          ? (() => {
                              const hasName = selectedClient.name && selectedClient.name !== 'Unknown' && selectedClient.name.trim() !== '';
                              const hasCompany = selectedClient.company && selectedClient.company.trim() !== '';
                              if (hasCompany) {
                                return selectedClient.company;
                              } else if (hasName) {
                                return selectedClient.name;
                              }
                              return t('orderDetail.selectClient');
                            })()
                          : t('orderDetail.selectClient')}
                      </span>
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent 
                    className="!w-[400px] !max-w-[400px] !min-w-[400px] p-0 overflow-hidden" 
                    align="start"
                    style={{ width: '400px', maxWidth: '400px', minWidth: '400px' }}
                  >
                    <div className="w-full overflow-hidden" style={{ width: '400px', maxWidth: '400px', boxSizing: 'border-box' }}>
                      <div className="p-4 border-b border-[#E4E7E7]">
                        <div className="relative">
                          <Search 
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C8085]" 
                            size={18}
                            aria-hidden="true"
                          />
                          <Input
                            type="search"
                            placeholder={t('orderDetail.searchClientsPlaceholder') || 'Search clients...'}
                            value={clientSearchQuery}
                            onChange={(e) => {
                              setClientSearchQuery(e.target.value);
                              if (clientValidationError) {
                                setClientValidationError('');
                              }
                            }}
                            className="pl-10 w-full"
                            style={{ maxWidth: '100%', boxSizing: 'border-box' }}
                            aria-label={t('orderDetail.searchClientsLabel') || 'Search clients'}
                          />
                        </div>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto w-full" style={{ width: '400px', maxWidth: '400px', maxHeight: '240px', boxSizing: 'border-box' }}>
                        {filteredClients.length === 0 ? (
                          <div className="p-4 text-center text-[#7C8085]">
                            {clientSearchQuery.trim() 
                              ? (t('orderDetail.noClientsFound') || 'No clients found')
                              : (t('orderDetail.startTypingToSearchClients') || 'Start typing to search for clients')}
                          </div>
                        ) : (
                          <>
                            <div className="p-2">
                              {displayedClients.map(client => (
                              <button
                                key={client.id}
                                onClick={() => {
                                  setFormData({ ...formData, clientId: client.id });
                                  setClientPickerOpen(false);
                                  setClientSearchQuery('');
                                  setClientValidationError('');
                                }}
                                className="w-full p-3 text-left rounded-lg hover:bg-[#F7F8F8] transition-colors cursor-pointer overflow-hidden"
                                style={{ maxWidth: '100%', boxSizing: 'border-box' }}
                              >
                                {client.company && client.company.trim() !== '' ? (
                                  <>
                                    <p className="text-[#1E2025] font-medium truncate">
                                      {client.company}
                                    </p>
                                    {client.name && client.name !== 'Unknown' && client.name.trim() !== '' && (
                                      <p className="text-[#7C8085] text-sm truncate">{client.name}</p>
                                    )}
                                  </>
                                ) : (
                                  client.name && client.name !== 'Unknown' && client.name.trim() !== '' && (
                                    <p className="text-[#1E2025] font-medium truncate">{client.name}</p>
                                  )
                                )}
                                {client.email && typeof client.email === 'string' && client.email.trim() !== '' && (
                                  <p className="text-[#7C8085] text-sm truncate">{client.email}</p>
                                )}
                              </button>
                            ))}
                            </div>
                            {hasMoreClients && (
                              <div className="p-3 border-t border-[#E4E7E7] text-center">
                                <p className="text-[#7C8085] text-sm">
                                  {t('orderDetail.moreClientsAvailable', { count: filteredClients.length - 15 }) || `Continue typing to see ${filteredClients.length - 15} more result${filteredClients.length - 15 === 1 ? '' : 's'}`}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                {clientValidationError && (
                  <p className="text-sm text-red-600">{clientValidationError}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="orderTitle">{t('orderDetail.orderTitle')} *</Label>
                <Textarea
                  id="orderTitle"
                  value={formData.orderTitle || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, orderTitle: e.target.value });
                    if (orderTitleValidationError) {
                      setOrderTitleValidationError('');
                    }
                  }}
                  onBlur={() => {
                    setTouchedOrderTitle(true);
                    if (!formData.orderTitle || formData.orderTitle.trim() === '') {
                      setOrderTitleValidationError(t('orderDetail.orderTitleRequired') || 'Order title is required');
                    }
                  }}
                  rows={2}
                  placeholder={t('orderDetail.orderTitlePlaceholder')}
                  required
                  aria-invalid={touchedOrderTitle && !!orderTitleValidationError}
                  className={touchedOrderTitle && orderTitleValidationError ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/50' : ''}
                />
                {touchedOrderTitle && orderTitleValidationError && (
                  <p className="text-sm text-red-600">{orderTitleValidationError}</p>
                )}
              </div>
            </div>
            
            {/* Right Column: Status, Type, and Estimate */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status">{t('orderDetail.status')}</Label>
                <Select
                  value={formData.status || 'proposal'}
                  onValueChange={(value) => setFormData({ ...formData, status: value as OrderStatus })}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proposal">{t('orders.proposal')}</SelectItem>
                    <SelectItem value="in-progress">{t('orders.inProgress')}</SelectItem>
                    <SelectItem value="completed">{t('orders.completed')}</SelectItem>
                    <SelectItem value="canceled">{t('orders.canceled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="orderDate">{t('orderDetail.orderDate')}</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="orderDate"
                      variant="outline"
                      className="w-full justify-between text-left font-normal h-9"
                    >
                      <span className="truncate flex-1 text-left">
                        {formData.createdAt ? formatDate(formData.createdAt) : t('orderDetail.selectDate') || 'Select date'}
                      </span>
                      <Calendar className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <DatePicker
                      date={formData.createdAt || null}
                      onChange={(date) => {
                        setFormData({ ...formData, createdAt: date || new Date() });
                        setDatePickerOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="orderType">{t('orderDetail.orderType')}</Label>
                <Select
                  value={formData.orderType || ''}
                  onValueChange={(value) => setFormData({ ...formData, orderType: value })}
                >
                  <SelectTrigger id="orderType">
                    <SelectValue placeholder={t('orderDetail.orderTypePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {getOrderTypeLabel(type.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="timeEstimate">{t('orderDetail.timeEstimate')}</Label>
                {timeEstimateMode === 'preset' ? (
                  <Select
                    value={(formData.timeEstimate ?? 10).toString()}
                        onValueChange={(value) => {
                          if (value === 'custom') {
                            setTimeEstimateMode('custom');
                            // Restore original value if it exists, otherwise use current formData value
                            const valueToShow = originalTimeEstimate !== undefined 
                              ? originalTimeEstimate.toString() 
                              : (formData.timeEstimate ?? 10).toString();
                            setCustomTimeEstimate(valueToShow);
                            setFormData({ ...formData, timeEstimate: originalTimeEstimate ?? formData.timeEstimate ?? 10 });
                            // Focus the input after a short delay to ensure it's rendered
                            setTimeout(() => {
                              customTimeEstimateInputRef.current?.focus();
                              customTimeEstimateInputRef.current?.select();
                            }, 0);
                          } else {
                            const numValue = parseInt(value, 10);
                            setFormData({ ...formData, timeEstimate: numValue });
                            // Clear original value since user selected a preset
                            setOriginalTimeEstimate(undefined);
                          }
                        }}
                  >
                    <SelectTrigger id="timeEstimate">
                      <SelectValue>
                        {formData.timeEstimate ?? 10}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 30].map((days) => (
                        <SelectItem key={days} value={days.toString()}>
                          {days}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">{t('orderDetail.timeEstimateCustom')}</SelectItem>
                    </SelectContent>
                  </Select>
              ) : (
                  <Input
                    ref={customTimeEstimateInputRef}
                    type="number"
                    min="1"
                    value={customTimeEstimate}
                    onChange={(e) => {
                      setCustomTimeEstimate(e.target.value);
                      const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                      setFormData({ ...formData, timeEstimate: isNaN(value as number) ? undefined : value });
                    }}
                    placeholder="10"
                    className="w-full"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Full order detail view for existing orders
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-[#E4E7E7] rounded-lg transition-colors cursor-pointer"
            aria-label="Back to orders"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-[#1E2025] mb-1">
              {isNewOrder 
                ? t('orderDetail.newOrder') 
                : t('orderDetail.orderNumber', { number: extractIdNumbers(existingOrder?.id || parsedOrderId) })
              }
            </h1>
            {selectedClient && (
              <button
                onClick={() => onNavigate('client-detail', selectedClient.id)}
                className="text-left cursor-pointer"
                onMouseEnter={(e) => {
                  const p = e.currentTarget.querySelector('p');
                  const spans = e.currentTarget.querySelectorAll('span');
                  if (p) p.style.textDecoration = 'underline';
                  spans.forEach(span => {
                    span.style.color = '#1F744F';
                  });
                }}
                onMouseLeave={(e) => {
                  const p = e.currentTarget.querySelector('p');
                  const spans = e.currentTarget.querySelectorAll('span');
                  if (p) p.style.textDecoration = 'none';
                  spans.forEach(span => {
                    span.style.color = '';
                  });
                  // Reset company-only case
                  if (spans.length === 0 && p) {
                    p.style.color = '';
                  }
                }}
              >
                {selectedClient.name && selectedClient.name !== 'Unknown' && selectedClient.name.trim() !== '' ? (
                  selectedClient.company && selectedClient.company.trim() !== '' ? (
                    <p className="text-[#555A60]">
                      <span className="transition-colors">{selectedClient.name}</span>
                      {' · '}
                      <span className="transition-colors">{selectedClient.company}</span>
                    </p>
                  ) : (
                    <p className="text-[#555A60] transition-all">{selectedClient.name}</p>
                  )
                ) : (
                  selectedClient.company && selectedClient.company.trim() !== '' ? (
                    <p className="text-[#555A60] transition-all">{selectedClient.company}</p>
                  ) : null
                )}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          {/* Duplicate Order Button - only show for existing orders */}
          {!isNewOrder && (
            <button
              onClick={handleDuplicateOrder}
              disabled={isDuplicating || isSaving}
              className="p-2 text-[#888D93] hover:text-[#1E2025] hover:bg-[#E4E7E7] border border-[#E4E7E7] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('orderDetail.duplicate') || 'Duplicate'}
              aria-label={t('orderDetail.duplicate') || 'Duplicate'}
            >
              {isDuplicating ? (
                <Loader2 size={20} className="animate-spin" aria-hidden="true" />
              ) : (
                <Copy size={20} aria-hidden="true" />
              )}
            </button>
          )}
          {/* Document Dropdown */}
          <div className="relative" ref={documentDropdownRef}>
            <button
              onClick={() => setShowDocumentDropdown(!showDocumentDropdown)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-[#1E2025] border border-[#E4E7E7] rounded-lg hover:bg-[#F7F8F8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!formData.clientId || !formData.jobs || formData.jobs.length === 0 || generatingInvoice || generatingPO || generatingSpecification}
            >
              <FileText size={20} aria-hidden="true" />
              {t('orderDetail.generateDocument')}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            
            {showDocumentDropdown && (
              <div className="absolute right-0 top-full mt-1 w-full min-w-[200px] bg-white border border-[#E4E7E7] rounded-lg shadow-lg z-50 overflow-hidden">
                <button
                  onClick={() => {
                    handleGenerateInvoice();
                    setShowDocumentDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-[#1E2025] hover:bg-[#F7F8F8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={generatingInvoice || generatingPO || generatingSpecification}
                >
                  {generatingInvoice ? (
                    <>
                      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                      {t('orderDetail.generating')}
                    </>
                  ) : (
                    <>
                      <FileText size={18} aria-hidden="true" />
                      {t('orderDetail.generateInvoice')}
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    handleGeneratePO();
                    setShowDocumentDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-[#1E2025] hover:bg-[#F7F8F8] transition-colors border-t border-[#E4E7E7] disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={generatingInvoice || generatingPO || generatingSpecification}
                >
                  {generatingPO ? (
                    <>
                      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                      {t('orderDetail.generating')}
                    </>
                  ) : (
                    <>
                      <FileText size={18} aria-hidden="true" />
                      {t('orderDetail.generatePO')}
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    handleGenerateSpecification();
                    setShowDocumentDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-[#1E2025] hover:bg-[#F7F8F8] transition-colors border-t border-[#E4E7E7] disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={generatingInvoice || generatingPO || generatingSpecification}
                >
                  {generatingSpecification ? (
                    <>
                      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                      {t('orderDetail.generating')}
                    </>
                  ) : (
                    <>
                      <FileText size={18} aria-hidden="true" />
                      {t('orderDetail.generateSpecification')}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white border border-transparent rounded-lg hover:bg-[#165B3C] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            ) : (
              <Save size={20} aria-hidden="true" />
            )}
            {isSaving 
              ? (t('common.saving') || 'Saving...')
              : (isNewOrder ? t('orderDetail.createOrder') : t('common.saveChanges'))
            }
          </button>
        </div>
      </div>
      
      <div className="space-y-6">
          {/* Order Info Card */}
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Section 1: Order Information (spans 2 columns on desktop) */}
              <div className="md:col-span-2">
                <h3 className="text-[#555A60] mb-4 font-semibold text-base">{t('orderDetail.orderInformation')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column: Client and Order Title */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="client">{t('orderDetail.clientRequired')}</Label>
                    <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          id="client"
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between text-left font-normal h-9 min-w-0"
                        >
                          <span className="truncate flex-1 text-left">
                            {selectedClient 
                              ? (() => {
                                  const hasName = selectedClient.name && selectedClient.name !== 'Unknown' && selectedClient.name.trim() !== '';
                                  const hasCompany = selectedClient.company && selectedClient.company.trim() !== '';
                                  if (hasCompany) {
                                    return selectedClient.company;
                                  } else if (hasName) {
                                    return selectedClient.name;
                                  }
                                  return t('orderDetail.selectClient');
                                })()
                              : t('orderDetail.selectClient')}
                          </span>
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="!w-[400px] !max-w-[400px] !min-w-[400px] p-0 overflow-hidden" 
                        align="start"
                        style={{ width: '400px', maxWidth: '400px', minWidth: '400px' }}
                      >
                        <div className="w-full overflow-hidden" style={{ width: '400px', maxWidth: '400px', boxSizing: 'border-box' }}>
                          <div className="p-4 border-b border-[#E4E7E7]">
                            <div className="relative">
                              <Search 
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C8085]" 
                                size={18}
                                aria-hidden="true"
                              />
                              <Input
                                type="search"
                                placeholder={t('orderDetail.searchClientsPlaceholder') || 'Search clients...'}
                                value={clientSearchQuery}
                                onChange={(e) => setClientSearchQuery(e.target.value)}
                                className="pl-10 w-full"
                                style={{ maxWidth: '100%', boxSizing: 'border-box' }}
                                aria-label={t('orderDetail.searchClientsLabel') || 'Search clients'}
                              />
                            </div>
                          </div>
                          <div className="max-h-[240px] overflow-y-auto w-full" style={{ width: '400px', maxWidth: '400px', maxHeight: '240px', boxSizing: 'border-box' }}>
                            {filteredClients.length === 0 ? (
                              <div className="p-4 text-center text-[#7C8085]">
                                {clientSearchQuery.trim() 
                                  ? (t('orderDetail.noClientsFound') || 'No clients found')
                                  : (t('orderDetail.startTypingToSearchClients') || 'Start typing to search for clients')}
                              </div>
                            ) : (
                              <>
                                <div className="p-2">
                                  {displayedClients.map(client => (
                                  <button
                                    key={client.id}
                                    onClick={() => {
                                      setFormData({ ...formData, clientId: client.id });
                                      setClientPickerOpen(false);
                                      setClientSearchQuery('');
                                    }}
                                    className="w-full p-3 text-left rounded-lg hover:bg-[#F7F8F8] transition-colors cursor-pointer overflow-hidden"
                                    style={{ maxWidth: '100%', boxSizing: 'border-box' }}
                                  >
                                    {client.company && client.company.trim() !== '' ? (
                                      <>
                                        <p className="text-[#1E2025] font-medium truncate">
                                          {client.company}
                                        </p>
                                        {client.name && client.name !== 'Unknown' && client.name.trim() !== '' && (
                                          <p className="text-[#7C8085] text-sm truncate">{client.name}</p>
                                        )}
                                      </>
                                    ) : (
                                      client.name && client.name !== 'Unknown' && client.name.trim() !== '' && (
                                        <p className="text-[#1E2025] font-medium truncate">{client.name}</p>
                                      )
                                    )}
                                    {client.email && typeof client.email === 'string' && client.email.trim() !== '' && (
                                      <p className="text-[#7C8085] text-sm truncate">{client.email}</p>
                                    )}
                                  </button>
                                ))}
                                </div>
                                {hasMoreClients && (
                                  <div className="p-3 border-t border-[#E4E7E7] text-center">
                                    <p className="text-[#7C8085] text-sm">
                                      {t('orderDetail.moreClientsAvailable', { count: filteredClients.length - 15 }) || `Continue typing to see ${filteredClients.length - 15} more result${filteredClients.length - 15 === 1 ? '' : 's'}`}
                                    </p>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="orderTitle">{t('orderDetail.orderTitle')} *</Label>
                    <Textarea
                      id="orderTitle"
                      value={formData.orderTitle || ''}
                      onChange={(e) => {
                        setFormData({ ...formData, orderTitle: e.target.value });
                        if (orderTitleValidationError) {
                          setOrderTitleValidationError('');
                        }
                      }}
                      onBlur={() => {
                        setTouchedOrderTitle(true);
                        if (!formData.orderTitle || formData.orderTitle.trim() === '') {
                          setOrderTitleValidationError(t('orderDetail.orderTitleRequired') || 'Order title is required');
                        }
                      }}
                      rows={2}
                      placeholder={t('orderDetail.orderTitlePlaceholder')}
                      required
                      aria-invalid={touchedOrderTitle && !!orderTitleValidationError}
                      className={touchedOrderTitle && orderTitleValidationError ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/50' : ''}
                    />
                    {touchedOrderTitle && orderTitleValidationError && (
                      <p className="text-sm text-red-600">{orderTitleValidationError}</p>
                    )}
                    </div>
                  </div>
                  
                  {/* Right Column: Status, Order Type, Time Estimate */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="status">{t('orderDetail.status')}</Label>
                    <Select
                      value={formData.status || 'proposal'}
                      onValueChange={(value) => setFormData({ ...formData, status: value as OrderStatus })}
                    >
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="proposal">{t('orders.proposal')}</SelectItem>
                        <SelectItem value="in-progress">{t('orders.inProgress')}</SelectItem>
                        <SelectItem value="completed">{t('orders.completed')}</SelectItem>
                        <SelectItem value="canceled">{t('orders.canceled')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="orderDate">{t('orderDetail.orderDate')}</Label>
                    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          id="orderDate"
                          variant="outline"
                          className="w-full justify-between text-left font-normal h-9"
                        >
                          <span className="truncate flex-1 text-left">
                            {formData.createdAt ? formatDate(formData.createdAt) : t('orderDetail.selectDate') || 'Select date'}
                          </span>
                          <Calendar className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <DatePicker
                          date={formData.createdAt || null}
                          onChange={(date) => {
                            setFormData({ ...formData, createdAt: date || new Date() });
                            setDatePickerOpen(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="orderType">{t('orderDetail.orderType')}</Label>
                    <Select
                      value={formData.orderType || ''}
                      onValueChange={(value) => setFormData({ ...formData, orderType: value })}
                    >
                      <SelectTrigger id="orderType">
                        <SelectValue placeholder={t('orderDetail.orderTypePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {getOrderTypeLabel(type.value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="timeEstimate">{t('orderDetail.timeEstimate')}</Label>
                    {timeEstimateMode === 'preset' ? (
                      <Select
                        value={(formData.timeEstimate ?? 10).toString()}
                        onValueChange={(value) => {
                          if (value === 'custom') {
                            setTimeEstimateMode('custom');
                            // Restore original value if it exists, otherwise use current formData value
                            const valueToShow = originalTimeEstimate !== undefined 
                              ? originalTimeEstimate.toString() 
                              : (formData.timeEstimate ?? 10).toString();
                            setCustomTimeEstimate(valueToShow);
                            setFormData({ ...formData, timeEstimate: originalTimeEstimate ?? formData.timeEstimate ?? 10 });
                            // Focus the input after a short delay to ensure it's rendered
                            setTimeout(() => {
                              customTimeEstimateInputRef.current?.focus();
                              customTimeEstimateInputRef.current?.select();
                            }, 0);
                          } else {
                            const numValue = parseInt(value, 10);
                            setFormData({ ...formData, timeEstimate: numValue });
                            // Clear original value since user selected a preset
                            setOriginalTimeEstimate(undefined);
                          }
                        }}
                      >
                        <SelectTrigger id="timeEstimate">
                          <SelectValue>
                            {formData.timeEstimate ?? 10}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {[2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 30].map((days) => (
                            <SelectItem key={days} value={days.toString()}>
                              {days}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">{t('orderDetail.timeEstimateCustom')}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        ref={customTimeEstimateInputRef}
                        type="number"
                        min="1"
                        value={customTimeEstimate}
                        onChange={(e) => {
                          setCustomTimeEstimate(e.target.value);
                          const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                          setFormData({ ...formData, timeEstimate: isNaN(value as number) ? undefined : value });
                        }}
                        placeholder="10"
                        className="w-full"
                      />
                    )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Section 2: Order Summary */}
              <div>
                <h3 className="text-[#555A60] mb-4 font-semibold text-base">{t('orderDetail.orderSummary')}</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[#555A60]">
                    <span>{t('orderDetail.subtotal')}</span>
                    <span>{formatCurrency(totals.subtotal)}</span>
                  </div>
                  <Popover open={showTaxPopover} onOpenChange={setShowTaxPopover}>
                    <PopoverTrigger asChild>
                      {formData.taxRate === 0 ? (
                        <div className="flex items-center justify-between text-[#555A60]">
                          <span>{t('orderDetail.tax')}</span>
                          <button
                            className="text-[#7C8085] hover:text-[#1F744F] underline text-sm transition-colors cursor-pointer"
                          >
                            {t('orderDetail.addTax') || '+ Add tax'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[#555A60] cursor-pointer hover:text-[#1F744F] transition-colors">
                          <span>{t('orderDetail.tax')} ({formData.taxRate}%)</span>
                          <span>{formatCurrency(totals.tax)}</span>
                        </div>
                      )}
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="end">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="taxRateInput">{t('orderDetail.taxRate')}</Label>
                          <Input
                            id="taxRateInput"
                            type="number"
                            min="0"
                            step="0.1"
                            value={formData.taxRate || 0}
                            onChange={(e) => setFormData({ 
                              ...formData, 
                              taxRate: parseFloat(e.target.value) || 0 
                            })}
                            onWheel={(e) => e.currentTarget.blur()}
                            autoFocus
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setShowTaxPopover(false)}
                          >
                            {t('common.cancel') || 'Cancel'}
                          </Button>
                          <Button
                            onClick={() => setShowTaxPopover(false)}
                          >
                            {t('common.save') || 'Save'}
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="pt-3 border-t border-[#E4E7E7]">
                    <div className="flex items-center justify-between text-[#1E2025]">
                      <span>{t('orderDetail.total')}</span>
                      <span>{formatCurrency(totals.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Line Items */}
          <div className="bg-white rounded-xl border border-[#E4E7E7]">
            <div className="px-6 py-4 border-b border-[#E4E7E7] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h2 className="text-[#1E2025]">{t('orderDetail.lineItems')}</h2>
              <div className="flex flex-wrap gap-2 items-center justify-end sm:ml-auto">
                <button
                  onClick={() => {
                    if (showPresetPicker) {
                      setPresetSearchQuery('');
                    }
                    setShowPresetPicker(!showPresetPicker);
                    if (!showPresetPicker) {
                      setShowJobPicker(false);
                      setJobSearchQuery('');
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors"
                >
                  <Layers size={18} aria-hidden="true" />
                  {t('orderDetail.addPreset')}
                </button>
                <button
                  onClick={() => {
                    if (showJobPicker) {
                      setJobSearchQuery('');
                    }
                    setShowJobPicker(!showJobPicker);
                    if (!showJobPicker) {
                      setShowPresetPicker(false);
                      setPresetSearchQuery('');
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors"
                >
                  <Search size={18} aria-hidden="true" />
                  {t('orderDetail.addFromCatalog')}
                </button>
                <button
                  onClick={handleAddSubcategory}
                  className="flex items-center gap-2 px-3 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors"
                >
                  <FolderPlus size={18} aria-hidden="true" />
                  {t('orderDetail.addSubcategory')}
                </button>
                <button
                  onClick={handleAddEmptyJob}
                  className="flex items-center gap-2 px-3 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
                >
                  <Plus size={18} aria-hidden="true" />
                  {t('orderDetail.addJob')}
                </button>
              </div>
            </div>
            
            {/* Job Picker */}
            {showJobPicker && (
              <div className="px-6 py-4 border-b border-[#E4E7E7] bg-[#F7F8F8]">
                <h3 className="text-[#555A60] mb-3">{t('orderDetail.selectJobToAdd')}</h3>
                <div className="relative mb-3">
                  <Search 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C8085]" 
                    size={18}
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    placeholder={t('orderDetail.searchJobsPlaceholder')}
                    value={jobSearchQuery}
                    onChange={(e) => setJobSearchQuery(e.target.value)}
                    className="pl-10"
                    aria-label={t('orderDetail.searchJobsLabel')}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {filteredJobs.length === 0 ? (
                    <div className="col-span-2 text-center py-4 text-[#7C8085]">
                      {jobSearchQuery.trim() ? t('orderDetail.noJobsFound') : t('orderDetail.startTypingToSearch')}
                    </div>
                  ) : (
                    filteredJobs.map(job => (
                      <button
                        key={job.id}
                        onClick={() => {
                          handleAddJob(job.id);
                          setShowJobPicker(false);
                          setJobSearchQuery('');
                        }}
                        className="p-3 bg-white rounded-lg border border-[#E4E7E7] hover:border-[#1F744F] transition-colors text-left cursor-pointer"
                      >
                        <p className="text-[#1E2025] mb-1">{job.name}</p>
                        <p className="text-[#1F744F]">
                          {formatCurrency(job.unitPrice)} / {job.unitOfMeasure}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            
            {/* Preset Picker */}
            {showPresetPicker && (
              <div className="px-6 py-4 border-b border-[#E4E7E7] bg-[#F7F8F8]">
                <h3 className="text-[#555A60] mb-3">{t('orderDetail.selectPresetToAdd')}</h3>
                <div className="relative mb-3">
                  <Search 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C8085]" 
                    size={18}
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    placeholder={t('orderDetail.searchPresetsPlaceholder')}
                    value={presetSearchQuery}
                    onChange={(e) => setPresetSearchQuery(e.target.value)}
                    className="pl-10"
                    aria-label={t('orderDetail.searchPresetsLabel')}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {filteredPresets.length === 0 ? (
                    <div className="col-span-2 text-center py-4 text-[#7C8085]">
                      {presetSearchQuery.trim() ? t('orderDetail.noPresetsFound') : t('orderDetail.noPresetsAvailable')}
                    </div>
                  ) : (
                    filteredPresets.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          handleAddPreset(preset.id);
                          setShowPresetPicker(false);
                          setPresetSearchQuery('');
                        }}
                        className="p-3 bg-white rounded-lg border border-[#E4E7E7] hover:border-[#1F744F] transition-colors text-left"
                      >
                        <p className="text-[#1E2025] mb-1">{preset.name}</p>
                        <p className="text-[#7C8085] mb-1 line-clamp-2">{preset.description}</p>
                        <p className="text-[#555A60]">{preset.jobs.length} {t('orderDetail.jobsCount')}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            
            {/* Line Items Table/Card */}
            {!formData.jobs || formData.jobs.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-[#7C8085] mb-4">{t('orderDetail.noLineItems')}</p>
                <p className="text-[#7C8085]">{t('orderDetail.noLineItemsDescription')}</p>
              </div>
            ) : jobsView === 'card' ? (
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {formData.jobs.map(job => {
                    const lineTotal = calculateLineTotal(job);
                    
                    return (
                      <div
                        key={job.id}
                        className="bg-[#F7F8F8] rounded-lg border border-[#E4E7E7] p-4"
                      >
                        <div className="mb-3">
                          <div className="flex-1 min-w-0">
                            {editingJobId === job.id || !job.jobName ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingJobId === job.id ? editingJobName : (job.jobName || '')}
                                  onChange={(e) => {
                                    if (editingJobId === job.id) {
                                      setEditingJobName(e.target.value);
                                    } else {
                                      handleUpdateJob(job.id, { jobName: e.target.value });
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      if (editingJobId === job.id) {
                                        handleSaveJobName(job.id);
                                      }
                                    } else if (e.key === 'Escape') {
                                      if (editingJobId === job.id) {
                                        setEditingJobName('');
                                      }
                                    }
                                  }}
                                  onBlur={() => {
                                    if (editingJobId === job.id) {
                                      handleSaveJobName(job.id);
                                    }
                                  }}
                                  className="flex-1 min-w-[200px]"
                                  autoFocus={!job.jobName || editingJobId === job.id}
                                  placeholder={t('orderDetail.jobNamePlaceholder') || 'Enter job name...'}
                                />
                                <button
                                  onClick={() => {
                                    if (editingJobId === job.id) {
                                      handleSaveJobName(job.id);
                                    }
                                  }}
                                  className="p-1 text-[#7C8085] hover:text-[#1F744F] hover:bg-white rounded transition-all cursor-pointer"
                                  aria-label="Save"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onMouseDown={(e) => {
                                    // Prevent input from losing focus when clicking erase button
                                    e.preventDefault();
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (editingJobId === job.id) {
                                      // Clear the input text but keep edit mode active
                                      setEditingJobName('');
                                      // Focus the input after clearing
                                      const input = e.currentTarget.parentElement?.querySelector('input');
                                      if (input) {
                                        setTimeout(() => (input as HTMLInputElement).focus(), 0);
                                      }
                                    } else {
                                      // Clear the job name when not in edit mode
                                      handleUpdateJob(job.id, { jobName: '' });
                                    }
                                  }}
                                  className="p-1 text-[#7C8085] hover:text-[#E5484D] hover:bg-white rounded transition-all cursor-pointer"
                                  aria-label={t('orderDetail.clearJobName') || 'Clear job name'}
                                  type="button"
                                >
                                  <Eraser size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group min-w-0">
                                <p 
                                  className="text-[#1E2025] cursor-pointer hover:text-[#1F744F] transition-colors truncate flex-1 min-w-0"
                                  onClick={() => handleStartEditJobName(job.id)}
                                  title={job.jobName}
                                >
                                  {job.jobName}
                                </p>
                                <button
                                  onClick={() => handleStartEditJobName(job.id)}
                                  className="p-1 opacity-0 group-hover:opacity-100 text-[#7C8085] hover:text-[#1F744F] hover:bg-white rounded transition-all cursor-pointer"
                                  aria-label={t('orderDetail.editJobName')}
                                >
                                  <Edit2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-[#7C8085]">{t('orderDetail.qty')}</Label>
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                value={job.quantity}
                                onChange={(e) => handleUpdateJob(job.id, { 
                                  quantity: parseInt(e.target.value, 10) || 0 
                                })}
                                onWheel={(e) => e.currentTarget.blur()}
                                className="w-full"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-[#7C8085]">{t('orderDetail.unitPrice')}</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={focusedPriceInputs.has(job.id) 
                                  ? (job.unitPrice === 0 ? '' : job.unitPrice.toString()) 
                                  : (job.unitPrice === 0 ? '' : formatNumber(job.unitPrice))
                                }
                                onChange={(e) => {
                                  const parsed = parseFormattedNumber(e.target.value);
                                  handleUpdateJob(job.id, { unitPrice: parsed });
                                }}
                                onFocus={() => handlePriceFocus(job.id)}
                                onBlur={(e) => handlePriceBlur(job.id, e.target.value)}
                                className="w-full"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-[#7C8085]">{t('orderDetail.markup')}</Label>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={job.lineMarkup}
                              onChange={(e) => handleUpdateJob(job.id, { 
                                lineMarkup: parseFloat(e.target.value) || 0 
                              })}
                              onWheel={(e) => e.currentTarget.blur()}
                              className="w-full"
                            />
                          </div>
                          <div className="pt-2 border-t border-[#E4E7E7]">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm text-[#7C8085]">{t('orderDetail.lineTotal')}</span>
                              <span className="text-[#1E2025] font-semibold">{formatCurrency(lineTotal)}</span>
                            </div>
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => handleDuplicateJob(job.id)}
                                className="p-2 text-[#555A60] hover:bg-white rounded-lg transition-colors cursor-pointer"
                                aria-label={`Duplicate ${job.jobName}`}
                              >
                                <Copy size={16} />
                              </button>
                              <button
                                onClick={() => handleRemoveJob(job.id)}
                                className="p-2 text-[#E5484D] hover:bg-white rounded-lg transition-colors cursor-pointer"
                                aria-label={`Remove ${job.jobName}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <div className="overflow-x-auto relative">
                  <div 
                    className="absolute right-[120px] top-0 bottom-0 w-12 pointer-events-none z-20"
                    style={{
                      background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,1) 100%)'
                    }}
                  />
                  <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th className="w-10 px-2 py-3 border-b border-[#E4E7E7]"></th>
                        <th 
                          className={`px-6 py-3 text-left text-[#555A60] border-b border-[#E4E7E7] border-r relative select-none cursor-col-resize overflow-hidden group ${isResizing ? 'bg-[#F7F8F8]' : ''}`}
                          style={{ 
                            width: `${jobColumnWidth}px`, 
                            minWidth: `${jobColumnWidth}px`, 
                            maxWidth: `${jobColumnWidth}px`,
                            borderRightColor: isResizing ? '#1F744F' : '#D2D6D6',
                            borderRightWidth: isResizing ? '2px' : '1px'
                          }}
                          onMouseDown={handleResizeStart}
                          onMouseEnter={(e) => {
                            if (!isResizing) {
                              e.currentTarget.style.borderRightColor = '#1F744F';
                              e.currentTarget.style.borderRightWidth = '2px';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isResizing) {
                              e.currentTarget.style.borderRightColor = '#D2D6D6';
                              e.currentTarget.style.borderRightWidth = '1px';
                            }
                          }}
                          title="Drag right edge to resize"
                        >
                          {t('orderDetail.job')}
                        </th>
                      <th className="px-6 py-3 text-left text-[#555A60] border-b border-[#E4E7E7]">{t('orderDetail.qty')}</th>
                      <th className="px-6 py-3 text-left text-[#555A60] border-b border-[#E4E7E7]">{t('orderDetail.unitPrice')}</th>
                      <th className="px-6 py-3 text-left text-[#555A60] border-b border-[#E4E7E7]">
                        <Popover open={showMarkupPopover} onOpenChange={setShowMarkupPopover}>
                          <PopoverTrigger asChild>
                            <button
                              className="w-full text-left hover:text-[#1F744F] transition-colors cursor-pointer"
                              onClick={() => {
                                setMarkupPopoverValue((formData.globalMarkup || 0).toString());
                              }}
                            >
                              {t('orderDetail.markup')}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80" align="start">
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="globalMarkupInput">{t('orderDetail.globalMarkup')}</Label>
                                <Input
                                  id="globalMarkupInput"
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={markupPopoverValue}
                                  onChange={(e) => setMarkupPopoverValue(e.target.value)}
                                  onWheel={(e) => e.currentTarget.blur()}
                                  autoFocus
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setShowMarkupPopover(false);
                                    setMarkupPopoverValue('');
                                  }}
                                >
                                  {t('common.cancel') || 'Cancel'}
                                </Button>
                                <Button
                                  onClick={() => {
                                    const markupValue = parseFloat(markupPopoverValue) || 0;
                                    handleApplyGlobalMarkup(markupValue);
                                  }}
                                  disabled={!formData.jobs || formData.jobs.length === 0}
                                >
                                  {t('orderDetail.applyToAllJobs')}
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </th>
                      <th className="px-6 py-3 text-right text-[#555A60] border-b border-[#E4E7E7]">{t('orderDetail.lineTotal')}</th>
                      <th 
                        className="px-6 py-3 text-right text-[#555A60] border-b border-[#E4E7E7] sticky right-0 z-10 bg-white"
                        style={{ 
                          position: 'sticky', 
                          right: 0, 
                          zIndex: 10, 
                          minWidth: '120px',
                          background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
                        }}
                      >
                        {t('orderDetail.actions')}
                      </th>
                      </tr>
                    </thead>
                    <SortableContext items={formData.jobs.map(j => j.id)} strategy={verticalListSortingStrategy}>
                      <tbody>
                        {formData.jobs.map(job => {
                          const lineTotal = calculateLineTotal(job);
                          const isSubcategory = job.type === 'subcategory';
                          
                          // Render subcategory row
                          if (isSubcategory) {
                            return (
                              <SortableRow key={job.id} id={job.id} isSubcategory>
                                <td 
                                  className="px-6 py-3 border-b border-[#E4E7E7] border-r border-[#D2D6D6] bg-[#F0F4F8] overflow-hidden"
                                  style={{ width: `${jobColumnWidth}px`, minWidth: `${jobColumnWidth}px`, maxWidth: `${jobColumnWidth}px` }}
                                >
                                  {editingJobId === job.id || !job.jobName ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={editingJobId === job.id ? editingJobName : (job.jobName || '')}
                                        onChange={(e) => {
                                          if (editingJobId === job.id) {
                                            setEditingJobName(e.target.value);
                                          } else {
                                            handleUpdateJob(job.id, { jobName: e.target.value });
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleSaveJobName(job.id);
                                          } else if (e.key === 'Escape') {
                                            setEditingJobName('');
                                            e.currentTarget.focus();
                                          }
                                        }}
                                        onBlur={() => {
                                          if (editingJobId === job.id) {
                                            handleSaveJobName(job.id);
                                          }
                                        }}
                                        className="flex-1 font-semibold bg-white min-w-[200px]"
                                        autoFocus={!job.jobName || editingJobId === job.id}
                                        placeholder={t('orderDetail.subcategoryNamePlaceholder') || 'Enter subcategory name...'}
                                      />
                                      <button
                                        onClick={() => handleSaveJobName(job.id)}
                                        className="p-1 text-[#7C8085] hover:text-[#1F744F] hover:bg-white rounded transition-all cursor-pointer"
                                        aria-label="Save"
                                      >
                                        <Check size={16} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 group min-w-0">
                                      <p 
                                        className="text-[#1E2025] font-semibold cursor-pointer hover:text-[#1F744F] transition-colors whitespace-nowrap truncate flex-1 min-w-0"
                                        onClick={() => handleStartEditJobName(job.id)}
                                        title={job.jobName}
                                      >
                                        {job.jobName}
                                      </p>
                                      <button
                                        onClick={() => handleStartEditJobName(job.id)}
                                        className="p-1 opacity-0 group-hover:opacity-100 text-[#7C8085] hover:text-[#1F744F] hover:bg-white rounded transition-all cursor-pointer"
                                        aria-label={t('orderDetail.editSubcategoryName') || 'Edit subcategory name'}
                                      >
                                        <Edit2 size={14} />
                                      </button>
                                    </div>
                                  )}
                                </td>
                                {/* Empty cells for qty, price, markup, total - maintaining column structure */}
                                <td className="px-6 py-3 border-b border-[#E4E7E7] bg-[#F0F4F8]"></td>
                                <td className="px-6 py-3 border-b border-[#E4E7E7] bg-[#F0F4F8]"></td>
                                <td className="px-6 py-3 border-b border-[#E4E7E7] bg-[#F0F4F8]"></td>
                                <td className="px-6 py-3 border-b border-[#E4E7E7] bg-[#F0F4F8]"></td>
                                <td 
                                  className="px-6 py-3 text-right border-b border-[#E4E7E7] sticky right-0 z-10 bg-[#F0F4F8]"
                                  style={{ position: 'sticky', right: 0, zIndex: 10, minWidth: '120px' }}
                                >
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      onClick={() => handleRemoveJob(job.id)}
                                      className="p-2 text-[#E5484D] hover:bg-white rounded-lg transition-colors cursor-pointer"
                                      aria-label={`Remove ${job.jobName}`}
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </SortableRow>
                            );
                          }
                          
                          // Render regular job row
                          return (
                            <SortableRow key={job.id} id={job.id}>
                              <td 
                                className="px-6 py-4 border-b border-[#E4E7E7] border-r border-[#D2D6D6] overflow-hidden"
                                style={{ width: `${jobColumnWidth}px`, minWidth: `${jobColumnWidth}px`, maxWidth: `${jobColumnWidth}px` }}
                              >
                            {editingJobId === job.id || !job.jobName ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingJobId === job.id ? editingJobName : (job.jobName || '')}
                                  onChange={(e) => {
                                    if (editingJobId === job.id) {
                                      setEditingJobName(e.target.value);
                                    } else {
                                      handleUpdateJob(job.id, { jobName: e.target.value });
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      if (editingJobId === job.id) {
                                        handleSaveJobName(job.id);
                                      } else if (job.jobName) {
                                        // If job has a name, exit edit mode
                                        setEditingJobId(null);
                                        setEditingJobName('');
                                      }
                                    } else if (e.key === 'Escape') {
                                      if (editingJobId === job.id) {
                                        // Clear the input text on Escape but keep edit mode active
                                        setEditingJobName('');
                                        e.currentTarget.focus();
                                      } else {
                                        // Clear the job name
                                        handleUpdateJob(job.id, { jobName: '' });
                                      }
                                    }
                                  }}
                                  onBlur={() => {
                                    if (editingJobId === job.id) {
                                      handleSaveJobName(job.id);
                                    } else if (!job.jobName) {
                                      // If job name is still empty after blur, keep it in edit mode
                                      // Don't do anything, let it stay in edit mode
                                    }
                                  }}
                                  className="flex-1 min-w-[200px]"
                                  autoFocus={!job.jobName || editingJobId === job.id}
                                  placeholder={t('orderDetail.jobNamePlaceholder') || 'Enter job name...'}
                                />
                                <button
                                  onClick={() => {
                                    if (editingJobId === job.id) {
                                      handleSaveJobName(job.id);
                                    } else if (job.jobName) {
                                      // Exit edit mode if job has a name
                                      setEditingJobId(null);
                                      setEditingJobName('');
                                    }
                                  }}
                                  className="p-1 text-[#7C8085] hover:text-[#1F744F] hover:bg-[#F7F8F8] rounded transition-all cursor-pointer"
                                  aria-label="Save"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onMouseDown={(e) => {
                                    // Prevent input from losing focus when clicking erase button
                                    e.preventDefault();
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (editingJobId === job.id) {
                                      // Clear the input text but keep edit mode active
                                      setEditingJobName('');
                                      // Focus the input after clearing
                                      const input = e.currentTarget.parentElement?.querySelector('input');
                                      if (input) {
                                        setTimeout(() => (input as HTMLInputElement).focus(), 0);
                                      }
                                    } else {
                                      // Clear the job name when not in edit mode
                                      handleUpdateJob(job.id, { jobName: '' });
                                    }
                                  }}
                                  className="p-1 text-[#7C8085] hover:text-[#E5484D] hover:bg-[#F7F8F8] rounded transition-all cursor-pointer"
                                  aria-label={t('orderDetail.clearJobName') || 'Clear job name'}
                                  type="button"
                                >
                                  <Eraser size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group min-w-0">
                                <p 
                                  className="text-[#1E2025] cursor-pointer hover:text-[#1F744F] transition-colors whitespace-nowrap truncate flex-1 min-w-0"
                                  onClick={() => handleStartEditJobName(job.id)}
                                  title={job.jobName}
                                >
                                  {job.jobName}
                                </p>
                                <button
                                  onClick={() => handleStartEditJobName(job.id)}
                                  className="p-1 opacity-0 group-hover:opacity-100 text-[#7C8085] hover:text-[#1F744F] hover:bg-[#F7F8F8] rounded transition-all cursor-pointer"
                                  aria-label={t('orderDetail.editJobName')}
                                >
                                  <Edit2 size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 border-b border-[#E4E7E7]">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={job.quantity}
                              onChange={(e) => handleUpdateJob(job.id, { 
                                quantity: parseInt(e.target.value, 10) || 0 
                              })}
                              onWheel={(e) => e.currentTarget.blur()}
                              onKeyDown={(e) => {
                                // Prevent decimal point and 'e', 'E', '+', '-' keys
                                if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                                  e.preventDefault();
                                }
                              }}
                              className="w-20"
                              aria-label={`Quantity for ${job.jobName}`}
                            />
                          </td>
                          <td className="px-6 py-4 border-b border-[#E4E7E7]">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={focusedPriceInputs.has(job.id) 
                                ? (job.unitPrice === 0 ? '' : job.unitPrice.toString()) 
                                : (job.unitPrice === 0 ? '' : formatNumber(job.unitPrice))
                              }
                              onChange={(e) => {
                                const parsed = parseFormattedNumber(e.target.value);
                                handleUpdateJob(job.id, { unitPrice: parsed });
                              }}
                              onFocus={() => handlePriceFocus(job.id)}
                              onBlur={(e) => handlePriceBlur(job.id, e.target.value)}
                              className="w-28"
                              aria-label={`Unit price for ${job.jobName}`}
                            />
                          </td>
                          <td className="px-6 py-4 border-b border-[#E4E7E7]">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={job.lineMarkup}
                              onChange={(e) => handleUpdateJob(job.id, { 
                                lineMarkup: parseFloat(e.target.value) || 0 
                              })}
                              onWheel={(e) => e.currentTarget.blur()}
                              className="w-20"
                              aria-label={`Markup for ${job.jobName}`}
                            />
                          </td>
                          <td className="px-6 py-4 text-right border-b border-[#E4E7E7]">
                            <p className="text-[#1E2025]">{formatCurrency(lineTotal)}</p>
                          </td>
                          <td 
                            className="px-6 py-4 text-right border-b border-[#E4E7E7] sticky right-0 z-10 bg-white"
                            data-sticky="true"
                            style={{ 
                              position: 'sticky', 
                              right: 0, 
                              zIndex: 10, 
                              minWidth: '120px',
                              background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
                            }}
                          >
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleDuplicateJob(job.id)}
                                  className="p-2 text-[#555A60] hover:bg-[#F7F8F8] rounded-lg transition-colors cursor-pointer"
                                  aria-label={`Duplicate ${job.jobName}`}
                                >
                                  <Copy size={18} />
                                </button>
                                <button
                                  onClick={() => handleRemoveJob(job.id)}
                                  className="p-2 text-[#E5484D] hover:bg-[#FEE] rounded-lg transition-colors cursor-pointer"
                                  aria-label={`Remove ${job.jobName}`}
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </SortableRow>
                        );
                      })}
                      </tbody>
                    </SortableContext>
                  </table>
                </div>
              </DndContext>
            )}
          </div>
      </div>
      
      {/* Document Generation Confirmation Dialog */}
      <AlertDialog open={showDocumentDialog} onOpenChange={setShowDocumentDialog}>
        <AlertDialogContent className="bg-white border border-[#E4E7E7]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E2025]">
              {t('orderDetail.unsavedOrderTitle') || 'Order Not Saved'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#555A60]">
              {t('orderDetail.unsavedOrderWarning') || 'This order has not been saved yet. Would you like to save it before generating the document?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel
              onClick={handleCancelDocumentDialog}
              className="bg-[#E4E7E7] text-[#1E2025] hover:bg-[#D2D6D6] m-0"
            >
              {t('common.cancel') || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateDocumentAnyway}
              className="bg-[#E4E7E7] text-[#1E2025] hover:bg-[#D2D6D6] m-0"
            >
              {t('orderDetail.createWithoutSaving') || 'Create Anyway'}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={handleSaveAndCreateDocument}
              className="bg-[#1F744F] text-white hover:bg-[#165B3C] m-0"
            >
              {t('orderDetail.saveAndCreate') || 'Save and Create'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Order Confirmation Dialog */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent className="bg-white border border-[#E4E7E7]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E2025]">
              {hasUnsavedChanges 
                ? (t('orderDetail.unsavedChangesTitle') || 'Unsaved Changes')
                : (t('orderDetail.duplicateOrderTitle') || 'Duplicate Order')
              }
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#555A60]">
              {hasUnsavedChanges 
                ? (t('orderDetail.duplicateUnsavedWarning') || 'You have unsaved changes. The duplicate will be created from the last saved version. Your unsaved changes will not be included in the duplicate.')
                : (t('orderDetail.duplicateConfirmation') || 'Are you sure you want to create a copy of this order? The duplicate will be created with status "Proposal".')
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel
              onClick={() => setShowDuplicateDialog(false)}
              className="bg-[#E4E7E7] text-[#1E2025] hover:bg-[#D2D6D6] m-0"
            >
              {t('common.cancel') || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={performDuplicateOrder}
              className="bg-[#1F744F] text-white hover:bg-[#165B3C] m-0"
            >
              {t('orderDetail.duplicate') || 'Duplicate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
