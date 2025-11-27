'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/authStore';
import { FileText, LogOut, Plus, Settings, LayoutGrid, ChevronRight } from 'lucide-react';
import Button from '../ui/Button';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

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
    <div className="min-h-screen flex bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
      {/* Sidebar */}
      <aside className="w-72 border-r border-slate-800/50 bg-slate-950/30 backdrop-blur-xl flex flex-col fixed inset-y-0 z-50">
        {/* Logo */}
        <div className="p-6">
          <Link href="/dashboard" className="flex items-center space-x-3 group">
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-slate-50 group-hover:text-sky-400 transition-colors">PriceIQ</span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          <div className="mb-6 px-2">
            <Link href="/dashboard/upload">
              <Button variant="primary" fullWidth className="shadow-lg shadow-sky-500/20">
                <Plus className="w-4 h-4 mr-2" />
                New Proposal
              </Button>
            </Link>
          </div>

          <div className="space-y-1">
            <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Menu</p>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
                      isActive
                        ? 'bg-sky-500/10 text-sky-400'
                        : 'text-slate-400 hover:text-slate-50 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className={`w-5 h-5 ${isActive ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-400'}`} />
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4 text-sky-500/50" />}
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-slate-800/50 bg-slate-900/20">
          <div className="flex items-center space-x-3 mb-4 px-2">
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center border border-slate-600 shadow-inner">
              <span className="text-sm font-semibold text-slate-100">
                {user.firstName[0]}{user.lastName[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-50 truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={handleLogout}
            className="justify-start text-slate-400 hover:text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-72 p-8 overflow-auto">
        <div className="max-w-7xl mx-auto animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
