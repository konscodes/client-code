// Dashboard page - overview with KPIs and recent activity
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../lib/app-context';
import { useFormatting } from '../lib/use-formatting';
import { KPICard } from '../components/kpi-card';
import { StatusPill } from '../components/status-pill';
import { calculateOrderTotal } from '../lib/utils';
import { FileText, Users, DollarSign, Clock } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import type { Order } from '../lib/types';

interface DashboardProps {
  onNavigate: (page: string, id?: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { t } = useTranslation();
  const { orders, clients, loading } = useApp();
  const { formatCurrency, formatDate } = useFormatting();
  
  // Show loading if explicitly loading OR if we have no data yet (initial load)
  const isLoading = loading || (orders.length === 0 && clients.length === 0);
  
  const kpiData = useMemo(() => {
    const openOrders = orders.filter(o => o.status === 'in-progress').length;
    const awaitingInvoice = orders.filter(o => o.status === 'completed').length;
    const proposalOrders = orders.filter(o => o.status === 'proposal').length;
    
    // Calculate month revenue for current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    const monthRevenue = orders
      .filter(o => {
        // Ensure createdAt is a Date object
        const orderDate = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
        
        // Check if order is in current month and has correct status
        return o.status === 'completed' &&
               orderDate >= startOfMonth &&
               orderDate < startOfNextMonth;
      })
      .reduce((sum, order) => sum + calculateOrderTotal(order), 0);
    
    return {
      openOrders,
      awaitingInvoice,
      proposalOrders,
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
          <h1 className="text-[#1E2025] mb-2">{t('dashboard.welcomeBack')}</h1>
          <p className="text-[#555A60]">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onNavigate('clients', 'new')}
            className="px-4 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors cursor-pointer"
          >
            {t('dashboard.newClient')}
          </button>
          <button
            onClick={() => onNavigate('orders', 'new')}
            className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors cursor-pointer"
          >
            {t('dashboard.newOrder')}
          </button>
        </div>
      </div>
      
      {/* KPI Cards */}
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">Key Performance Indicators</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 min-w-0">
          {isLoading ? (
            // Loading state with skeleton cards matching exact dimensions
            <>
              <div className="bg-white rounded-xl border border-[#E4E7E7] p-6 min-w-0 h-full">
                <div className="flex items-start justify-between mb-2 min-h-[1.5rem]">
                  <Skeleton className="h-4 w-24 flex-1 min-w-0" />
                  <Skeleton className="h-5 w-5 rounded flex-shrink-0 ml-2" />
                </div>
                <Skeleton className="h-6 w-16 mb-2 min-h-[1.5rem]" />
              </div>
              <div className="bg-white rounded-xl border border-[#E4E7E7] p-6 min-w-0 h-full">
                <div className="flex items-start justify-between mb-2 min-h-[1.5rem]">
                  <Skeleton className="h-4 w-28 flex-1 min-w-0" />
                  <Skeleton className="h-5 w-5 rounded flex-shrink-0 ml-2" />
                </div>
                <Skeleton className="h-6 w-20 mb-2 min-h-[1.5rem]" />
              </div>
              <div className="bg-white rounded-xl border border-[#E4E7E7] p-6 min-w-0 h-full">
                <div className="flex items-start justify-between mb-2 min-h-[1.5rem]">
                  <Skeleton className="h-4 w-32 flex-1 min-w-0" />
                  <Skeleton className="h-5 w-5 rounded flex-shrink-0 ml-2" />
                </div>
                <Skeleton className="h-6 w-16 mb-2 min-h-[1.5rem]" />
              </div>
              <div className="bg-white rounded-xl border border-[#E4E7E7] p-6 min-w-0 h-full">
                <div className="flex items-start justify-between mb-2 min-h-[1.5rem]">
                  <Skeleton className="h-4 w-28 flex-1 min-w-0" />
                  <Skeleton className="h-5 w-5 rounded flex-shrink-0 ml-2" />
                </div>
                <Skeleton className="h-6 w-24 mb-2 min-h-[1.5rem]" />
              </div>
            </>
          ) : (
            <>
              <KPICard
                title={t('dashboard.openOrders')}
                value={kpiData.openOrders}
                icon={FileText}
                onClick={() => onNavigate('orders')}
              />
              <KPICard
                title={t('dashboard.awaitingInvoice')}
                value={kpiData.awaitingInvoice}
                icon={Clock}
                onClick={() => onNavigate('orders')}
              />
              <KPICard
                title={t('dashboard.proposalOrders')}
                value={kpiData.proposalOrders}
                icon={FileText}
                onClick={() => onNavigate('orders')}
              />
              <KPICard
                title={t('dashboard.thisMonthRevenue')}
                value={formatCurrency(kpiData.monthRevenue)}
                icon={DollarSign}
              />
            </>
          )}
        </div>
      </section>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Orders */}
        <section aria-labelledby="recent-orders-heading">
          <div className="bg-white rounded-xl border border-[#E4E7E7]">
            <div className="px-6 py-4 border-b border-[#E4E7E7] flex items-center justify-between">
              <h2 id="recent-orders-heading" className="text-[#1E2025]">
                {t('dashboard.recentOrders')}
              </h2>
              <button
                onClick={() => onNavigate('orders')}
                className="text-[#1F744F] hover:text-[#165B3C] transition-colors cursor-pointer"
              >
                {t('common.viewAll')}
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
                          <Skeleton className="h-5 w-20" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </div>
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentOrders.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-[#7C8085] mb-4">{t('dashboard.noOrders')}</p>
                  <button
                    onClick={() => onNavigate('orders', 'new')}
                    className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors cursor-pointer"
                  >
                    {t('dashboard.createFirstOrder')}
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
                      className="w-full px-6 py-4 hover:bg-[#F7F8F8] transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-[#1E2025] mb-1">{order.id}</p>
                          <p className="text-[#7C8085]">{order.orderTitle || '-'}</p>
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
                {t('dashboard.recentClients')}
              </h2>
              <button
                onClick={() => onNavigate('clients')}
                className="text-[#1F744F] hover:text-[#165B3C] transition-colors cursor-pointer"
              >
                {t('common.viewAll')}
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
                          <Skeleton className="h-5 w-20" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentClients.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-[#7C8085] mb-4">{t('dashboard.noClients')}</p>
                  <button
                    onClick={() => onNavigate('clients', 'new')}
                    className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors cursor-pointer"
                  >
                    {t('dashboard.addFirstClient')}
                  </button>
                </div>
              ) : (
                recentClients.map(client => {
                  const clientOrders = orders.filter(o => o.clientId === client.id);
                  
                  return (
                    <button
                      key={client.id}
                      onClick={() => onNavigate('client-detail', client.id)}
                      className="w-full px-6 py-4 hover:bg-[#F7F8F8] transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-[#1E2025] mb-1">{client.company}</p>
                          {client.name && client.name !== 'Unknown' && (
                            <p className="text-[#7C8085]">{client.name}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[#7C8085]">
                        <span>{client.email}</span>
                        <span>{clientOrders.length} {t('dashboard.orders')}</span>
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
