'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { BarChart3, LayoutGrid, FileText, Building, Building2, Menu, ChevronDown } from 'lucide-react';
import { isAdmin } from '@/lib/utils/permissions';

interface TopNavBarProps {
  user: any;
  onMobileSidebarToggle: () => void;
}

export default function TopNavBar({ user, onMobileSidebarToggle }: TopNavBarProps) {
  const pathname = usePathname();

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
      <div className="h-full px-4 sm:px-6 flex items-center justify-between">
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

        {/* Center/Right: Navigation items */}
        <nav className="flex items-center gap-1">
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
      </div>
    </header>
  );
}
