// Main application layout with sidebar and header
import { ReactNode, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Briefcase, 
  Layers, 
  Settings,
  LogOut,
  BarChart,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { Button } from './ui/button';

interface AppLayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function AppLayout({ children, currentPage, onNavigate }: AppLayoutProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  
  // Sidebar collapse state with localStorage persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);
  
  const navigationItems = [
    { id: 'dashboard', label: t('navigation.dashboard'), icon: LayoutDashboard },
    { id: 'analytics', label: t('navigation.analytics'), icon: BarChart },
    { id: 'clients', label: t('navigation.clients'), icon: Users },
    { id: 'orders', label: t('navigation.orders'), icon: FileText },
    { id: 'job-catalog', label: t('navigation.jobCatalog'), icon: Briefcase },
    { id: 'presets', label: t('navigation.presets'), icon: Layers },
    { id: 'settings', label: t('navigation.settings'), icon: Settings },
  ];
  
  const handleLogout = async () => {
    await signOut();
  };
  
  const userInitials = user?.email 
    ? user.email.substring(0, 2).toUpperCase()
    : 'U';
  const userEmail = user?.email || 'User';
  const userName = user?.user_metadata?.name || userEmail.split('@')[0];
  
  const logoText = t('common.logo');
  const logoFirstWord = logoText.split(' ')[0];
  
  return (
    <div className="flex min-h-screen bg-[#F7F8F8]">
      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarCollapsed ? 'w-16' : 'w-64'
        } bg-white border-r border-[#E4E7E7] flex flex-col transition-all duration-300 ease-in-out`}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo/Brand */}
        <div className={`p-6 border-b border-[#E4E7E7] ${
          isSidebarCollapsed ? 'flex flex-col items-center gap-2' : 'flex items-center justify-between'
        }`}>
          <div className={isSidebarCollapsed ? '' : 'flex-1'}>
            {!isSidebarCollapsed && (
              <h1 className="text-[#1E2025] mb-2">
                {logoText}
              </h1>
            )}
            {isSidebarCollapsed && (
              <h1 className="text-[#1E2025] mb-2">
                {logoFirstWord}
              </h1>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="size-7 shrink-0"
            aria-label="Toggle sidebar"
          >
            {isSidebarCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronLeft size={16} />
            )}
          </Button>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-1" role="list">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center ${
                      isSidebarCollapsed ? 'justify-center' : 'gap-3'
                    } px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                      isActive 
                        ? 'bg-[#E8F5E9] text-[#1F744F]' 
                        : 'text-[#555A60] hover:bg-[#F2F4F4]'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                    title={isSidebarCollapsed ? item.label : undefined}
                  >
                    <Icon size={20} aria-hidden="true" />
                    {!isSidebarCollapsed && <span>{item.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        
        {/* Footer */}
        <div className="p-4 border-t border-[#E4E7E7] space-y-2">
          {isSidebarCollapsed ? (
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-[#1F744F] flex items-center justify-center text-white text-sm font-medium">
                {userInitials}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-[#1F744F] flex items-center justify-center text-white text-sm font-medium">
                {userInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#1E2025] truncate text-sm font-medium">{userName}</p>
                <p className="text-[#7C8085] text-xs truncate">{userEmail}</p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className={`w-full ${
              isSidebarCollapsed ? 'justify-center' : 'justify-start'
            } text-[#555A60] hover:text-[#1E2025] hover:bg-[#F2F4F4]`}
            title={isSidebarCollapsed ? t('common.signOut') : undefined}
          >
            <LogOut size={16} className={isSidebarCollapsed ? '' : 'mr-2'} />
            {!isSidebarCollapsed && t('common.signOut')}
          </Button>
        </div>
      </aside>
      
      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Page content */}
        <div className="flex-1 p-8 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
