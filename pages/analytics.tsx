// Analytics page with KPI cards and charts
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../lib/app-context';
import { useFormatting } from '../lib/use-formatting';
import { KPICard } from '../components/kpi-card';
import { DateRangePicker } from '../components/date-range-picker';
import { calculateOrderTotal, formatShortNumber } from '../lib/utils';
import { Users, FileText, Clock, DollarSign } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AnalyticsProps {
  onNavigate: (page: string, id?: string) => void;
}

type TimePreset = 'this-month' | 'last-month' | 'last-quarter' | 'ytd' | 'last-year' | 'last-3-years' | 'last-5-years' | 'custom';

export function Analytics({ onNavigate }: AnalyticsProps) {
  const { t } = useTranslation();
  const { orders, clients, loading } = useApp();
  const { formatCurrency, formatDate } = useFormatting();
  
  const [timePreset, setTimePreset] = useState<TimePreset>('ytd');
  const [customDateFrom, setCustomDateFrom] = useState<Date | null>(null);
  const [customDateTo, setCustomDateTo] = useState<Date | null>(null);
  
  // Calculate date range based on selected preset
  const dateRange = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    let startDate: Date;
    let endDate: Date = now;
    
    switch (timePreset) {
      case 'this-month':
        startDate = new Date(currentYear, currentMonth, 1);
        break;
      
      case 'last-month':
        startDate = new Date(currentYear, currentMonth - 1, 1);
        endDate = new Date(currentYear, currentMonth, 0);
        break;
      
      case 'last-quarter':
        const quarterStartMonth = Math.floor(currentMonth / 3) * 3 - 3;
        startDate = new Date(currentYear, quarterStartMonth, 1);
        endDate = new Date(currentYear, quarterStartMonth + 3, 0);
        break;
      
      case 'ytd':
        startDate = new Date(currentYear, 0, 1);
        break;
      
      case 'last-year':
        startDate = new Date(currentYear - 1, 0, 1);
        endDate = new Date(currentYear - 1, 11, 31);
        break;
      
      case 'last-3-years':
        startDate = new Date(currentYear - 3, 0, 1);
        break;
      
      case 'last-5-years':
        startDate = new Date(currentYear - 5, 0, 1);
        break;
      
      case 'custom':
        startDate = customDateFrom || new Date(currentYear, 0, 1);
        endDate = customDateTo || now;
        break;
      
      default:
        startDate = new Date(currentYear, currentMonth, 1);
    }
    
    return { startDate, endDate };
  }, [timePreset, customDateFrom, customDateTo]);

  // Filter orders by updatedAt within time range
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const orderDate = order.updatedAt instanceof Date ? order.updatedAt : new Date(order.updatedAt);
      return orderDate >= dateRange.startDate && orderDate <= dateRange.endDate;
    });
  }, [orders, dateRange]);
  
  const handlePresetChange = (preset: TimePreset) => {
    setTimePreset(preset);
  };
  
  const presets: { id: TimePreset; labelKey: string }[] = [
    { id: 'ytd', labelKey: 'analytics.timePresets.ytd' },
    { id: 'this-month', labelKey: 'analytics.timePresets.thisMonth' },
    { id: 'last-month', labelKey: 'analytics.timePresets.lastMonth' },
    { id: 'last-quarter', labelKey: 'analytics.timePresets.lastQuarter' },
    { id: 'last-year', labelKey: 'analytics.timePresets.lastYear' },
    { id: 'last-3-years', labelKey: 'analytics.timePresets.last3Years' },
    { id: 'last-5-years', labelKey: 'analytics.timePresets.last5Years' },
    { id: 'custom', labelKey: 'analytics.timePresets.custom' },
  ];

  // KPI Calculations
  const kpiData = useMemo(() => {
    // Number of clients: Unique clients who have at least one order updated in time range
    const uniqueClientIds = new Set(filteredOrders.map(o => o.clientId));
    const numberOfClients = uniqueClientIds.size;

    // Number of orders: Total count of orders updated in time range
    const numberOfOrders = filteredOrders.length;

    // Orders in progress: Orders with status 'in-progress' or 'approved' updated in time range
    const ordersInProgress = filteredOrders.filter(
      o => o.status === 'in-progress' || o.status === 'approved'
    ).length;

    // Revenue total: Sum of completed/billed orders (status filter only, but order must be in filtered set)
    const revenueTotal = filteredOrders
      .filter(o => o.status === 'completed' || o.status === 'billed')
      .reduce((sum, order) => sum + calculateOrderTotal(order), 0);

    return {
      numberOfClients,
      numberOfOrders,
      ordersInProgress,
      revenueTotal,
    };
  }, [filteredOrders]);

  // Revenue per client chart data
  const revenuePerClientData = useMemo(() => {
    const clientRevenueMap = new Map<string, number>();

    filteredOrders
      .filter(o => o.status === 'completed' || o.status === 'billed')
      .forEach(order => {
        const client = clients.find(c => c.id === order.clientId);
        if (client) {
          const currentRevenue = clientRevenueMap.get(client.company) || 0;
          clientRevenueMap.set(client.company, currentRevenue + calculateOrderTotal(order));
        }
      });

    return Array.from(clientRevenueMap.entries())
      .map(([company, revenue]) => ({ company, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10); // Top 10 clients
  }, [filteredOrders, clients]);

  // Orders over time chart data
  const ordersOverTimeData = useMemo(() => {
    const monthMap = new Map<string, number>();

    filteredOrders.forEach(order => {
      const orderDate = order.updatedAt instanceof Date ? order.updatedAt : new Date(order.updatedAt);
      const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = orderDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, 0);
      }
      monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
    });

    // Convert to array and sort by date
    return Array.from(monthMap.entries())
      .map(([key, count]) => {
        const [year, month] = key.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return {
          month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          count,
          sortKey: key,
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredOrders]);

  // Revenue over time chart data
  const revenueOverTimeData = useMemo(() => {
    const monthMap = new Map<string, number>();

    filteredOrders
      .filter(o => o.status === 'completed' || o.status === 'billed')
      .forEach(order => {
        const orderDate = order.updatedAt instanceof Date ? order.updatedAt : new Date(order.updatedAt);
        const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
        const revenue = calculateOrderTotal(order);
        
        if (!monthMap.has(monthKey)) {
          monthMap.set(monthKey, 0);
        }
        monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + revenue);
      });

    // Convert to array and sort by date
    return Array.from(monthMap.entries())
      .map(([key, revenue]) => {
        const [year, month] = key.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return {
          month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          revenue,
          sortKey: key,
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredOrders]);

  // Orders per category (by order type) donut chart data
  const ordersPerCategoryData = useMemo(() => {
    const typeMap = new Map<string, number>();

    filteredOrders.forEach(order => {
      const orderType = order.orderType || 'Unknown';
      typeMap.set(orderType, (typeMap.get(orderType) || 0) + 1);
    });

    return Array.from(typeMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredOrders]);

  // Chart colors
  const CHART_COLORS = [
    '#1F744F',
    '#319B53',
    '#4CAF50',
    '#66BB6A',
    '#81C784',
    '#A5D6A7',
    '#C8E6C9',
    '#E8F5E9',
  ];

  return (
    <div className="space-y-8">
      {/* Page title and time selector */}
      <div className="space-y-4">
        <div>
          <h1 className="text-[#1E2025] mb-2">{t('analytics.title')}</h1>
          <p className="text-[#555A60]">{t('analytics.subtitle')}</p>
        </div>
        
        {/* Time Preset Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {presets.map((preset) => {
            // Show date range for custom button if dates are selected
            let buttonLabel = t(preset.labelKey);
            if (preset.id === 'custom' && customDateFrom && customDateTo) {
              const formatDate = (date: Date) => {
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              };
              buttonLabel = `${formatDate(customDateFrom)} - ${formatDate(customDateTo)}`;
            }
            
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetChange(preset.id)}
                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  timePreset === preset.id
                    ? 'bg-[#1F744F] text-white hover:bg-[#165B3C]'
                    : 'bg-white text-[#555A60] border border-[#E4E7E7] hover:bg-[#F7F8F8]'
                }`}
              >
                {buttonLabel}
              </button>
            );
          })}
        </div>
        
        {/* Custom Date Range Picker - Only show when custom is selected and dates aren't complete */}
        {timePreset === 'custom' && (!customDateFrom || !customDateTo) && (
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <DateRangePicker
              startDate={customDateFrom}
              endDate={customDateTo}
              onRangeChange={(start, end) => {
                setCustomDateFrom(start);
                setCustomDateTo(end);
              }}
            />
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">Key Performance Indicators</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 min-w-0">
          <KPICard
            title={t('analytics.kpi.numberOfClients')}
            value={kpiData.numberOfClients}
            icon={Users}
          />
          <KPICard
            title={t('analytics.kpi.numberOfOrders')}
            value={kpiData.numberOfOrders}
            icon={FileText}
          />
          <KPICard
            title={t('analytics.kpi.ordersInProgress')}
            value={kpiData.ordersInProgress}
            icon={Clock}
          />
          <KPICard
            title={t('analytics.kpi.totalRevenue')}
            value={formatCurrency(kpiData.revenueTotal)}
            icon={DollarSign}
          />
        </div>
      </section>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue per Client */}
        <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
          <h3 className="text-[#1E2025] mb-4">{t('analytics.charts.revenuePerClient')}</h3>
          {revenuePerClientData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-[#7C8085]">
              {t('common.noData')}
            </div>
          ) : (
            <div className="h-[300px] w-full" style={{ minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={revenuePerClientData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E7E7" />
                  <XAxis 
                    dataKey="company" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    tick={{ fill: '#555A60', fontSize: 12 }}
                    tickFormatter={(value: string) => {
                      // Truncate company names to 15 characters
                      if (value.length > 15) {
                        return value.substring(0, 15) + '...';
                      }
                      return value;
                    }}
                  />
                  <YAxis 
                    tick={{ fill: '#555A60', fontSize: 12 }}
                    tickFormatter={(value) => formatShortNumber(value)}
                  />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="revenue" fill="#1F744F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Orders Over Time */}
        <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
          <h3 className="text-[#1E2025] mb-4">{t('analytics.charts.ordersOverTime')}</h3>
          {ordersOverTimeData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-[#7C8085]">
              {t('common.noData')}
            </div>
          ) : (
            <div className="h-[300px] w-full" style={{ minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={ordersOverTimeData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E7E7" />
                  <XAxis 
                    dataKey="month" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    tick={{ fill: '#555A60', fontSize: 12 }}
                  />
                  <YAxis 
                    tick={{ fill: '#555A60', fontSize: 12 }}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1F744F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Revenue Over Time */}
        <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
          <h3 className="text-[#1E2025] mb-4">{t('analytics.charts.revenueOverTime')}</h3>
          {revenueOverTimeData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-[#7C8085]">
              {t('common.noData')}
            </div>
          ) : (
            <div className="h-[300px] w-full" style={{ minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={revenueOverTimeData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E7E7" />
                  <XAxis 
                    dataKey="month" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    tick={{ fill: '#555A60', fontSize: 12 }}
                  />
                  <YAxis 
                    tick={{ fill: '#555A60', fontSize: 12 }}
                    tickFormatter={(value) => formatShortNumber(value)}
                  />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="revenue" fill="#1F744F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Orders by Category */}
        <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
          <h3 className="text-[#1E2025] mb-4">{t('analytics.charts.ordersByCategory')}</h3>
          {ordersPerCategoryData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-[#7C8085]">
              {t('common.noData')}
            </div>
          ) : (
            <div className="h-[300px] w-full" style={{ minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={ordersPerCategoryData}
                    dataKey="count"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={60}
                    label={({ category, count }) => `${category}: ${count}`}
                  >
                    {ordersPerCategoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

