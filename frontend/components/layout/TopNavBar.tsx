'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { BarChart3, LayoutGrid, FileText, Settings, Building, Building2, Mail, Users, Menu, ChevronDown } from 'lucide-react';
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
  ];

  const adminNavItems = [
    { href: '/dashboard/settings/organization', label: 'Organization', icon: Building },
    { href: '/dashboard/company-repository', label: 'Company Repo', icon: Building2 },
    { href: '/dashboard/invitations', label: 'Invitations', icon: Mail },
    { href: '/dashboard/team', label: 'Team', icon: Users },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-50">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Left: Mobile sidebar toggle + Logo */}
        <div className="flex items-center gap-3">
          {/* Mobile sidebar toggle */}
          <button
            onClick={onMobileSidebarToggle}
            className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
              <BarChart3 className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground hidden sm:inline">
              PriceIQ
            </span>
          </Link>
        </div>

        {/* Center/Right: Navigation items */}
        <nav className="flex items-center gap-1">
          {/* Main nav items */}
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm hidden sm:inline">{item.label}</span>
                </div>
              </Link>
            );
          })}

          {/* Settings */}
          <Link href="/dashboard/settings">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                pathname === '/dashboard/settings'
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">Settings</span>
            </div>
          </Link>

          {/* Admin nav items */}
          {isAdmin(user) && (
            <>
              {/* Desktop: Show all admin items */}
              <div className="hidden lg:flex items-center gap-1">
                {adminNavItems.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-sm">{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Mobile/Tablet: Admin dropdown */}
              <div className="lg:hidden relative group">
                <button
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
                >
                  <Building className="w-4 h-4" />
                  <span className="text-sm hidden sm:inline">Admin</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {/* Dropdown menu */}
                <div className="hidden group-hover:block absolute top-full right-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
                  {adminNavItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.href} href={item.href}>
                        <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <Icon className="w-4 h-4" />
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
