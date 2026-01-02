'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { BarChart3, LayoutGrid, FileText, Building, Building2, Menu, ChevronDown, Settings, LogOut } from 'lucide-react';
import { isAdmin } from '@/lib/utils/permissions';
import { useAuthStore } from '@/lib/stores/authStore';
import RoleBadge from '../ui/RoleBadge';

interface TopNavBarProps {
  user: any;
  onMobileSidebarToggle: () => void;
}

export default function TopNavBar({ user, onMobileSidebarToggle }: TopNavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
    { href: '/dashboard/proposals', label: 'Proposals', icon: FileText },
    { href: '/dashboard/company-repository', label: 'Company Rates', icon: Building2 },
  ];

  const adminNavItems = [
    { href: '/dashboard/settings/organization', label: 'Organization', icon: Building },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-card/95 backdrop-blur-md border-b border-border z-50 transition-all duration-300 animate-slide-down">
      <div className="h-full px-4 sm:px-6 grid grid-cols-3 items-center">
        {/* Left: Mobile sidebar toggle + Logo */}
        <div className="flex items-center gap-3">
          {/* Mobile sidebar toggle */}
          <button
            onClick={onMobileSidebarToggle}
            className="md:hidden p-2 rounded-lg hover:bg-muted transition-all duration-200 text-muted-foreground hover:text-foreground hover:scale-105 active:scale-95"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary text-primary-foreground transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg">
              <BarChart3 className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground hidden sm:inline transition-colors duration-200 group-hover:text-primary">
              PriceIQ
            </span>
          </Link>
        </div>

        {/* Center: Navigation items */}
        <nav className="flex items-center justify-center gap-1">
          {/* Main nav items */}
          {navItems.map((item, index) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 hover:scale-105 active:scale-95 ${
                    isActive
                      ? 'bg-primary/10 text-primary font-bold shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 font-semibold'
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                  <span className="text-lg hidden sm:inline">{item.label}</span>
                </div>
              </Link>
            );
          })}

          {/* Admin nav items */}
          {isAdmin(user) && (
            <>
              {/* Desktop: Show all admin items */}
              <div className="hidden lg:flex items-center gap-1">
                {adminNavItems.map((item, index) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 hover:scale-105 active:scale-95 ${
                          isActive
                            ? 'bg-primary/10 text-primary font-bold shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 font-semibold'
                        }`}
                        style={{ animationDelay: `${(index + 3) * 50}ms` }}
                      >
                        <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                        <span className="text-lg">{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Mobile/Tablet: Admin dropdown */}
              <div className="lg:hidden relative group">
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-300 font-semibold hover:scale-105 active:scale-95"
                >
                  <Building className="w-5 h-5" />
                  <span className="text-lg hidden sm:inline">Admin</span>
                  <ChevronDown className="w-4 h-4 transition-transform duration-300 group-hover:rotate-180" />
                </button>

                {/* Dropdown menu */}
                <div className="hidden group-hover:block absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-2xl py-2 z-50 animate-scale-in">
                  {adminNavItems.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          className="flex items-center gap-3 px-4 py-3 text-lg font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 hover:translate-x-1"
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          <Icon className="w-5 h-5" />
                          <span>{item.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </nav>

        {/* Right: User Profile Menu */}
        <div className="flex items-center justify-end">
          <div ref={profileMenuRef} className="relative">
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-all duration-200 hover:scale-105 active:scale-95 group"
          >
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border border-border text-primary font-semibold text-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="hidden md:block text-left">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate max-w-32">
                  {user.firstName} {user.lastName}
                </p>
                <RoleBadge role={user.role} size="sm" />
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-all duration-300 ${
                isProfileMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Dropdown menu */}
          {isProfileMenuOpen && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-2xl py-1 z-50 animate-scale-in">
              <Link href="/dashboard/settings">
                <button
                  onClick={() => setIsProfileMenuOpen(false)}
                  className="w-full flex items-center px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 hover:translate-x-1"
                >
                  <Settings className="w-4 h-4 mr-3" />
                  <span>Settings</span>
                </button>
              </Link>
              <div className="border-t border-border my-1" />
              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center px-4 py-2.5 text-sm text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all duration-200 hover:translate-x-1"
              >
                <LogOut className="w-4 h-4 mr-3" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
      </div>
    </header>
  );
}
