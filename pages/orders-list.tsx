// Orders list page - browse and manage all orders
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useApp } from '../lib/app-context';
import { useFormatting } from '../lib/use-formatting';
import { StatusPill } from '../components/status-pill';
import { calculateOrderTotal, getOrderTotals, extractIdNumbers } from '../lib/utils';
import { logger } from '../lib/logger';
import { Search, Plus, Filter, Columns, X as XIcon, GripVertical, ArrowUpDown, ArrowUp, ArrowDown, Table, LayoutGrid } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui/sheet';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { PaginationWithLinks } from '../components/ui/pagination-with-links';
import { DateRangePicker } from '../components/date-range-picker';
import { useIsMobile } from '../components/ui/use-mobile';
import type { OrderStatus } from '../lib/types';

interface OrdersListProps {
  onNavigate: (page: string, id?: string) => void;
  pageId?: string;
}

type ColumnKey = 'orderId' | 'client' | 'date' | 'status' | 'jobs' | 'total' | 'subtotal' | 'orderType' | 'orderTitle' | 'timeEstimate';

export function OrdersList({ onNavigate, pageId }: OrdersListProps) {
  const { t } = useTranslation();
  const { formatCurrency, formatDate } = useFormatting();
  const { orders, clients, loading, ensureOrderJobsLoaded } = useApp();
  
  // Parse filters from pageId query string (e.g., "?client=client-10328&status=in-progress")
  const parseQueryParams = (queryString: string | undefined) => {
    if (!queryString || !queryString.includes('?')) return { client: null, status: null };
    
    const params = new URLSearchParams(queryString.split('?')[1]);
    return {
      client: params.get('client'),
      status: params.get('status') as OrderStatus | 'all' | null,
    };
  };
  
  const queryParams = parseQueryParams(pageId);
  const clientFilterId = queryParams.client || null;
  const initialStatusFilter = queryParams.status || null;
  
  // Get the filtered client
  const filteredClient = clientFilterId ? clients.find(c => c.id === clientFilterId) : null;
  
  // Show loading if explicitly loading OR if we have no data yet (initial load)
  const isLoading = loading || (orders.length === 0 && clients.length === 0);
  
  // localStorage keys
  const STORAGE_KEY_PREFIX = 'orders-table-';
  const STORAGE_KEYS = {
    filters: `${STORAGE_KEY_PREFIX}filters`,
    visibleColumns: `${STORAGE_KEY_PREFIX}visibleColumns`,
    columnOrder: `${STORAGE_KEY_PREFIX}columnOrder`,
    itemsPerPage: `${STORAGE_KEY_PREFIX}itemsPerPage`,
    sortBy: `${STORAGE_KEY_PREFIX}sortBy`,
    sortDirection: `${STORAGE_KEY_PREFIX}sortDirection`,
    view: `${STORAGE_KEY_PREFIX}view`,
  };
  
  // Default values
  const defaultVisibleColumns: Record<ColumnKey, boolean> = {
    orderId: true,
    client: false,
    date: true,
    status: true,
    jobs: true,
    total: true,
    subtotal: false,
    orderType: false,
    orderTitle: true,
    timeEstimate: false,
  };
  
  const defaultColumnOrder: ColumnKey[] = [
    'orderId',
    'orderTitle',
    'client',
    'date',
    'status',
    'jobs',
    'total',
    'subtotal',
    'orderType',
    'timeEstimate',
  ];
  
  // Load from localStorage on mount
  const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  };
  
  // Save to localStorage
  const saveToStorage = (key: string, value: any) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      logger.warn('Failed to save to localStorage', error);
    }
  };
  
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter states - load from localStorage or initial query param
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>(() => {
    // If status is provided in URL, use it (don't override with localStorage)
    if (initialStatusFilter) {
      return initialStatusFilter === 'all' ? 'all' : (initialStatusFilter as OrderStatus);
    }
    const stored = loadFromStorage<{ statusFilter?: OrderStatus | 'all'; dateStart?: string; dateEnd?: string }>(STORAGE_KEYS.filters, {});
    return stored.statusFilter || 'all';
  });
  const [dateStart, setDateStart] = useState<Date | null>(() => {
    const stored = loadFromStorage<{ statusFilter?: OrderStatus | 'all'; dateStart?: string; dateEnd?: string }>(STORAGE_KEYS.filters, {});
    return stored.dateStart ? new Date(stored.dateStart) : null;
  });
  const [dateEnd, setDateEnd] = useState<Date | null>(() => {
    const stored = loadFromStorage<{ statusFilter?: OrderStatus | 'all'; dateStart?: string; dateEnd?: string }>(STORAGE_KEYS.filters, {});
    return stored.dateEnd ? new Date(stored.dateEnd) : null;
  });
  
  // Column visibility state - load from localStorage and merge with defaults to include new columns
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    const stored = loadFromStorage<Record<ColumnKey, boolean>>(STORAGE_KEYS.visibleColumns, defaultVisibleColumns);
    // Merge stored visibility with defaults to ensure new columns are included
    return { ...defaultVisibleColumns, ...stored };
  });
  
  // Column order state - load from localStorage and merge with defaults to include new columns
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => {
    const stored = loadFromStorage<ColumnKey[]>(STORAGE_KEYS.columnOrder, defaultColumnOrder);
    // Merge stored order with defaults to ensure new columns are included
    const mergedOrder = [...stored];
    defaultColumnOrder.forEach((col) => {
      if (!mergedOrder.includes(col)) {
        mergedOrder.push(col);
      }
    });
    return mergedOrder;
  });
  
  // Panel states
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Drag and drop state
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | null>(null);
  
  // Hover state for sort indicators
  const [hoveredHeader, setHoveredHeader] = useState<ColumnKey | 'createdAt' | null>(null);
  
  // Pagination state - load from localStorage
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() =>
    loadFromStorage(STORAGE_KEYS.itemsPerPage, 10)
  );
  
  // Sorting state - load from localStorage
  const [sortBy, setSortBy] = useState<ColumnKey | 'createdAt'>(() =>
    loadFromStorage(STORAGE_KEYS.sortBy, 'createdAt')
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() =>
    loadFromStorage(STORAGE_KEYS.sortDirection, 'desc')
  );
  
  // View state - load from localStorage, default to card on mobile
  const isMobile = useIsMobile();
  const [view, setView] = useState<'table' | 'card'>(() => {
    const stored = loadFromStorage(STORAGE_KEYS.view, null);
    // Auto-switch to card on mobile if no preference stored
    if (stored === null && isMobile) return 'card';
    return stored || 'table';
  });
  
  // Auto-switch to card view on mobile
  useEffect(() => {
    if (isMobile && view === 'table') {
      setView('card');
    }
  }, [isMobile]);
  
  // Save view preference to localStorage
  useEffect(() => {
    if (!isMobile) {
      saveToStorage(STORAGE_KEYS.view, view);
    }
  }, [view, isMobile]);
  
  // Save filters to localStorage when they change
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.filters, { 
      statusFilter, 
      dateStart: dateStart?.toISOString() || undefined,
      dateEnd: dateEnd?.toISOString() || undefined
    });
  }, [statusFilter, dateStart, dateEnd]);
  
  // Save column settings to localStorage when they change
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.visibleColumns, visibleColumns);
  }, [visibleColumns]);
  
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.columnOrder, columnOrder);
  }, [columnOrder]);
  
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.itemsPerPage, itemsPerPage);
  }, [itemsPerPage]);
  
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.sortBy, sortBy);
  }, [sortBy]);
  
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.sortDirection, sortDirection);
  }, [sortDirection]);
  
  // Check if filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(statusFilter !== 'all' || dateStart || dateEnd);
  }, [statusFilter, dateStart, dateEnd]);
  
  // Check if customizations are active (different from defaults)
  const hasActiveCustomizations = useMemo(() => {
    const hasCustomColumns = JSON.stringify(visibleColumns) !== JSON.stringify(defaultVisibleColumns);
    const hasCustomOrder = JSON.stringify(columnOrder) !== JSON.stringify(defaultColumnOrder);
    const hasCustomItemsPerPage = itemsPerPage !== 10;
    const hasCustomSort = sortBy !== 'createdAt' || sortDirection !== 'desc';
    return hasCustomColumns || hasCustomOrder || hasCustomItemsPerPage || hasCustomSort;
  }, [visibleColumns, columnOrder, itemsPerPage, sortBy, sortDirection]);
  
  // Reset filters function
  const resetFilters = () => {
    setStatusFilter('all');
    setDateStart(null);
    setDateEnd(null);
    setCurrentPage(1);
  };
  
  // Reset customizations function
  const resetCustomizations = () => {
    setVisibleColumns(defaultVisibleColumns);
    setColumnOrder(defaultColumnOrder);
    setItemsPerPage(10);
    setSortBy('createdAt');
    setSortDirection('desc');
    setCurrentPage(1);
  };
  
  const filteredOrders = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return orders.filter(order => {
      const client = clients.find(c => c.id === order.clientId);
      const matchesSearch = 
        order.id.toLowerCase().includes(query) ||
        client?.name.toLowerCase().includes(query) ||
        client?.company.toLowerCase().includes(query) ||
        order.orderType.toLowerCase().includes(query) ||
        order.orderTitle.toLowerCase().includes(query);
      
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      
      // Client filter
      const matchesClient = !clientFilterId || order.clientId === clientFilterId;
      
      // Date filter
      let matchesDate = true;
      if (dateStart || dateEnd) {
        const orderDate = new Date(order.createdAt);
        if (dateStart) {
          const fromDate = new Date(dateStart);
          fromDate.setHours(0, 0, 0, 0);
          if (orderDate < fromDate) matchesDate = false;
        }
        if (dateEnd) {
          const toDate = new Date(dateEnd);
          toDate.setHours(23, 59, 59, 999);
          if (orderDate > toDate) matchesDate = false;
        }
      }
      
      return matchesSearch && matchesStatus && matchesDate && matchesClient;
    }).sort((a, b) => {
      let comparison = 0;
      const clientA = clients.find(c => c.id === a.clientId);
      const clientB = clients.find(c => c.id === b.clientId);
      const { total: totalA, subtotal: subtotalA } = getOrderTotals(a);
      const { total: totalB, subtotal: subtotalB } = getOrderTotals(b);
      
      switch (sortBy) {
        case 'orderId':
          comparison = a.id.localeCompare(b.id);
          break;
        case 'client':
          const nameA = clientA?.name || '';
          const nameB = clientB?.name || '';
          comparison = nameA.localeCompare(nameB);
          break;
        case 'date':
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'jobs':
          comparison = a.jobs.length - b.jobs.length;
          break;
        case 'total':
          comparison = totalA - totalB;
          break;
        case 'subtotal':
          comparison = subtotalA - subtotalB;
          break;
        case 'orderTitle':
          comparison = (a.orderTitle || '').localeCompare(b.orderTitle || '');
          break;
        case 'orderType':
          comparison = a.orderType.localeCompare(b.orderType);
          break;
        case 'timeEstimate':
          const timeA = a.timeEstimate ?? 0;
          const timeB = b.timeEstimate ?? 0;
          comparison = timeA - timeB;
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [orders, clients, searchQuery, statusFilter, dateStart, dateEnd, sortBy, sortDirection, clientFilterId]);
  
  // Pagination calculations
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);
  
  // Reset to page 1 when filters, itemsPerPage, or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateStart, dateEnd, itemsPerPage, sortBy, sortDirection]);

  // Ensure jobs are loaded for visible orders (on-demand loading)
  useEffect(() => {
    if (!loading && paginatedOrders.length > 0) {
      const visibleOrderIds = paginatedOrders.map(o => o.id);
      ensureOrderJobsLoaded(visibleOrderIds).catch(error => {
        logger.error('Error ensuring order jobs are loaded', error);
      });
    }
  }, [paginatedOrders, loading, ensureOrderJobsLoaded]);
  
  // Get ordered visible columns
  const orderedVisibleColumns = useMemo(() => {
    return columnOrder.filter(key => visibleColumns[key]);
  }, [columnOrder, visibleColumns]);
  
  // Drag and drop handlers
  const handleDragStart = (columnKey: ColumnKey) => {
    setDraggedColumn(columnKey);
  };
  
  const handleDragOver = (e: React.DragEvent, targetColumn: ColumnKey) => {
    e.preventDefault();
    if (draggedColumn === null || draggedColumn === targetColumn) return;
    
    setDragOverColumn(targetColumn);
  };
  
  const handleDrop = (e: React.DragEvent, targetColumn: ColumnKey) => {
    e.preventDefault();
    if (draggedColumn === null || draggedColumn === targetColumn) {
      setDraggedColumn(null);
      setDragOverColumn(null);
      return;
    }
    
    const draggedIndex = columnOrder.indexOf(draggedColumn);
    const targetIndex = columnOrder.indexOf(targetColumn);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedColumn(null);
      setDragOverColumn(null);
      return;
    }
    
    const newOrder = [...columnOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedColumn);
    setColumnOrder(newOrder);
    setDraggedColumn(null);
    setDragOverColumn(null);
  };
  
  const handleDragEnd = () => {
    setDraggedColumn(null);
    setDragOverColumn(null);
  };
  
  // Column label mapping
  const columnLabels: Record<ColumnKey, string> = {
    orderId: t('orders.orderId'),
    client: t('orders.client'),
    date: t('orders.date'),
    status: t('orders.status'),
    jobs: t('orders.jobs'),
    total: t('orders.total'),
    subtotal: t('orders.subtotal'),
    orderType: t('orders.orderType'),
    orderTitle: t('orders.orderTitle'),
    timeEstimate: t('orderDetail.timeEstimate'),
  };
  
  // Helper function to render table header
  const renderTableHeader = (columnKey: ColumnKey, index: number) => {
    if (!visibleColumns[columnKey]) return null;
    
    const isRightAlign = columnKey === 'total' || columnKey === 'subtotal';
    const isCenterAlign = columnKey === 'jobs' || columnKey === 'timeEstimate';
    const isFirstColumn = index === 0;
    const isDateColumn = columnKey === 'date';
    const isJobsColumn = columnKey === 'jobs';
    const isStatusColumn = columnKey === 'status';
    const isTimeEstimateColumn = columnKey === 'timeEstimate';
    const hasOpenPanel = filtersOpen || settingsOpen;
    
    // Handle special case: sortBy can be 'createdAt' but columnKey is 'date'
    const isSorted = sortBy === columnKey || (sortBy === 'createdAt' && columnKey === 'date');
    
    const headerStyle: React.CSSProperties = {};
    if (isFirstColumn) {
      headerStyle.position = 'sticky';
      headerStyle.left = 0;
      headerStyle.zIndex = hasOpenPanel ? 0 : 10;
      headerStyle.minWidth = '150px';
    }
    if (isDateColumn) {
      headerStyle.minWidth = '150px';
    }
    if (isJobsColumn) {
      headerStyle.minWidth = '100px';
    }
    if (isStatusColumn) {
      headerStyle.minWidth = '120px';
    }
    if (isTimeEstimateColumn) {
      headerStyle.minWidth = '100px';
    }
    
    const handleSortClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      // Map 'date' column to 'createdAt' for sorting
      const sortKey = columnKey === 'date' ? 'createdAt' : columnKey;
      
      if (isSorted) {
        // Toggle direction if already sorted by this column
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        // Set new sort column with default direction
        setSortBy(sortKey as ColumnKey | 'createdAt');
        setSortDirection('asc');
      }
    };
    
    // Handle special case: hover state for 'date' column should match 'createdAt'
    const hoverKey = columnKey === 'date' ? 'createdAt' : columnKey;
    const isHovered = hoveredHeader === hoverKey;
    
    return (
      <th 
        key={columnKey}
        onClick={handleSortClick}
        onMouseEnter={() => setHoveredHeader(hoverKey as ColumnKey | 'createdAt')}
        onMouseLeave={() => setHoveredHeader(null)}
        className={`px-6 py-3 border-b border-[#E4E7E7] ${
          isRightAlign ? 'text-right' : isCenterAlign ? 'text-center' : 'text-left'
        } text-[#555A60] cursor-pointer hover:bg-[#F7F8F8] transition-colors ${
          isFirstColumn ? 'sticky left-0 z-10' : ''
        }`}
        style={isFirstColumn ? {
          ...headerStyle,
          background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
        } : (Object.keys(headerStyle).length > 0 ? headerStyle : undefined)}
      >
        <div className={`flex items-center gap-2 ${
          isRightAlign ? 'justify-end' : isCenterAlign ? 'justify-center' : ''
        }`}>
          <span>{columnLabels[columnKey]}</span>
          {isSorted ? (
            <span>
              {sortDirection === 'asc' ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </span>
          ) : (
            isHovered && <ArrowUpDown className="h-4 w-4" />
          )}
        </div>
      </th>
    );
  };
  
  // Helper function to render table cell
  const renderTableCell = (columnKey: ColumnKey, order: typeof orders[0], client: typeof clients[0] | undefined, index: number) => {
    if (!visibleColumns[columnKey]) return null;
    
    const { subtotal, total } = getOrderTotals(order);
    const jobCount = order.job_count !== undefined ? order.job_count : order.jobs.length;
    const isRightAlign = columnKey === 'total' || columnKey === 'subtotal';
    const isFirstColumn = index === 0;
    const hasOpenPanel = filtersOpen || settingsOpen;
    
    switch (columnKey) {
      case 'orderId':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isFirstColumn ? 'sticky left-0 z-10' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
            } : undefined}
          >
            <p className="text-[#1E2025]">{extractIdNumbers(order.id)}</p>
          </td>
        );
      case 'client':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isFirstColumn ? 'sticky left-0 z-10' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
            } : undefined}
          >
            <p className="text-[#1E2025]">{client?.company}</p>
            {client?.name && client.name !== 'Unknown' && (
              <p className="text-[#7C8085]">{client.name}</p>
            )}
          </td>
        );
      case 'date':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isFirstColumn ? 'sticky left-0 z-10' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: 10, 
              minWidth: '150px',
              background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
            } : { minWidth: '150px' }}
          >
            <p className="text-[#555A60]">{formatDate(order.createdAt)}</p>
          </td>
        );
      case 'status':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isFirstColumn ? 'sticky left-0 z-10' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
            } : { minWidth: '120px' }}
          >
            <StatusPill status={order.status} />
          </td>
        );
      case 'jobs':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] text-center ${isFirstColumn ? 'sticky left-0 z-10' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
            } : { minWidth: '100px' }}
          >
            {order.job_count === undefined && order.jobs.length === 0 ? (
              <Skeleton className="h-4 w-8 mx-auto" />
            ) : (
              <p className="text-[#555A60] whitespace-nowrap">{jobCount}</p>
            )}
          </td>
        );
      case 'total':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isRightAlign ? 'text-right' : ''} ${isFirstColumn ? 'sticky left-0 z-10' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
            } : undefined}
          >
            {order.total === undefined && order.jobs.length === 0 ? (
              <Skeleton className="h-4 w-20 ml-auto" />
            ) : (
              <p className="text-[#1E2025]">{formatCurrency(total)}</p>
            )}
          </td>
        );
      case 'subtotal':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isRightAlign ? 'text-right' : ''} ${isFirstColumn ? 'sticky left-0 z-10' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
            } : undefined}
          >
            {order.subtotal === undefined && order.jobs.length === 0 ? (
              <Skeleton className="h-4 w-20 ml-auto" />
            ) : (
              <p className="text-[#1E2025]">{formatCurrency(subtotal)}</p>
            )}
          </td>
        );
      case 'orderType':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isFirstColumn ? 'sticky left-0 z-10' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
            } : undefined}
          >
            <p className="text-[#1E2025] line-clamp-2">{order.orderType || '-'}</p>
          </td>
        );
      case 'orderTitle':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isFirstColumn ? 'sticky left-0 z-10' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
            } : undefined}
          >
            <p className="text-[#1E2025] line-clamp-2">{order.orderTitle || '-'}</p>
          </td>
        );
      case 'timeEstimate':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] text-center ${isFirstColumn ? 'sticky left-0 z-10' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
            } : { minWidth: '100px' }}
          >
            <p className="text-[#555A60]">{order.timeEstimate ? `${order.timeEstimate}` : '-'}</p>
          </td>
        );
      default:
        return null;
    }
  };
  
  
  const statusCounts = useMemo(() => {
    return {
      all: orders.length,
      'in-progress': orders.filter(o => o.status === 'in-progress').length,
      completed: orders.filter(o => o.status === 'completed').length,
      canceled: orders.filter(o => o.status === 'canceled').length,
      proposal: orders.filter(o => o.status === 'proposal').length,
    };
  }, [orders]);
  
  // Card view rendering
  const renderCardView = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: Math.min(itemsPerPage, 6) }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#E4E7E7] p-4">
              <Skeleton className="h-5 w-24 mb-2" />
              <Skeleton className="h-4 w-32 mb-4" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      );
    }
    
    if (filteredOrders.length === 0) {
      return null; // Empty state is handled above
    }
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedOrders.map(order => {
          const client = clients.find(c => c.id === order.clientId);
          const { total } = getOrderTotals(order);
          const jobCount = order.job_count !== undefined ? order.job_count : order.jobs.length;
          
          return (
            <button
              key={order.id}
              onClick={() => onNavigate('order-detail', order.id)}
              className="bg-white rounded-xl border border-[#E4E7E7] p-4 hover:border-[#1F744F] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[#1E2025] font-medium mb-1">
                    {t('orders.orderNumberPrefix')}{extractIdNumbers(order.id)}
                  </p>
                  {order.orderTitle && (
                    <p className="text-[#7C8085] text-sm line-clamp-2">{order.orderTitle}</p>
                  )}
                </div>
                <StatusPill status={order.status} />
              </div>
              
              <div className="space-y-2 text-sm">
                {visibleColumns.client && client && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#7C8085]">{t('orders.client')}</span>
                    <span className="text-[#1E2025]">{client.company || client.name}</span>
                  </div>
                )}
                {visibleColumns.date && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#7C8085]">{t('orders.date')}</span>
                    <span className="text-[#1E2025]">{formatDate(order.createdAt)}</span>
                  </div>
                )}
                {visibleColumns.jobs && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#7C8085]">{t('orders.jobs')}</span>
                    <span className="text-[#1E2025]">
                      {order.job_count === undefined && order.jobs.length === 0 ? (
                        <Skeleton className="h-4 w-8 inline-block" />
                      ) : (
                        jobCount
                      )}
                    </span>
                  </div>
                )}
                {visibleColumns.total && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#E4E7E7]">
                    <span className="text-[#7C8085] font-medium">{t('orders.total')}</span>
                    <span className="text-[#1E2025] font-semibold">
                      {order.total === undefined && order.jobs.length === 0 ? (
                        <Skeleton className="h-4 w-20 inline-block" />
                      ) : (
                        formatCurrency(total)
                      )}
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[#1E2025] mb-2">{t('orders.title')}</h1>
          <p className="text-[#555A60]">{t('orders.subtitle')}</p>
        </div>
        <button
          onClick={() => onNavigate('order-detail', 'new')}
          className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus size={20} aria-hidden="true" />
          {t('orders.newOrder')}
        </button>
      </div>
      
      {/* Active Filters Pills */}
      {(filteredClient || statusFilter !== 'all') && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Client Filter Pill */}
          {filteredClient && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#E3F2FD] text-[#1976D2] border border-[#1976D2]/20">
              <span className="text-sm font-medium whitespace-nowrap">
                {t('orders.filteredByClient')}: {filteredClient.company || filteredClient.name || `Client #${extractIdNumbers(filteredClient.id)}`}
              </span>
              <button
                onClick={() => {
                  // Clear client filter, preserve status filter if exists
                  const newPageId = statusFilter !== 'all' ? `?status=${statusFilter}` : undefined;
                  onNavigate('orders', newPageId);
                }}
                className="ml-1 hover:bg-[#1976D2]/10 rounded-full p-0.5 transition-colors cursor-pointer flex-shrink-0"
                aria-label={t('orders.clearClientFilter')}
                type="button"
              >
                <XIcon size={14} />
              </button>
            </div>
          )}
          
          {/* Status Filter Pill */}
          {statusFilter !== 'all' && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#E8F5E9] text-[#1F744F] border border-[#1F744F]/20">
              <span className="text-sm font-medium whitespace-nowrap">
                {t('orders.status')}: {statusFilter === 'in-progress' ? t('orders.inProgress') : statusFilter === 'completed' ? t('orders.completed') : statusFilter === 'proposal' ? t('orders.proposal') : statusFilter === 'canceled' ? t('orders.canceled') : statusFilter}
              </span>
              <button
                onClick={() => {
                  // Clear status filter only, preserve client and date filters if they exist
                  const newPageId = filteredClient ? `?client=${filteredClient.id}` : undefined;
                  setStatusFilter('all');
                  onNavigate('orders', newPageId);
                }}
                className="ml-1 hover:bg-[#1F744F]/10 rounded-full p-0.5 transition-colors cursor-pointer flex-shrink-0"
                aria-label={t('orders.clearStatusFilter') || 'Clear status filter'}
                type="button"
              >
                <XIcon size={14} />
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Search and Action Buttons */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[300px] max-w-md relative">
          <Search 
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C8085]" 
            size={20}
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder={t('orders.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label={t('orders.searchLabel')}
          />
        </div>
        
        <div className="flex gap-2 flex-shrink-0 ml-auto">
          {/* View Switcher */}
          {!isMobile && (
            <div className="flex items-center gap-1 border border-[#E4E7E7] rounded-lg p-1 bg-white">
              <button
                onClick={() => setView('table')}
                className={`p-1.5 rounded transition-colors ${
                  view === 'table'
                    ? 'bg-[#1F744F] text-white'
                    : 'text-[#555A60] hover:bg-[#F7F8F8]'
                }`}
                aria-label={t('orders.tableView') || 'Table view'}
              >
                <Table size={16} />
              </button>
              <button
                onClick={() => setView('card')}
                className={`p-1.5 rounded transition-colors ${
                  view === 'card'
                    ? 'bg-[#1F744F] text-white'
                    : 'text-[#555A60] hover:bg-[#F7F8F8]'
                }`}
                aria-label={t('orders.cardView') || 'Card view'}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          )}
          <Button
            variant="outline"
            onClick={() => setFiltersOpen(true)}
            className="flex items-center gap-2 relative cursor-pointer hover:shadow-sm transition-shadow"
            aria-label={t('orders.filtersTitle')}
          >
            <Filter size={16} />
            {t('orders.filtersTitle')}
            {hasActiveFilters && (
              <span className="text-[#1F744F] font-semibold text-xs leading-none relative -top-1 ml-0.5" aria-label={t('orders.filtersTitle')}>*</span>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 relative cursor-pointer hover:shadow-sm transition-shadow"
            aria-label={t('orders.columnSettings')}
          >
            <Columns size={16} />
            {t('common.columns')}
            {hasActiveCustomizations && (
              <span className="text-[#1F744F] font-semibold text-xs leading-none relative -top-1 ml-0.5" aria-label={t('orders.columnSettings')}>*</span>
            )}
          </Button>
        </div>
      </div>
      
      {/* Orders table or cards */}
      {view === 'card' ? (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: Math.min(itemsPerPage, 6) }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-[#E4E7E7] p-4">
                  <Skeleton className="h-5 w-24 mb-2" />
                  <Skeleton className="h-4 w-32 mb-4" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E4E7E7] px-6 py-12 text-center">
              {searchQuery || statusFilter !== 'all' || dateStart || dateEnd ? (
                <>
                  <p className="text-[#7C8085] mb-2">{t('orders.noOrders')}</p>
                  <p className="text-[#7C8085]">{t('common.tryAdjustingSearch')}</p>
                </>
              ) : (
                <>
                  <p className="text-[#7C8085] mb-4">{t('orders.noOrders')}</p>
                  <button
                    onClick={() => onNavigate('order-detail', 'new')}
                    className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
                  >
                    {t('orders.createFirstOrder')}
                  </button>
                </>
              )}
            </div>
          ) : (
            renderCardView()
          )}
        </>
      ) : (
        <div className={`bg-white rounded-xl border border-[#E4E7E7] overflow-hidden ${filtersOpen || settingsOpen ? 'relative' : ''}`} style={filtersOpen || settingsOpen ? { zIndex: 0, position: 'relative' } : undefined}>
          <div className="overflow-x-auto" style={{ position: 'relative' }}>
            {isLoading ? (
              // Loading state with skeleton rows
              <table className="w-full min-w-[800px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    {orderedVisibleColumns.map((col, index) => renderTableHeader(col, index))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.min(itemsPerPage, 10) }).map((_, i) => (
                    <tr key={i}>
                      {orderedVisibleColumns.map((col, colIndex) => {
                        if (!visibleColumns[col]) return null;
                        const isFirstColumn = colIndex === 0;
                        const isRightAlign = col === 'total' || col === 'subtotal';
                        const isCenterAlign = col === 'jobs';
                        const skeletonWidths: Record<ColumnKey, string> = {
                          orderId: 'w-24',
                          client: 'w-20',
                          date: 'w-24',
                          status: 'w-16',
                          jobs: 'w-16',
                          total: 'w-20',
                          subtotal: 'w-20',
                          orderType: 'w-32',
                          orderTitle: 'w-32',
                          timeEstimate: 'w-16',
                        };
                        return (
                          <td 
                            key={col} 
                            className={`px-6 py-4 border-b border-[#E4E7E7] ${
                              isRightAlign ? 'text-right' : isCenterAlign ? 'text-center' : ''
                            } ${isFirstColumn ? 'sticky left-0 z-10' : ''}`}
                            style={isFirstColumn ? { 
                              position: 'sticky', 
                              left: 0, 
                              zIndex: (filtersOpen || settingsOpen) ? 0 : 10, 
                              minWidth: '150px',
                              background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
                            } : undefined}
                          >
                            <Skeleton className={`h-4 ${skeletonWidths[col]} ${isRightAlign ? 'ml-auto' : isCenterAlign ? 'mx-auto' : ''}`} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : filteredOrders.length === 0 ? (
              <div className="px-6 py-12 text-center">
                {searchQuery || statusFilter !== 'all' || dateStart || dateEnd ? (
                  <>
                    <p className="text-[#7C8085] mb-2">{t('orders.noOrders')}</p>
                    <p className="text-[#7C8085]">{t('common.tryAdjustingSearch')}</p>
                  </>
                ) : (
                  <>
                    <p className="text-[#7C8085] mb-4">{t('orders.noOrders')}</p>
                    <button
                      onClick={() => onNavigate('order-detail', 'new')}
                      className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
                    >
                      {t('orders.createFirstOrder')}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <table className="w-full min-w-[800px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    {orderedVisibleColumns.map((col, index) => renderTableHeader(col, index))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map(order => {
                    const client = clients.find(c => c.id === order.clientId);
                    
                    return (
                      <tr 
                        key={order.id}
                        onClick={() => onNavigate('order-detail', order.id)}
                        className="group hover:bg-[#F7F8F8] cursor-pointer transition-colors"
                        onMouseEnter={(e) => {
                          const stickyCell = e.currentTarget.querySelector('td[data-sticky="true"]') as HTMLElement;
                          if (stickyCell) {
                            stickyCell.style.background = 'linear-gradient(to left, rgba(247,248,248,0) 0%, rgba(247,248,248,1) 20px, rgba(247,248,248,1) 100%)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          const stickyCell = e.currentTarget.querySelector('td[data-sticky="true"]') as HTMLElement;
                          if (stickyCell) {
                            stickyCell.style.background = 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)';
                          }
                        }}
                      >
                        {orderedVisibleColumns.map((colKey, index) => renderTableCell(colKey, order, client, index))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      
      {filteredOrders.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-[#555A60] text-sm">
            {t('orders.showing')} {startIndex + 1} {t('orders.to')} {Math.min(endIndex, filteredOrders.length)} {t('orders.of')} {filteredOrders.length} {t('orders.orders')}
            {filteredOrders.length !== orders.length && ` (${t('orders.filteredFrom')} ${orders.length} ${t('orders.total')})`}
          </p>
          
          <PaginationWithLinks
            page={currentPage}
            pageSize={itemsPerPage}
            totalCount={filteredOrders.length}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
      
      {/* Settings Panel - Portal to body */}
      {settingsOpen && createPortal(
        <div className="fixed inset-0 z-[9999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, isolation: 'isolate' }}>
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setSettingsOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <div 
            className="absolute right-0 top-0 h-full w-[400px] bg-white shadow-lg overflow-y-auto"
            style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '400px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#E4E7E7]">
                <div>
                  <h2 className="text-xl font-semibold text-[#1E2025]">{t('orders.columnSettings')}</h2>
                  <p className="text-sm text-[#555A60] mt-1">{t('orders.columnSettingsDescription')}</p>
                </div>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-md p-1.5 text-[#7C8085] hover:text-[#1E2025] hover:bg-[#F7F8F8] transition-colors cursor-pointer"
                  aria-label={t('common.close')}
                >
                  <XIcon size={18} />
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Column Ordering */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-[#1E2025]">{t('orders.columnOrder')}</Label>
                  <p className="text-xs text-[#555A60]">{t('orders.columnOrderDescription')}</p>
                  <div className="space-y-1 rounded-lg border border-[#E4E7E7] p-1 bg-[#F7F8F8]">
                    {columnOrder.map((columnKey) => {
                      const isRequired = columnKey === 'orderId' || columnKey === 'status';
                      const isVisible = visibleColumns[columnKey];
                      
                      return (
                        <div
                          key={columnKey}
                          draggable={isVisible}
                          onDragStart={() => handleDragStart(columnKey)}
                          onDragOver={(e) => handleDragOver(e, columnKey)}
                          onDrop={(e) => handleDrop(e, columnKey)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                            isVisible 
                              ? 'bg-white border border-[#E4E7E7] cursor-move hover:shadow-sm' 
                              : 'opacity-50 cursor-not-allowed'
                          } ${
                            draggedColumn === columnKey ? 'opacity-50' : ''
                          } ${
                            dragOverColumn === columnKey && draggedColumn !== columnKey ? 'ring-2 ring-[#1F744F] ring-offset-2' : ''
                          }`}
                        >
                          <GripVertical 
                            className={`h-4 w-4 flex-shrink-0 ${
                              isVisible ? 'text-[#7C8085] cursor-grab active:cursor-grabbing' : 'text-[#E4E7E7]'
                            }`}
                          />
                          <Checkbox
                            id={`col-${columnKey}`}
                            checked={isVisible}
                            disabled={isRequired}
                            onCheckedChange={(checked) => {
                              if (!isRequired) {
                                setVisibleColumns({ ...visibleColumns, [columnKey]: checked === true });
                              }
                            }}
                          />
                          <Label 
                            htmlFor={`col-${columnKey}`}
                            className={`flex-1 text-sm font-medium ${
                              isRequired 
                                ? 'cursor-not-allowed text-[#7C8085]' 
                                : isVisible 
                                  ? 'cursor-pointer text-[#1E2025]' 
                                  : 'cursor-not-allowed text-[#7C8085]'
                            }`}
                          >
                            {columnLabels[columnKey]}
                            {isRequired && <span className="ml-2 text-xs text-[#7C8085]">({t('orders.required')})</span>}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Sorting Settings */}
                <div className="space-y-3 pt-4 border-t border-[#E4E7E7]">
                  <Label className="text-sm font-semibold text-[#1E2025]">{t('orders.sortBy')}</Label>
                  <p className="text-xs text-[#555A60]">{t('orders.sortByDescription')}</p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="sort-field" className="text-xs font-medium text-[#555A60]">
                        {t('orders.sortField')}
                      </Label>
                      <Select value={sortBy} onValueChange={(value) => setSortBy(value as ColumnKey | 'createdAt')}>
                        <SelectTrigger id="sort-field" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="createdAt">{t('orders.date')}</SelectItem>
                          <SelectItem value="orderId">{t('orders.orderId')}</SelectItem>
                          <SelectItem value="client">{t('orders.client')}</SelectItem>
                          <SelectItem value="status">{t('orders.status')}</SelectItem>
                          <SelectItem value="jobs">{t('orders.jobs')}</SelectItem>
                          <SelectItem value="total">{t('orders.total')}</SelectItem>
                          <SelectItem value="subtotal">{t('orders.subtotal')}</SelectItem>
                          <SelectItem value="timeEstimate">{t('orderDetail.timeEstimate')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sort-direction" className="text-xs font-medium text-[#555A60]">
                        {t('orders.sortDirectionLabel')}
                      </Label>
                      <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as 'asc' | 'desc')}>
                        <SelectTrigger id="sort-direction" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="desc">{t('orders.descending')}</SelectItem>
                          <SelectItem value="asc">{t('orders.ascending')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                
                {/* Pagination Settings */}
                <div className="space-y-3 pt-4 border-t border-[#E4E7E7]">
                  <Label className="text-sm font-semibold text-[#1E2025]">{t('orders.itemsPerPage')}</Label>
                  <p className="text-xs text-[#555A60]">{t('orders.itemsPerPageDescription')}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[10, 25, 50, 100].map((size) => (
                      <Button
                        key={size}
                        variant={itemsPerPage === size ? "default" : "outline"}
                        size="sm"
                        onClick={() => setItemsPerPage(size)}
                        className={`cursor-pointer ${itemsPerPage === size ? "bg-[#1F744F] hover:bg-[#165B3C] text-white" : ""}`}
                      >
                        {size}
                      </Button>
                    ))}
                  </div>
                </div>
                
                {/* Reset Custom Settings Button */}
                {hasActiveCustomizations && (
                  <div className="pt-4 border-t border-[#E4E7E7]">
                    <Button
                      variant="outline"
                      onClick={resetCustomizations}
                      className="w-full text-[#1F744F] hover:text-[#165B3C] hover:bg-[#E8F5E9] border-[#1F744F] cursor-pointer"
                    >
                      {t('orders.resetAllCustomSettings')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Filters Panel - Portal to body */}
      {filtersOpen && createPortal(
        <div className="fixed inset-0 z-[9999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, isolation: 'isolate' }}>
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setFiltersOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <div 
            className="absolute right-0 top-0 h-full w-[400px] bg-white shadow-lg overflow-y-auto"
            style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '400px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#E4E7E7]">
                <div>
                  <h2 className="text-xl font-semibold text-[#1E2025]">{t('orders.filtersTitle')}</h2>
                  <p className="text-sm text-[#555A60] mt-1">{t('orders.filtersDescription')}</p>
                </div>
                <button
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-md p-1.5 text-[#7C8085] hover:text-[#1E2025] hover:bg-[#F7F8F8] transition-colors cursor-pointer"
                  aria-label={t('common.close')}
                >
                  <XIcon size={18} />
                </button>
              </div>
              
              <div className="space-y-8">
                {/* Status Filter */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-[#1E2025]">{t('orders.statusFilter')}</Label>
                  <div className="space-y-1 rounded-lg border border-[#E4E7E7] p-1 bg-[#F7F8F8]">
                    {(['all', 'in-progress', 'completed', 'canceled', 'proposal'] as const).map((status) => (
                      <div
                        key={status}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer group ${
                          statusFilter === status 
                            ? 'bg-white shadow-sm border border-[#E4E7E7]' 
                            : 'hover:bg-white/50'
                        }`}
                        onClick={() => setStatusFilter(status)}
                      >
                        <Checkbox
                          id={`status-${status}`}
                          checked={statusFilter === status}
                          onCheckedChange={() => setStatusFilter(status)}
                        />
                        <Label
                          htmlFor={`status-${status}`}
                          className={`flex-1 cursor-pointer text-sm font-medium capitalize ${
                            statusFilter === status ? 'text-[#1E2025]' : 'text-[#555A60] group-hover:text-[#1E2025]'
                          }`}
                        >
                          {status === 'all' ? t('orders.all') : status === 'in-progress' ? t('orders.inProgress') : t(`orders.${status}`)}
                          {status !== 'all' && (
                            <span className="ml-2 text-xs text-[#7C8085]">
                              ({statusCounts[status]})
                            </span>
                          )}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Date Filter */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-[#1E2025]">{t('orders.orderDateRange')}</Label>
                  
                  {/* Show selected range when both dates are selected */}
                  {dateStart && dateEnd ? (
                    <div className="space-y-2">
                      <div className="px-3 py-2 bg-[#F7F8F8] rounded-lg border border-[#E4E7E7]">
                        <p className="text-sm text-[#1E2025] font-medium">
                          {formatDate(dateStart)} - {formatDate(dateEnd)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDateStart(null);
                          setDateEnd(null);
                        }}
                        className="w-full text-[#1F744F] hover:text-[#165B3C] hover:bg-[#E8F5E9] border-[#1F744F] cursor-pointer"
                      >
                        {t('orders.clearDateFilter')}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <DateRangePicker
                        startDate={dateStart}
                        endDate={dateEnd}
                        onRangeChange={(start, end) => {
                          setDateStart(start);
                          setDateEnd(end);
                        }}
                        singleMonth={true}
                      />
                      {(dateStart || dateEnd) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDateStart(null);
                            setDateEnd(null);
                          }}
                          className="w-full text-[#1F744F] hover:text-[#165B3C] hover:bg-[#E8F5E9] cursor-pointer"
                        >
                          {t('orders.clearDateFilter')}
                        </Button>
                      )}
                    </>
                  )}
                </div>
                
                {/* Reset Filters Button */}
                {hasActiveFilters && (
                  <div className="pt-4 border-t border-[#E4E7E7]">
                    <Button
                      variant="outline"
                      onClick={resetFilters}
                      className="w-full text-[#1F744F] hover:text-[#165B3C] hover:bg-[#E8F5E9] border-[#1F744F] cursor-pointer"
                    >
                      {t('orders.resetAllFilters')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

