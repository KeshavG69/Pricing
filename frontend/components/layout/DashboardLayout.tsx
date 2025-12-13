'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/authStore';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { FileText, LogOut, Plus, Settings, LayoutGrid, ChevronRight, BarChart3, ChevronLeft, Menu, Clock, ChevronDown, Users, Mail, Building } from 'lucide-react';
import Button from '../ui/Button';
import RoleBadge from '../ui/RoleBadge';
import WorkspaceSwitcher from '../workspace/WorkspaceSwitcher';
import { isAdmin } from '@/lib/utils/permissions';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, isInitializing } = useAuthStore();
  const { proposals, fetchProposals } = useProposalsStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isRecentOpen, setIsRecentOpen] = useState(false);

  // Redirect to login if not authenticated (wait for initialization first)
  useEffect(() => {
    if (!isInitializing && !user) {
      router.push('/auth/login');
    }
  }, [user, isInitializing, router]);

  // Fetch proposals on mount
  useEffect(() => {
    if (user && proposals.length === 0) {
      fetchProposals();
    }
  }, [user, proposals.length, fetchProposals]);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isProfileMenuOpen && !target.closest('.profile-menu-container')) {
        setIsProfileMenuOpen(false);
      }
      if (isRecentOpen && !target.closest('.recent-menu-container')) {
        setIsRecentOpen(false);
      }
    };

    if (isProfileMenuOpen || isRecentOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen, isRecentOpen]);

  // Focus refresh: Fetch fresh data when user returns to tab
  useEffect(() => {
    const handleFocus = () => {
      console.log('[FOCUS] Tab gained focus, refreshing proposals...');

      // Fetch fresh proposals when user returns
      if (user) {
        fetchProposals();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, fetchProposals]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  // Show loading spinner during auth initialization
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // After initialization, if no user, return null (redirect will happen)
  if (!user) {
    return null;
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
    { href: '/dashboard/proposals', label: 'Proposals', icon: FileText },
  ];

  const adminNavItems = [
    { href: '/dashboard/team', label: 'Team', icon: Users },
    { href: '/dashboard/invitations', label: 'Invitations', icon: Mail },
    { href: '/dashboard/settings/organization', label: 'Organization', icon: Building },
  ];

  // Get last 3 proposals sorted by date
  const recentProposals = proposals
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);

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

        {/* Workspace Switcher */}
        <WorkspaceSwitcher isCollapsed={isCollapsed} />

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

          {/* Admin Navigation */}
          {isAdmin(user) && (
            <div className="space-y-1 mt-6">
              {!isCollapsed && (
                <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Admin</p>
              )}
              {adminNavItems.map((item) => {
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
          )}

          {/* Recent Section */}
          {recentProposals.length > 0 && (
            <div className="mt-6 relative recent-menu-container">
              {!isCollapsed && (
                <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent</p>
              )}
              <button
                onClick={() => setIsRecentOpen(!isRecentOpen)}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-4' : 'justify-between px-4'} py-3 rounded-lg transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted`}
                title={isCollapsed ? 'Recent Proposals' : ''}
              >
                <div className={`flex items-center ${isCollapsed ? '' : 'space-x-3'}`}>
                  <Clock className="w-5 h-5" />
                  {!isCollapsed && <span className="text-sm">Recent Proposals</span>}
                </div>
                {!isCollapsed && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${isRecentOpen ? 'rotate-180' : ''}`} />
                )}
              </button>

              {/* Recent dropdown */}
              {isRecentOpen && !isCollapsed && (
                <div className="mt-1 ml-4 space-y-1 bg-muted/30 rounded-lg p-2">
                  {recentProposals.map((proposal) => (
                    <Link key={proposal.id} href={`/proposals/${proposal.id}`}>
                      <div
                        onClick={() => setIsRecentOpen(false)}
                        className="flex flex-col px-3 py-2 rounded-md hover:bg-muted transition-colors cursor-pointer"
                      >
                        <span className="text-sm text-foreground font-medium truncate">
                          {proposal.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(proposal.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-border bg-muted/30 relative profile-menu-container">
          {/* Profile button */}
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="w-full group"
          >
            {!isCollapsed && (
              <div className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-muted transition-colors">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-border text-primary font-semibold">
                  {user.firstName[0]}{user.lastName[0]}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.firstName} {user.lastName}
                    </p>
                    <RoleBadge role={user.role} size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isProfileMenuOpen ? 'rotate-90' : ''}`} />
              </div>
            )}
            {isCollapsed && (
              <div className="flex justify-center py-2 rounded-lg hover:bg-muted transition-colors">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-border text-primary font-semibold">
                  {user.firstName[0]}{user.lastName[0]}
                </div>
              </div>
            )}
          </button>

          {/* Dropdown menu */}
          {isProfileMenuOpen && (
            <div className={`absolute bottom-full mb-2 ${isCollapsed ? 'left-2 right-2' : 'left-4 right-4'} bg-card border border-border rounded-lg shadow-lg py-1 z-50`}>
              <Link href="/dashboard/settings">
                <button
                  onClick={() => setIsProfileMenuOpen(false)}
                  className="w-full flex items-center px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Settings className="w-4 h-4 mr-3" />
                  {!isCollapsed && <span>Settings</span>}
                </button>
              </Link>
              <div className="border-t border-border my-1" />
              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center px-4 py-2.5 text-sm text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4 mr-3" />
                {!isCollapsed && <span>Logout</span>}
              </button>
            </div>
          )}
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
