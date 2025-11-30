// Clients list page - browse and manage all clients
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useApp } from '../lib/app-context';
import { useFormatting } from '../lib/use-formatting';
import { getClientOrders, formatPhoneNumber, extractIdNumbers } from '../lib/utils';
import { Search, Plus, Filter, Columns, X as XIcon, GripVertical, CalendarIcon } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { PaginationWithLinks } from '../components/ui/pagination-with-links';

interface ClientsListProps {
  onNavigate: (page: string, id?: string) => void;
}

type ColumnKey = 'clientId' | 'client' | 'email' | 'phone' | 'orders' | 'lastOrder';

export function ClientsList({ onNavigate }: ClientsListProps) {
  const { t } = useTranslation();
  const { formatDate } = useFormatting();
  const { clients, orders, loading } = useApp();
  
  // Show loading if explicitly loading OR if we have no data yet (initial load)
  const isLoading = loading || (clients.length === 0 && orders.length === 0);
  
  // localStorage keys
  const STORAGE_KEY_PREFIX = 'clients-table-';
  const STORAGE_KEYS = {
    filters: `${STORAGE_KEY_PREFIX}filters`,
    visibleColumns: `${STORAGE_KEY_PREFIX}visibleColumns`,
    columnOrder: `${STORAGE_KEY_PREFIX}columnOrder`,
    itemsPerPage: `${STORAGE_KEY_PREFIX}itemsPerPage`,
    sortBy: `${STORAGE_KEY_PREFIX}sortBy`,
    sortDirection: `${STORAGE_KEY_PREFIX}sortDirection`,
  };
  
  // Default values
  const defaultVisibleColumns: Record<ColumnKey, boolean> = {
    clientId: true,
    client: true,
    email: true,
    phone: true,
    orders: true,
    lastOrder: true,
  };
  
  const defaultColumnOrder: ColumnKey[] = [
    'clientId',
    'client',
    'email',
    'phone',
    'orders',
    'lastOrder',
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
      console.error('Failed to save to localStorage:', error);
    }
  };
  
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter states - load from localStorage
  const [dateFilter, setDateFilter] = useState<{ from?: string; to?: string }>(() => {
    const stored = loadFromStorage<{ dateFilter?: { from?: string; to?: string } }>(STORAGE_KEYS.filters, {});
    return stored.dateFilter || {};
  });
  const [ordersCountFilter, setOrdersCountFilter] = useState<{ min?: number; max?: number }>(() => {
    const stored = loadFromStorage<{ ordersCountFilter?: { min?: number; max?: number } }>(STORAGE_KEYS.filters, {});
    return stored.ordersCountFilter || {};
  });
  
  // Column visibility state - load from localStorage
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() =>
    loadFromStorage(STORAGE_KEYS.visibleColumns, defaultVisibleColumns)
  );
  
  // Column order state - load from localStorage
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() =>
    loadFromStorage(STORAGE_KEYS.columnOrder, defaultColumnOrder)
  );
  
  // Panel states
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Drag and drop state
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | null>(null);
  
  // Pagination state - load from localStorage
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() =>
    loadFromStorage(STORAGE_KEYS.itemsPerPage, 10)
  );
  
  // Sorting state - load from localStorage
  const [sortBy, setSortBy] = useState<ColumnKey>(() =>
    loadFromStorage(STORAGE_KEYS.sortBy, 'client')
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() =>
    loadFromStorage(STORAGE_KEYS.sortDirection, 'asc')
  );
  
  // Save filters to localStorage when they change
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.filters, { dateFilter, ordersCountFilter });
  }, [dateFilter, ordersCountFilter]);
  
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
    return !!(dateFilter.from || dateFilter.to || ordersCountFilter.min !== undefined || ordersCountFilter.max !== undefined);
  }, [dateFilter, ordersCountFilter]);
  
  // Check if customizations are active (different from defaults)
  const hasActiveCustomizations = useMemo(() => {
    const hasCustomColumns = JSON.stringify(visibleColumns) !== JSON.stringify(defaultVisibleColumns);
    const hasCustomOrder = JSON.stringify(columnOrder) !== JSON.stringify(defaultColumnOrder);
    const hasCustomItemsPerPage = itemsPerPage !== 10;
    const hasCustomSort = sortBy !== 'client' || sortDirection !== 'asc';
    return hasCustomColumns || hasCustomOrder || hasCustomItemsPerPage || hasCustomSort;
  }, [visibleColumns, columnOrder, itemsPerPage, sortBy, sortDirection]);
  
  // Reset filters function
  const resetFilters = () => {
    setDateFilter({});
    setOrdersCountFilter({});
    setCurrentPage(1);
  };
  
  // Reset customizations function
  const resetCustomizations = () => {
    setVisibleColumns(defaultVisibleColumns);
    setColumnOrder(defaultColumnOrder);
    setItemsPerPage(10);
    setSortBy('client');
    setSortDirection('asc');
    setCurrentPage(1);
  };
  
  const filteredClients = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return clients.filter(client => {
      // Search filter
      const matchesSearch = 
        client.name.toLowerCase().includes(query) ||
        client.company.toLowerCase().includes(query) ||
        client.email.toLowerCase().includes(query) ||
        client.phone.toLowerCase().includes(query);
      
      if (!matchesSearch) return false;
      
      // Date filter (last order date)
      const clientOrders = getClientOrders(orders, client.id);
      const lastOrder = clientOrders.length > 0 
        ? clientOrders.reduce((latest, order) => 
            order.createdAt > latest.createdAt ? order : latest
          )
        : null;
      
      let matchesDate = true;
      if (dateFilter.from || dateFilter.to) {
        if (!lastOrder) {
          matchesDate = false; // No orders means no date match
        } else {
          const lastOrderDate = new Date(lastOrder.createdAt);
          if (dateFilter.from) {
            const fromDate = new Date(dateFilter.from);
            fromDate.setHours(0, 0, 0, 0);
            if (lastOrderDate < fromDate) matchesDate = false;
          }
          if (dateFilter.to) {
            const toDate = new Date(dateFilter.to);
            toDate.setHours(23, 59, 59, 999);
            if (lastOrderDate > toDate) matchesDate = false;
          }
        }
      }
      
      // Orders count filter
      let matchesOrdersCount = true;
      if (ordersCountFilter.min !== undefined || ordersCountFilter.max !== undefined) {
        const orderCount = clientOrders.length;
        if (ordersCountFilter.min !== undefined && orderCount < ordersCountFilter.min) {
          matchesOrdersCount = false;
        }
        if (ordersCountFilter.max !== undefined && orderCount > ordersCountFilter.max) {
          matchesOrdersCount = false;
        }
      }
      
      return matchesSearch && matchesDate && matchesOrdersCount;
    }).sort((a, b) => {
      let comparison = 0;
      const clientOrdersA = getClientOrders(orders, a.id);
      const clientOrdersB = getClientOrders(orders, b.id);
      const lastOrderA = clientOrdersA.length > 0 
        ? clientOrdersA.reduce((latest, order) => 
            order.createdAt > latest.createdAt ? order : latest
          )
        : null;
      const lastOrderB = clientOrdersB.length > 0 
        ? clientOrdersB.reduce((latest, order) => 
            order.createdAt > latest.createdAt ? order : latest
          )
        : null;
      
      switch (sortBy) {
        case 'clientId':
          comparison = a.id.localeCompare(b.id);
          break;
        case 'client':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'email':
          comparison = a.email.localeCompare(b.email);
          break;
        case 'phone':
          comparison = a.phone.localeCompare(b.phone);
          break;
        case 'orders':
          comparison = clientOrdersA.length - clientOrdersB.length;
          break;
        case 'lastOrder':
          if (!lastOrderA && !lastOrderB) {
            comparison = 0;
          } else if (!lastOrderA) {
            // Client A has no orders - always put at bottom
            // comparison = 1 means A comes after B (at bottom)
            comparison = 1;
          } else if (!lastOrderB) {
            // Client B has no orders - always put at bottom
            // comparison = -1 means A comes before B (B at bottom)
            comparison = -1;
          } else {
            // Both have orders - compare by date
            comparison = new Date(lastOrderA.createdAt).getTime() - new Date(lastOrderB.createdAt).getTime();
          }
          break;
        default:
          comparison = 0;
      }
      
      // For lastOrder, clients with no orders should always be at bottom
      // So we need to handle the reversal carefully
      if (sortBy === 'lastOrder') {
        const aHasNoOrders = !lastOrderA;
        const bHasNoOrders = !lastOrderB;
        
        if (aHasNoOrders || bHasNoOrders) {
          // One has no orders - don't reverse, keep no-orders at bottom
          return comparison;
        }
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [clients, orders, searchQuery, dateFilter, ordersCountFilter, sortBy, sortDirection]);
  
  // Pagination calculations
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClients = filteredClients.slice(startIndex, endIndex);
  
  // Reset to page 1 when filters, itemsPerPage, or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter.from, dateFilter.to, ordersCountFilter.min, ordersCountFilter.max, itemsPerPage, sortBy, sortDirection]);
  
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
    clientId: t('clients.clientId'),
    client: t('clients.client'),
    email: t('clients.email'),
    phone: t('clients.phone'),
    orders: t('clients.orders'),
    lastOrder: t('clients.lastOrder'),
  };
  
  // Helper function to render table header
  const renderTableHeader = (columnKey: ColumnKey, index: number) => {
    if (!visibleColumns[columnKey]) return null;
    
    const isFirstColumn = index === 0;
    const isDateColumn = columnKey === 'lastOrder';
    const isPhoneColumn = columnKey === 'phone';
    
    const headerStyle: React.CSSProperties = {};
    if (isFirstColumn) {
      headerStyle.position = 'sticky';
      headerStyle.left = 0;
      headerStyle.zIndex = 10;
      headerStyle.minWidth = '150px';
    }
    if (isDateColumn) {
      headerStyle.minWidth = '150px';
    }
    if (isPhoneColumn) {
      headerStyle.minWidth = '140px';
    }
    
    const isCenterAlign = columnKey === 'orders';
    
    return (
      <th 
        key={columnKey}
        className={`px-6 py-3 border-b border-[#E4E7E7] ${isCenterAlign ? 'text-center' : 'text-left'} text-[#555A60] ${
          isFirstColumn ? 'sticky left-0 z-10 bg-white border-r border-[#E4E7E7] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]' : ''
        }`}
        style={Object.keys(headerStyle).length > 0 ? headerStyle : undefined}
      >
        {columnLabels[columnKey]}
      </th>
    );
  };
  
  // Helper function to render table cell
  const renderTableCell = (columnKey: ColumnKey, client: typeof clients[0], clientOrders: typeof orders, index: number) => {
    if (!visibleColumns[columnKey]) return null;
    
    const lastOrder = clientOrders.length > 0 
      ? clientOrders.reduce((latest, order) => 
          order.createdAt > latest.createdAt ? order : latest
        )
      : null;
    
    const isFirstColumn = index === 0;
    const hasOpenPanel = filtersOpen || settingsOpen;
    
    switch (columnKey) {
      case 'clientId':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isFirstColumn ? 'sticky left-0 z-10 border-r border-[#E4E7E7] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] transition-colors' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              backgroundColor: 'white'
            } : undefined}
          >
            <p className="text-[#1E2025]">{extractIdNumbers(client.id)}</p>
          </td>
        );
      case 'client':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isFirstColumn ? 'sticky left-0 z-10 border-r border-[#E4E7E7] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] transition-colors' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              backgroundColor: 'white'
            } : undefined}
          >
            <p className="text-[#1E2025] whitespace-nowrap">{client.company}</p>
            {client.name && client.name !== 'Unknown' && (
              <p className="text-[#7C8085] whitespace-nowrap">{client.name}</p>
            )}
          </td>
        );
      case 'email':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isFirstColumn ? 'sticky left-0 z-10 border-r border-[#E4E7E7] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] transition-colors' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              backgroundColor: 'white'
            } : undefined}
          >
            <p className="text-[#555A60] whitespace-nowrap">{client.email}</p>
          </td>
        );
      case 'phone':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isFirstColumn ? 'sticky left-0 z-10 border-r border-[#E4E7E7] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] transition-colors' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: 10, 
              minWidth: '150px',
              backgroundColor: 'white'
            } : { minWidth: '140px' }}
          >
            <p className="text-[#555A60] whitespace-nowrap">{formatPhoneNumber(client.phone)}</p>
          </td>
        );
      case 'orders':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] text-center ${isFirstColumn ? 'sticky left-0 z-10 border-r border-[#E4E7E7] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] transition-colors' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: hasOpenPanel ? 0 : 10, 
              minWidth: '150px',
              backgroundColor: 'white'
            } : undefined}
          >
            <p className="text-[#555A60]">{clientOrders.length}</p>
          </td>
        );
      case 'lastOrder':
        return (
          <td 
            key={columnKey}
            data-sticky={isFirstColumn ? 'true' : undefined}
            className={`px-6 py-4 border-b border-[#E4E7E7] ${isFirstColumn ? 'sticky left-0 z-10 border-r border-[#E4E7E7] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] transition-colors' : ''}`}
            style={isFirstColumn ? { 
              position: 'sticky', 
              left: 0, 
              zIndex: 10, 
              minWidth: '150px',
              backgroundColor: 'white'
            } : { minWidth: '150px' }}
          >
            <p className="text-[#555A60]">
              {lastOrder ? formatDate(lastOrder.createdAt) : t('clients.noOrders')}
            </p>
          </td>
        );
      default:
        return null;
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1E2025] mb-2">{t('clients.title')}</h1>
          <p className="text-[#555A60]">{t('clients.subtitle')}</p>
        </div>
        <button
          onClick={() => onNavigate('client-detail', 'new')}
          className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus size={20} aria-hidden="true" />
          {t('clients.newClient')}
        </button>
      </div>
      
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[300px] max-w-md relative">
          <Search 
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C8085]" 
            size={20}
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder={t('clients.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label={t('clients.searchLabel')}
          />
        </div>
        
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => setFiltersOpen(true)}
            className="flex items-center gap-2 relative cursor-pointer hover:shadow-sm transition-shadow"
            aria-label={t('clients.filters')}
          >
            <Filter size={16} />
            {t('clients.filters')}
            {hasActiveFilters && (
              <span className="text-[#1F744F] font-semibold text-xs leading-none relative -top-1 ml-0.5" aria-label={t('clients.filters')}>*</span>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 relative cursor-pointer hover:shadow-sm transition-shadow"
            aria-label={t('clients.columnSettings')}
          >
            <Columns size={16} />
            {t('common.columns')}
            {hasActiveCustomizations && (
              <span className="text-[#1F744F] font-semibold text-xs leading-none relative -top-1 ml-0.5" aria-label={t('clients.columnSettings')}>*</span>
            )}
          </Button>
        </div>
      </div>
      
      {/* Clients table */}
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
                      const isCenterAlign = col === 'orders';
                      const skeletonWidths: Record<ColumnKey, string> = {
                        clientId: 'w-24',
                        client: 'w-24',
                        email: 'w-24',
                        phone: 'w-20',
                        orders: 'w-16',
                        lastOrder: 'w-24',
                      };
                      return (
                        <td 
                          key={col} 
                          className={`px-6 py-4 border-b border-[#E4E7E7] ${isCenterAlign ? 'text-center' : ''} ${isFirstColumn ? 'sticky left-0 z-10 bg-white border-r border-[#E4E7E7] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]' : ''}`}
                          style={isFirstColumn ? { position: 'sticky', left: 0, zIndex: (filtersOpen || settingsOpen) ? 0 : 10, minWidth: '150px' } : undefined}
                        >
                          <Skeleton className={`h-4 ${skeletonWidths[col]} ${isCenterAlign ? 'mx-auto' : ''}`} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : filteredClients.length === 0 ? (
            <div className="px-6 py-12 text-center">
              {searchQuery ? (
                <>
                  <p className="text-[#7C8085] mb-2">{t('clients.noClients')}</p>
                  <p className="text-[#7C8085]">{t('common.tryAdjustingSearch')}</p>
                </>
              ) : (
                <>
                  <p className="text-[#7C8085] mb-4">{t('clients.noClients')}</p>
                  <button
                    onClick={() => onNavigate('client-detail', 'new')}
                    className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
                  >
                    {t('clients.addFirstClient')}
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
                {paginatedClients.map(client => {
                  const clientOrders = getClientOrders(orders, client.id);
                  
                  return (
                    <tr 
                      key={client.id}
                      onClick={() => onNavigate('client-detail', client.id)}
                      className="group hover:bg-[#F7F8F8] cursor-pointer transition-colors"
                      onMouseEnter={(e) => {
                        const stickyCell = e.currentTarget.querySelector('td[data-sticky="true"]') as HTMLElement;
                        if (stickyCell) {
                          stickyCell.style.backgroundColor = '#F7F8F8';
                        }
                      }}
                      onMouseLeave={(e) => {
                        const stickyCell = e.currentTarget.querySelector('td[data-sticky="true"]') as HTMLElement;
                        if (stickyCell) {
                          stickyCell.style.backgroundColor = 'white';
                        }
                      }}
                    >
                      {orderedVisibleColumns.map((columnKey, index) => renderTableCell(columnKey, client, clientOrders, index))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      {filteredClients.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-[#555A60] text-sm">
            {t('clients.showing')} {startIndex + 1} {t('clients.to')} {Math.min(endIndex, filteredClients.length)} {t('clients.of')} {filteredClients.length} {t('clients.clients')}
            {filteredClients.length !== clients.length && ` (${t('clients.filteredFrom')} ${clients.length} ${t('clients.total')})`}
          </p>
          
          <PaginationWithLinks
            page={currentPage}
            pageSize={itemsPerPage}
            totalCount={filteredClients.length}
            onPageChange={setCurrentPage}
          />
        </div>
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
                  <h2 className="text-xl font-semibold text-[#1E2025]">{t('clients.filtersTitle')}</h2>
                  <p className="text-sm text-[#555A60] mt-1">{t('clients.filtersDescription')}</p>
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
                {/* Date Filter */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-[#1E2025]">{t('clients.lastOrderDateRange')}</Label>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="date-from" className="text-xs font-medium text-[#555A60]">
                        {t('clients.fromDate')}
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal h-9"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 text-[#7C8085]" />
                            {dateFilter.from ? (
                              formatDate(new Date(dateFilter.from))
                            ) : (
                              <span className="text-[#7C8085]">{t('clients.pickDate')}</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateFilter.from ? new Date(dateFilter.from) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                setDateFilter({ ...dateFilter, from: date.toISOString().split('T')[0] });
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date-to" className="text-xs font-medium text-[#555A60]">
                        {t('clients.toDate')}
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal h-9"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 text-[#7C8085]" />
                            {dateFilter.to ? (
                              formatDate(new Date(dateFilter.to))
                            ) : (
                              <span className="text-[#7C8085]">{t('clients.pickDate')}</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateFilter.to ? new Date(dateFilter.to) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                setDateFilter({ ...dateFilter, to: date.toISOString().split('T')[0] });
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {(dateFilter.from || dateFilter.to) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDateFilter({})}
                        className="w-full text-[#1F744F] hover:text-[#165B3C] hover:bg-[#E8F5E9] cursor-pointer"
                      >
                        {t('clients.clearDateFilter')}
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Orders Count Filter */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-[#1E2025]">{t('clients.numberOfOrders')}</Label>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="orders-min" className="text-xs font-medium text-[#555A60]">
                        {t('clients.minimum')}
                      </Label>
                      <Input
                        id="orders-min"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={ordersCountFilter.min ?? ''}
                        onChange={(e) => {
                          const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                          setOrdersCountFilter({ ...ordersCountFilter, min: value });
                        }}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="orders-max" className="text-xs font-medium text-[#555A60]">
                        {t('clients.maximum')}
                      </Label>
                      <Input
                        id="orders-max"
                        type="number"
                        min="0"
                        placeholder={t('clients.noLimit')}
                        value={ordersCountFilter.max ?? ''}
                        onChange={(e) => {
                          const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                          setOrdersCountFilter({ ...ordersCountFilter, max: value });
                        }}
                        className="w-full"
                      />
                    </div>
                    {(ordersCountFilter.min !== undefined || ordersCountFilter.max !== undefined) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOrdersCountFilter({})}
                        className="w-full text-[#1F744F] hover:text-[#165B3C] hover:bg-[#E8F5E9] cursor-pointer"
                      >
                        {t('clients.clearOrdersFilter')}
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Reset Filters Button */}
                {hasActiveFilters && (
                  <div className="pt-4 border-t border-[#E4E7E7]">
                    <Button
                      variant="outline"
                      onClick={resetFilters}
                      className="w-full text-[#1F744F] hover:text-[#165B3C] hover:bg-[#E8F5E9] border-[#1F744F] cursor-pointer"
                    >
                      {t('clients.resetAllFilters')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Customize Panel - Portal to body */}
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
                  <h2 className="text-xl font-semibold text-[#1E2025]">{t('clients.columnSettings')}</h2>
                  <p className="text-sm text-[#555A60] mt-1">{t('clients.columnSettingsDescription')}</p>
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
                  <Label className="text-sm font-semibold text-[#1E2025]">{t('clients.columnOrder')}</Label>
                  <p className="text-xs text-[#555A60]">{t('clients.columnOrderDescription')}</p>
                  <div className="space-y-1 rounded-lg border border-[#E4E7E7] p-1 bg-[#F7F8F8]">
                    {columnOrder.map((columnKey) => {
                      const isRequired = columnKey === 'clientId';
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
                            {isRequired && <span className="ml-2 text-xs text-[#7C8085]">({t('clients.required')})</span>}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Sorting Settings */}
                <div className="space-y-3 pt-4 border-t border-[#E4E7E7]">
                  <Label className="text-sm font-semibold text-[#1E2025]">{t('clients.sortBy')}</Label>
                  <p className="text-xs text-[#555A60]">{t('clients.sortByDescription')}</p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="sort-field" className="text-xs font-medium text-[#555A60]">
                        {t('clients.sortField')}
                      </Label>
                      <Select value={sortBy} onValueChange={(value) => setSortBy(value as ColumnKey)}>
                        <SelectTrigger id="sort-field" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {columnOrder.filter(key => visibleColumns[key]).map(key => (
                            <SelectItem key={key} value={key}>
                              {columnLabels[key]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sort-direction" className="text-xs font-medium text-[#555A60]">
                        {t('clients.sortDirectionLabel')}
                      </Label>
                      <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as 'asc' | 'desc')}>
                        <SelectTrigger id="sort-direction" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">{t('clients.ascending')}</SelectItem>
                          <SelectItem value="desc">{t('clients.descending')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                
                {/* Pagination Settings */}
                <div className="space-y-3 pt-4 border-t border-[#E4E7E7]">
                  <Label className="text-sm font-semibold text-[#1E2025]">{t('clients.itemsPerPage')}</Label>
                  <p className="text-xs text-[#555A60]">{t('clients.itemsPerPageDescription')}</p>
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
                      className="w-full text-[#1F744F] hover:text-[#165B3C] hover:bg-[#E8F5E9] border-[#1F744F]"
                    >
                      {t('clients.resetAllCustomSettings')}
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
