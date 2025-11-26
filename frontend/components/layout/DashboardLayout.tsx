'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/authStore';
import { FileText, LogOut, Plus, Settings, LayoutGrid } from 'lucide-react';
import Button from '../ui/Button';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
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

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-950/50 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-slate-800">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-2xl bg-slate-50 text-slate-900 flex items-center justify-center text-xs tracking-tight font-semibold">
              PI
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-slate-50">PriceIQ</span>
              <span className="text-xs text-slate-400">Pricing Intelligence</span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          <Link href="/dashboard">
            <div className="flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-300 hover:text-slate-50 hover:bg-slate-900/50 transition-colors">
              <LayoutGrid className="w-5 h-5" />
              <span className="text-sm font-medium">Dashboard</span>
            </div>
          </Link>

          <Link href="/dashboard/proposals">
            <div className="flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-300 hover:text-slate-50 hover:bg-slate-900/50 transition-colors">
              <FileText className="w-5 h-5" />
              <span className="text-sm font-medium">Proposals</span>
            </div>
          </Link>

          <Link href="/dashboard/upload">
            <div className="flex items-center space-x-3 px-3 py-2 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors">
              <Plus className="w-5 h-5" />
              <span className="text-sm font-medium">New Proposal</span>
            </div>
          </Link>

          <div className="pt-4">
            <Link href="/dashboard/settings">
              <div className="flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-300 hover:text-slate-50 hover:bg-slate-900/50 transition-colors">
                <Settings className="w-5 h-5" />
                <span className="text-sm font-medium">Settings</span>
              </div>
            </Link>
          </div>
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-50 truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={handleLogout}
            className="justify-start"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
