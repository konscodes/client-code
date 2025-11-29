// Dashboard page - overview with KPIs and recent activity
import { useMemo } from 'react';
import { useApp } from '../lib/app-context';
import { KPICard } from '../components/kpi-card';
import { StatusPill } from '../components/status-pill';
import { formatCurrency, formatDate, calculateOrderTotal } from '../lib/utils';
import { FileText, Users, DollarSign, Clock } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import type { Order } from '../lib/types';

interface DashboardProps {
  onNavigate: (page: string, id?: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { orders, clients, loading } = useApp();
  
  // Show loading if explicitly loading OR if we have no data yet (initial load)
  const isLoading = loading || (orders.length === 0 && clients.length === 0);
  
  const kpiData = useMemo(() => {
    const openOrders = orders.filter(o => o.status === 'in-progress' || o.status === 'approved').length;
    const awaitingInvoice = orders.filter(o => o.status === 'completed').length;
    const draftOrders = orders.filter(o => o.status === 'draft').length;
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthRevenue = orders
      .filter(o => {
        const orderDate = new Date(o.createdAt);
        return (o.status === 'completed' || o.status === 'billed') &&
               orderDate.getMonth() === currentMonth &&
               orderDate.getFullYear() === currentYear;
      })
      .reduce((sum, order) => sum + calculateOrderTotal(order), 0);
    
    return {
      openOrders,
      awaitingInvoice,
      draftOrders,
      monthRevenue,
    };
  }, [orders]);
  
  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [orders]);
  
  const recentClients = useMemo(() => {
    return [...clients]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [clients]);
  
  return (
    <div className="space-y-8">
      {/* Page title and actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1E2025] mb-2">Welcome back</h1>
          <p className="text-[#555A60]">Here's what's happening with your business today.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onNavigate('clients', 'new')}
            className="px-4 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors"
          >
            New Client
          </button>
          <button
            onClick={() => onNavigate('orders', 'new')}
            className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
          >
            New Order
          </button>
        </div>
      </div>
      
      {/* KPI Cards */}
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">Key Performance Indicators</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard
            title="Open Orders"
            value={kpiData.openOrders}
            icon={FileText}
            onClick={() => onNavigate('orders')}
          />
          <KPICard
            title="Awaiting Invoice"
            value={kpiData.awaitingInvoice}
            icon={Clock}
            onClick={() => onNavigate('orders')}
          />
          <KPICard
            title="Draft Orders"
            value={kpiData.draftOrders}
            icon={FileText}
            onClick={() => onNavigate('orders')}
          />
          <KPICard
            title="This Month Revenue"
            value={formatCurrency(kpiData.monthRevenue)}
            icon={DollarSign}
          />
        </div>
      </section>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Orders */}
        <section aria-labelledby="recent-orders-heading">
          <div className="bg-white rounded-xl border border-[#E4E7E7]">
            <div className="px-6 py-4 border-b border-[#E4E7E7] flex items-center justify-between">
              <h2 id="recent-orders-heading" className="text-[#1E2025]">
                Recent Orders
              </h2>
              <button
                onClick={() => onNavigate('orders')}
                className="text-[#1F744F] hover:text-[#165B3C] transition-colors"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-[#E4E7E7]">
              {isLoading ? (
                // Loading state with skeleton placeholders
                <div className="px-6 py-4 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-3 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-24" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </div>
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentOrders.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-[#7C8085] mb-4">No orders yet</p>
                  <button
                    onClick={() => onNavigate('orders', 'new')}
                    className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
                  >
                    Create your first order
                  </button>
                </div>
              ) : (
                recentOrders.map(order => {
                  const client = clients.find(c => c.id === order.clientId);
                  const total = calculateOrderTotal(order);
                  
                  return (
                    <button
                      key={order.id}
                      onClick={() => onNavigate('order-detail', order.id)}
                      className="w-full px-6 py-4 hover:bg-[#F7F8F8] transition-colors text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-[#1E2025] mb-1">{order.id}</p>
                          <p className="text-[#7C8085]">{client?.name || 'Unknown Client'}</p>
                        </div>
                        <StatusPill status={order.status} />
                      </div>
                      <div className="flex items-center justify-between text-[#7C8085]">
                        <span>{formatDate(order.createdAt)}</span>
                        <span className="text-[#1E2025]">{formatCurrency(total)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>
        
        {/* Recent Clients */}
        <section aria-labelledby="recent-clients-heading">
          <div className="bg-white rounded-xl border border-[#E4E7E7]">
            <div className="px-6 py-4 border-b border-[#E4E7E7] flex items-center justify-between">
              <h2 id="recent-clients-heading" className="text-[#1E2025]">
                Recent Clients
              </h2>
              <button
                onClick={() => onNavigate('clients')}
                className="text-[#1F744F] hover:text-[#165B3C] transition-colors"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-[#E4E7E7]">
              {isLoading ? (
                // Loading state with skeleton placeholders
                <div className="px-6 py-4 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-3 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-24" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentClients.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-[#7C8085] mb-4">No clients yet</p>
                  <button
                    onClick={() => onNavigate('clients', 'new')}
                    className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
                  >
                    Add your first client
                  </button>
                </div>
              ) : (
                recentClients.map(client => {
                  const clientOrders = orders.filter(o => o.clientId === client.id);
                  
                  return (
                    <button
                      key={client.id}
                      onClick={() => onNavigate('client-detail', client.id)}
                      className="w-full px-6 py-4 hover:bg-[#F7F8F8] transition-colors text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-[#1E2025] mb-1">{client.name}</p>
                          <p className="text-[#7C8085]">{client.company}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[#7C8085]">
                        <span>{client.email}</span>
                        <span>{clientOrders.length} orders</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
