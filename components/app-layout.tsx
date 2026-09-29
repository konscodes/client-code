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
  ChevronRight,
  ChevronsUpDown,
  Check
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { LEGAL_ENTITIES, getLegalEntity, type WorkspaceId } from '../lib/legal-entities';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface AppLayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  workspaceId: WorkspaceId;
  onSwitchWorkspace: (id: WorkspaceId) => void;
}

export function AppLayout({ children, currentPage, onNavigate, workspaceId, onSwitchWorkspace }: AppLayoutProps) {
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
  
  const workspace = getLegalEntity(workspaceId);
  const logoText = t(workspace.labelKey);
  
  return (
    <div className="flex min-h-screen bg-[#F7F8F8]">
      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarCollapsed ? 'w-16' : 'w-64'
        } sticky top-0 h-screen shrink-0 bg-white border-r border-[#E4E7E7] flex flex-col transition-all duration-300 ease-in-out`}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo/Brand: active workspace (switched from the user menu below) */}
        <div className={`${isSidebarCollapsed ? 'px-2 py-6' : 'p-6'} border-b border-[#E4E7E7] ${
          isSidebarCollapsed ? 'flex flex-col items-center gap-2' : 'flex items-center justify-between'
        }`}>
          <h1 className={`text-[#1E2025] truncate ${isSidebarCollapsed ? '' : 'flex-1 min-w-0 mr-2'}`} title={logoText}>
            {isSidebarCollapsed ? workspace.initials : logoText}
          </h1>
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
        <nav className={`flex-1 ${isSidebarCollapsed ? 'p-2' : 'p-4'} overflow-y-auto`}>
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
        
        {/* Footer: user menu with workspace switcher and sign out */}
        <div className={`${isSidebarCollapsed ? 'px-2 py-4' : 'p-4'} border-t border-[#E4E7E7]`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`w-full flex items-center rounded-lg transition-colors cursor-pointer hover:bg-[#F2F4F4] ${
                  isSidebarCollapsed ? 'justify-center py-2' : 'gap-3 px-3 py-2 text-left'
                }`}
                aria-label={t('common.userMenu')}
                title={isSidebarCollapsed ? `${userName} · ${logoText}` : undefined}
              >
                <div className="w-8 h-8 shrink-0 rounded-full bg-[#1F744F] flex items-center justify-center text-white text-sm font-medium">
                  {userInitials}
                </div>
                {!isSidebarCollapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#1E2025] truncate text-sm font-medium">{userName}</p>
                      <p className="text-[#7C8085] text-xs truncate">{userEmail}</p>
                    </div>
                    <ChevronsUpDown size={16} className="shrink-0 text-[#7C8085]" aria-hidden="true" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={isSidebarCollapsed ? 'right' : 'top'}
              align={isSidebarCollapsed ? 'end' : 'start'}
              className="w-56 bg-white"
            >
              <DropdownMenuLabel className="text-xs text-[#7C8085]">
                {t('common.workspace')}
              </DropdownMenuLabel>
              {LEGAL_ENTITIES.map((entity) => (
                <DropdownMenuItem
                  key={entity.id}
                  onSelect={() => onSwitchWorkspace(entity.id)}
                  className="cursor-pointer"
                >
                  <span className="flex-1">{t(entity.labelKey)}</span>
                  {entity.id === workspaceId && (
                    <Check size={16} className="text-[#1F744F]" aria-hidden="true" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout} className="cursor-pointer">
                <LogOut size={16} aria-hidden="true" />
                {t('common.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
