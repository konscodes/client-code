// Main application layout with sidebar and header
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Briefcase, 
  Layers, 
  Settings,
  LogOut,
  BarChart
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
  
  return (
    <div className="flex min-h-screen bg-[#F7F8F8]">
      {/* Sidebar */}
      <aside 
        className="w-64 bg-white border-r border-[#E4E7E7] flex flex-col"
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo/Brand */}
        <div className="p-6 border-b border-[#E4E7E7]">
          <h1 className="text-[#1E2025]">
            {t('common.logo')}
          </h1>
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
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                      isActive 
                        ? 'bg-[#E8F5E9] text-[#1F744F]' 
                        : 'text-[#555A60] hover:bg-[#F2F4F4]'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        
        {/* Footer */}
        <div className="p-4 border-t border-[#E4E7E7] space-y-2">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-[#1F744F] flex items-center justify-center text-white text-sm font-medium">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[#1E2025] truncate text-sm font-medium">{userName}</p>
              <p className="text-[#7C8085] text-xs truncate">{userEmail}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-[#555A60] hover:text-[#1E2025] hover:bg-[#F2F4F4]"
          >
            <LogOut size={16} className="mr-2" />
            {t('common.signOut')}
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
