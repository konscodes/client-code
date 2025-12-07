import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './components/ui/alert-dialog';

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
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [pageId, setPageId] = useState<string | undefined>(undefined);
  const [previousPage, setPreviousPage] = useState<{ page: Page; id?: string } | null>(null);
  const [orderHasUnsavedChanges, setOrderHasUnsavedChanges] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ page: string; id?: string } | null>(null);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  
  const handleNavigate = (page: string, id?: string) => {
    // If leaving order-detail with unsaved changes, show dialog
    if (currentPage === 'order-detail' && orderHasUnsavedChanges && page !== 'order-detail') {
      setPendingNavigation({ page, id });
      setShowUnsavedChangesDialog(true);
      return;
    }
    
    // Track previous page before navigation
    if (currentPage !== page as Page || pageId !== id) {
      setPreviousPage({ page: currentPage, id: pageId });
    }
    setCurrentPage(page as Page);
    setPageId(id);
    
    // Clear unsaved changes state when navigating away from order-detail
    if (currentPage === 'order-detail' && page !== 'order-detail') {
      setOrderHasUnsavedChanges(false);
    }
    
    // Scroll to top on navigation
    window.scrollTo(0, 0);
  };
  
  const handleConfirmNavigation = () => {
    if (pendingNavigation) {
      setCurrentPage(pendingNavigation.page as Page);
      setPageId(pendingNavigation.id);
      setPendingNavigation(null);
      setOrderHasUnsavedChanges(false);
    }
    setShowUnsavedChangesDialog(false);
  };
  
  const handleCancelNavigation = () => {
    setPendingNavigation(null);
    setShowUnsavedChangesDialog(false);
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
        return <OrdersList onNavigate={handleNavigate} pageId={pageId} />;
      
      case 'order-detail':
        return <OrderDetail orderId={pageId || 'new'} onNavigate={handleNavigate} previousPage={previousPage} onUnsavedChangesChange={setOrderHasUnsavedChanges} />;
      
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
      <Toaster position="bottom-right" />
      
      {/* Unsaved Changes Dialog */}
      <AlertDialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
        <AlertDialogContent className="bg-white border border-[#E4E7E7]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E2025]">
              {t('orderDetail.unsavedChangesTitle') || 'Unsaved Changes'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#555A60]">
              {t('orderDetail.unsavedChangesWarning') || 'All unsaved changes will be lost. Are you sure you want to leave?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel
              onClick={handleCancelNavigation}
              className="bg-[#E4E7E7] text-[#1E2025] hover:bg-[#D2D6D6] m-0"
            >
              {t('common.cancel') || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmNavigation}
              className="bg-[#1F744F] text-white hover:bg-[#165B3C] m-0"
            >
              {t('orderDetail.leaveWithoutSaving') || 'Leave'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
