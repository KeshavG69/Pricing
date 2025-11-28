'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/authStore';
import { FileText, LogOut, Plus, Settings, LayoutGrid, ChevronRight, BarChart3, ChevronLeft, Menu } from 'lucide-react';
import Button from '../ui/Button';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push('/auth/login');
    }
  }, [user, router]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  if (!user) {
    return null; // or a loading spinner
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
    { href: '/dashboard/proposals', label: 'Proposals', icon: FileText },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-muted/10">
      {/* Sidebar */}
      <aside className={`border-r border-border bg-card flex flex-col fixed inset-y-0 z-50 transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-72'
      }`}>
        {/* Logo and Toggle */}
        <div className={`p-6 ${isCollapsed ? 'px-4' : ''}`}>
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className={`flex items-center group ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
                <BarChart3 className="w-5 h-5" />
              </div>
              {!isCollapsed && (
                <div className="flex flex-col">
                  <span className="text-xl font-bold tracking-tight text-foreground">PriceIQ</span>
                </div>
              )}
            </Link>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          <div className={`mb-6 ${isCollapsed ? 'px-0' : 'px-2'}`}>
            <Link href="/dashboard/upload">
              <Button
                variant="primary"
                fullWidth
                className={`shadow-md shadow-primary/10 ${isCollapsed ? 'px-2 justify-center' : ''}`}
              >
                <Plus className={`w-4 h-4 ${isCollapsed ? '' : 'mr-2'}`} />
                {!isCollapsed && 'New Proposal'}
              </Button>
            </Link>
          </div>

          <div className="space-y-1">
            {!isCollapsed && (
              <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Menu</p>
            )}
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} title={isCollapsed ? item.label : ''}>
                  <div
                    className={`flex items-center ${isCollapsed ? 'justify-center px-4' : 'justify-between px-4'} py-3 rounded-lg transition-all duration-200 group ${
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className={`flex items-center ${isCollapsed ? '' : 'space-x-3'}`}>
                      <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                      {!isCollapsed && <span className="text-sm">{item.label}</span>}
                    </div>
                    {isActive && !isCollapsed && <ChevronRight className="w-4 h-4 text-primary/50" />}
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-border bg-muted/30">
          {!isCollapsed && (
            <div className="flex items-center space-x-3 mb-4 px-2">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-border text-primary font-semibold">
                {user.firstName[0]}{user.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="flex justify-center mb-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-border text-primary font-semibold">
                {user.firstName[0]}{user.lastName[0]}
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={handleLogout}
            className={`text-muted-foreground hover:text-red-600 hover:bg-red-50 ${
              isCollapsed ? 'justify-center px-2' : 'justify-start'
            }`}
            title={isCollapsed ? 'Logout' : ''}
          >
            <LogOut className={`w-4 h-4 ${isCollapsed ? '' : 'mr-2'}`} />
            {!isCollapsed && 'Logout'}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 p-6 overflow-auto transition-all duration-300 ${
        isCollapsed ? 'ml-20' : 'ml-72'
      }`}>
        <div className="animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
