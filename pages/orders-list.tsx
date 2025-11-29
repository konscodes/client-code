// Orders list page - browse and manage all orders
import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../lib/app-context';
import { StatusPill } from '../components/status-pill';
import { formatCurrency, formatDate, calculateOrderTotal, getOrderTotals } from '../lib/utils';
import { Search, Plus, Filter, Columns, X as XIcon, GripVertical } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui/sheet';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { PaginationWithLinks } from '../components/ui/pagination-with-links';
import { CalendarIcon } from 'lucide-react';
import type { OrderStatus } from '../lib/types';

interface OrdersListProps {
  onNavigate: (page: string, id?: string) => void;
}

type ColumnKey = 'orderId' | 'client' | 'date' | 'status' | 'jobs' | 'total' | 'subtotal' | 'internalNotes' | 'visibleNotes';

export function OrdersList({ onNavigate }: OrdersListProps) {
  const { orders, clients, loading } = useApp();
  
  // Show loading if explicitly loading OR if we have no data yet (initial load)
  const isLoading = loading || (orders.length === 0 && clients.length === 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<{ from?: string; to?: string }>({});
  
  // Column visibility state - Order ID and Status are default, checked, and disabled
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>({
    orderId: true, // default, cannot be unchecked
    client: true,
    date: true,
    status: true, // default, cannot be unchecked
    jobs: true,
    total: true,
    subtotal: false,
    internalNotes: false,
    visibleNotes: false,
  });
  
  // Column order state - defines the order of columns
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>([
    'orderId',
    'client',
    'date',
    'status',
    'jobs',
    'total',
    'subtotal',
    'internalNotes',
    'visibleNotes',
  ]);
  
  // Panel states
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Drag and drop state
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Sorting state
  const [sortBy, setSortBy] = useState<ColumnKey | 'createdAt'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  const filteredOrders = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return orders.filter(order => {
      const client = clients.find(c => c.id === order.clientId);
      const matchesSearch = 
        order.id.toLowerCase().includes(query) ||
        client?.name.toLowerCase().includes(query) ||
        client?.company.toLowerCase().includes(query) ||
        order.notesInternal.toLowerCase().includes(query);
      
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      
      // Date filter
      let matchesDate = true;
      if (dateFilter.from || dateFilter.to) {
        const orderDate = new Date(order.createdAt);
        if (dateFilter.from) {
          const fromDate = new Date(dateFilter.from);
          fromDate.setHours(0, 0, 0, 0);
          if (orderDate < fromDate) matchesDate = false;
        }
        if (dateFilter.to) {
          const toDate = new Date(dateFilter.to);
          toDate.setHours(23, 59, 59, 999);
          if (orderDate > toDate) matchesDate = false;
        }
      }
      
      return matchesSearch && matchesStatus && matchesDate;
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
        default:
          comparison = 0;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [orders, clients, searchQuery, statusFilter, dateFilter, sortBy, sortDirection]);
  
  // Pagination calculations
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);
  
  // Reset to page 1 when filters, itemsPerPage, or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter.from, dateFilter.to, itemsPerPage, sortBy, sortDirection]);
  
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
    orderId: 'Order ID',
    client: 'Client',
    date: 'Date',
    status: 'Status',
    jobs: 'Jobs',
    total: 'Total',
    subtotal: 'Subtotal',
    internalNotes: 'Internal Notes',
    visibleNotes: 'Visible Notes',
  };
  
  // Helper function to render table header
  const renderTableHeader = (columnKey: ColumnKey) => {
    if (!visibleColumns[columnKey]) return null;
    
    const isRightAlign = columnKey === 'total' || columnKey === 'subtotal';
    
    return (
      <th 
        key={columnKey}
        className={`px-6 py-3 ${isRightAlign ? 'text-right' : 'text-left'} text-[#555A60]`}
      >
        {columnLabels[columnKey]}
      </th>
    );
  };
  
  // Helper function to render table cell
  const renderTableCell = (columnKey: ColumnKey, order: typeof orders[0], client: typeof clients[0] | undefined) => {
    if (!visibleColumns[columnKey]) return null;
    
    const { subtotal, total } = getOrderTotals(order);
    const isRightAlign = columnKey === 'total' || columnKey === 'subtotal';
    
    switch (columnKey) {
      case 'orderId':
        return (
          <td key={columnKey} className="px-6 py-4">
            <p className="text-[#1E2025]">{order.id}</p>
          </td>
        );
      case 'client':
        return (
          <td key={columnKey} className="px-6 py-4">
            <p className="text-[#1E2025]">{client?.name || 'Unknown'}</p>
            <p className="text-[#7C8085]">{client?.company}</p>
          </td>
        );
      case 'date':
        return (
          <td key={columnKey} className="px-6 py-4">
            <p className="text-[#555A60]">{formatDate(order.createdAt)}</p>
          </td>
        );
      case 'status':
        return (
          <td key={columnKey} className="px-6 py-4">
            <StatusPill status={order.status} />
          </td>
        );
      case 'jobs':
        return (
          <td key={columnKey} className="px-6 py-4">
            <p className="text-[#555A60]">{order.jobs.length} jobs</p>
          </td>
        );
      case 'total':
        return (
          <td key={columnKey} className={`px-6 py-4 ${isRightAlign ? 'text-right' : ''}`}>
            <p className="text-[#1E2025]">{formatCurrency(total)}</p>
          </td>
        );
      case 'subtotal':
        return (
          <td key={columnKey} className={`px-6 py-4 ${isRightAlign ? 'text-right' : ''}`}>
            <p className="text-[#1E2025]">{formatCurrency(subtotal)}</p>
          </td>
        );
      case 'internalNotes':
        return (
          <td key={columnKey} className="px-6 py-4">
            <p className="text-[#555A60] text-sm line-clamp-2">{order.notesInternal || '-'}</p>
          </td>
        );
      case 'visibleNotes':
        return (
          <td key={columnKey} className="px-6 py-4">
            <p className="text-[#555A60] text-sm line-clamp-2">{order.notesPublic || '-'}</p>
          </td>
        );
      default:
        return null;
    }
  };
  
  // Helper function to render skeleton cell
  const renderSkeletonCell = (columnKey: ColumnKey) => {
    if (!visibleColumns[columnKey]) return null;
    
    const isRightAlign = columnKey === 'total' || columnKey === 'subtotal';
    const skeletonWidths: Record<ColumnKey, string> = {
      orderId: 'w-24',
      client: 'w-20',
      date: 'w-24',
      status: 'w-16',
      jobs: 'w-16',
      total: 'w-20',
      subtotal: 'w-20',
      internalNotes: 'w-32',
      visibleNotes: 'w-32',
    };
    
    return (
      <td key={columnKey} className={`px-6 py-4 ${isRightAlign ? 'text-right' : ''}`}>
        <Skeleton className={`h-4 ${skeletonWidths[columnKey]} ${isRightAlign ? 'ml-auto' : ''}`} />
      </td>
    );
  };
  
  const statusCounts = useMemo(() => {
    return {
      all: orders.length,
      draft: orders.filter(o => o.status === 'draft').length,
      approved: orders.filter(o => o.status === 'approved').length,
      'in-progress': orders.filter(o => o.status === 'in-progress').length,
      completed: orders.filter(o => o.status === 'completed').length,
      billed: orders.filter(o => o.status === 'billed').length,
    };
  }, [orders]);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1E2025] mb-2">Orders</h1>
          <p className="text-[#555A60]">Track and manage all customer orders.</p>
        </div>
        <button
          onClick={() => onNavigate('order-detail', 'new')}
          className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
        >
          <Plus size={20} aria-hidden="true" />
          New Order
        </button>
      </div>
      
      {/* Search and Action Buttons */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-[300px] max-w-md relative">
          <Search 
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C8085]" 
            size={20}
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search orders by ID, client, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search orders"
          />
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setFiltersOpen(true)}
            className="flex items-center gap-2"
          >
            <Filter size={16} />
            Filters
          </Button>
          <Button
            variant="outline"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2"
          >
            <Columns size={16} />
            Customize
          </Button>
        </div>
      </div>
      
      {/* Orders table */}
      <div className="bg-white rounded-xl border border-[#E4E7E7] overflow-hidden">
        {isLoading ? (
          // Loading state with skeleton rows
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E7E7]">
                {orderedVisibleColumns.map(renderTableHeader)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7E7]">
              {Array.from({ length: Math.min(itemsPerPage, 10) }).map((_, i) => (
                <tr key={i}>
                  {orderedVisibleColumns.map(renderSkeletonCell)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : filteredOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            {searchQuery || statusFilter !== 'all' || dateFilter.from || dateFilter.to ? (
              <>
                <p className="text-[#7C8085] mb-2">No orders found</p>
                <p className="text-[#7C8085]">Try adjusting your filters or search query</p>
              </>
            ) : (
              <>
                <p className="text-[#7C8085] mb-4">No orders yet</p>
                <button
                  onClick={() => onNavigate('order-detail', 'new')}
                  className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
                >
                  Create your first order
                </button>
              </>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E7E7]">
                {orderedVisibleColumns.map(renderTableHeader)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7E7]">
              {paginatedOrders.map(order => {
                const client = clients.find(c => c.id === order.clientId);
                
                return (
                  <tr 
                    key={order.id}
                    onClick={() => onNavigate('order-detail', order.id)}
                    className="hover:bg-[#F7F8F8] cursor-pointer transition-colors"
                  >
                    {orderedVisibleColumns.map(columnKey => renderTableCell(columnKey, order, client))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      
      {filteredOrders.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-[#555A60] text-sm">
            Showing {startIndex + 1} to {Math.min(endIndex, filteredOrders.length)} of {filteredOrders.length} orders
            {filteredOrders.length !== orders.length && ` (filtered from ${orders.length} total)`}
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
        <div className="fixed inset-0 z-[9999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
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
                  <h2 className="text-xl font-semibold text-[#1E2025]">Column Settings</h2>
                  <p className="text-sm text-[#555A60] mt-1">Select which columns to display in the table</p>
                </div>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-md p-1.5 text-[#7C8085] hover:text-[#1E2025] hover:bg-[#F7F8F8] transition-colors"
                  aria-label="Close"
                >
                  <XIcon size={18} />
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Column Ordering */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-[#1E2025]">Column Order</Label>
                  <p className="text-xs text-[#555A60]">Drag columns to reorder them</p>
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
                            {isRequired && <span className="ml-2 text-xs text-[#7C8085]">(required)</span>}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Sorting Settings */}
                <div className="space-y-3 pt-4 border-t border-[#E4E7E7]">
                  <Label className="text-sm font-semibold text-[#1E2025]">Sort By</Label>
                  <p className="text-xs text-[#555A60]">Choose how to sort the orders</p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="sort-field" className="text-xs font-medium text-[#555A60]">
                        Sort Field
                      </Label>
                      <Select value={sortBy} onValueChange={(value) => setSortBy(value as ColumnKey | 'createdAt')}>
                        <SelectTrigger id="sort-field" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="createdAt">Date</SelectItem>
                          <SelectItem value="orderId">Order ID</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                          <SelectItem value="status">Status</SelectItem>
                          <SelectItem value="jobs">Jobs</SelectItem>
                          <SelectItem value="total">Total</SelectItem>
                          <SelectItem value="subtotal">Subtotal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sort-direction" className="text-xs font-medium text-[#555A60]">
                        Sort Direction
                      </Label>
                      <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as 'asc' | 'desc')}>
                        <SelectTrigger id="sort-direction" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="desc">Descending</SelectItem>
                          <SelectItem value="asc">Ascending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                
                {/* Pagination Settings */}
                <div className="space-y-3 pt-4 border-t border-[#E4E7E7]">
                  <Label className="text-sm font-semibold text-[#1E2025]">Items Per Page</Label>
                  <p className="text-xs text-[#555A60]">Select how many orders to display per page</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[10, 25, 50, 100].map((size) => (
                      <Button
                        key={size}
                        variant={itemsPerPage === size ? "default" : "outline"}
                        size="sm"
                        onClick={() => setItemsPerPage(size)}
                        className={itemsPerPage === size ? "bg-[#1F744F] hover:bg-[#165B3C] text-white" : ""}
                      >
                        {size}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Filters Panel - Portal to body */}
      {filtersOpen && createPortal(
        <div className="fixed inset-0 z-[9999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
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
                  <h2 className="text-xl font-semibold text-[#1E2025]">Filters</h2>
                  <p className="text-sm text-[#555A60] mt-1">Filter orders by status and date range</p>
                </div>
                <button
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-md p-1.5 text-[#7C8085] hover:text-[#1E2025] hover:bg-[#F7F8F8] transition-colors"
                  aria-label="Close"
                >
                  <XIcon size={18} />
                </button>
              </div>
              
              <div className="space-y-8">
                {/* Status Filter */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-[#1E2025]">Status</Label>
                  <div className="space-y-1 rounded-lg border border-[#E4E7E7] p-1 bg-[#F7F8F8]">
                    {(['all', 'draft', 'approved', 'in-progress', 'completed', 'billed'] as const).map((status) => (
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
                          {status === 'all' ? 'All' : status === 'in-progress' ? 'In Progress' : status}
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
                  <Label className="text-sm font-semibold text-[#1E2025]">Date Range</Label>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="date-from" className="text-xs font-medium text-[#555A60]">
                        From Date
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
                              <span className="text-[#7C8085]">Pick a date</span>
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
                        To Date
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
                              <span className="text-[#7C8085]">Pick a date</span>
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
                        className="w-full text-[#1F744F] hover:text-[#165B3C] hover:bg-[#E8F5E9]"
                      >
                        Clear date filter
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

