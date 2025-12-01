import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider } from './lib/app-context';
import { AuthProvider, useAuth } from './lib/auth-context';
import { AppLayout } from './components/app-layout';
import { Login } from './pages/login';
import { Dashboard } from './pages/dashboard';
import { ClientsList } from './pages/clients-list';
import { ClientDetail } from './pages/client-detail';
import { OrdersList } from './pages/orders-list';
import { OrderDetail } from './pages/order-detail';
import { JobCatalog } from './pages/job-catalog';
import { JobPresets } from './pages/job-presets';
import { Settings } from './pages/settings';
import { Analytics } from './pages/analytics';
import { Toaster } from './components/ui/sonner';
import { Loader2 } from 'lucide-react';

// Create a QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

type Page = 
  | 'dashboard'
  | 'analytics'
  | 'clients'
  | 'client-detail'
  | 'orders'
  | 'order-detail'
  | 'job-catalog'
  | 'presets'
  | 'settings';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [pageId, setPageId] = useState<string | undefined>(undefined);
  
  const handleNavigate = (page: string, id?: string) => {
    setCurrentPage(page as Page);
    setPageId(id);
    
    // Scroll to top on navigation
    window.scrollTo(0, 0);
  };
  
  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8F8]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#1F744F]" />
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  
  // Show login if not authenticated
  if (!user) {
    return <Login />;
  }
  
  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} />;
      
      case 'analytics':
        return <Analytics onNavigate={handleNavigate} />;
      
      case 'clients':
        return <ClientsList onNavigate={handleNavigate} />;
      
      case 'client-detail':
        return <ClientDetail clientId={pageId || 'new'} onNavigate={handleNavigate} />;
      
      case 'orders':
        return <OrdersList onNavigate={handleNavigate} />;
      
      case 'order-detail':
        return <OrderDetail orderId={pageId || 'new'} onNavigate={handleNavigate} />;
      
      case 'job-catalog':
        return <JobCatalog onNavigate={handleNavigate} />;
      
      case 'presets':
        return <JobPresets onNavigate={handleNavigate} />;
      
      case 'settings':
        return <Settings onNavigate={handleNavigate} />;
      
      default:
        return <Dashboard onNavigate={handleNavigate} />;
    }
  };
  
  return (
    <AppProvider>
      <AppLayout currentPage={currentPage} onNavigate={handleNavigate}>
        {renderPage()}
      </AppLayout>
      <Toaster position="top-right" />
    </AppProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}
