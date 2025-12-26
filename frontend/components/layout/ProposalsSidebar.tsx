'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Plus, LogOut, Settings, ChevronRight, X } from 'lucide-react';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import WorkspaceSwitcher from '../workspace/WorkspaceSwitcher';
import RoleBadge from '../ui/RoleBadge';
import Button from '../ui/Button';

interface ProposalsSidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'processing':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'error':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'processing':
      return 'Processing';
    case 'error':
      return 'Error';
    default:
      return 'Draft';
  }
};

export default function ProposalsSidebar({ isMobileOpen, onMobileClose }: ProposalsSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { proposals, fetchProposals } = useProposalsStore();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  // Fetch proposals on mount
  useEffect(() => {
    if (user) {
      fetchProposals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.organization_id]);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isProfileMenuOpen && !target.closest('.profile-menu-container')) {
        setIsProfileMenuOpen(false);
      }
    };

    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  if (!user) return null;

  // Sort proposals by date (most recent first)
  const sortedProposals = [...proposals].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const sidebarContent = (
    <>
      {/* Workspace Switcher - Top Section */}
      <div className="border-b border-border">
        <WorkspaceSwitcher isCollapsed={false} />
      </div>

      {/* New Proposal Button */}
      <div className="p-4 border-b border-border">
        <Link href="/dashboard/upload">
          <Button variant="primary" fullWidth className="shadow-md shadow-primary/10 hover-lift transition-all duration-300">
            <Plus className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:rotate-90" />
            New Proposal
          </Button>
        </Link>
      </div>

      {/* Proposals List - Middle Section (Scrollable) */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Proposals
          </h3>

          {proposals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No proposals yet</p>
              <p className="text-xs mt-1">Create your first proposal</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedProposals.map((proposal) => {
                const isActive = pathname === `/proposals/${proposal.id}`;
                return (
                  <Link key={proposal.id} href={`/proposals/${proposal.id}`}>
                    <div
                      onClick={onMobileClose}
                      className={`group relative px-3 py-2.5 rounded-lg transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:shadow-md ${
                        isActive
                          ? 'bg-primary/10 border-l-2 border-primary shadow-sm'
                          : 'hover:bg-muted/50 border-l-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4
                          className={`text-sm font-medium truncate flex-1 ${
                            isActive ? 'text-primary' : 'text-foreground'
                          }`}
                        >
                          {proposal.name}
                        </h4>
                        {isActive && <ChevronRight className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />}
                      </div>

                      {proposal.solicitationNumber && (
                        <p className="text-xs text-muted-foreground mb-1.5 truncate">
                          {proposal.solicitationNumber}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${getStatusColor(
                            proposal.status
                          )}`}
                        >
                          {getStatusLabel(proposal.status)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* User Profile - Bottom Section */}
      <div className="p-4 border-t border-border bg-muted/30 relative profile-menu-container">
        <button
          onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
          className="w-full group"
        >
          <div className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-muted transition-all duration-300 hover:scale-[1.02]">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-border text-primary font-semibold transition-all duration-300 group-hover:scale-110 group-hover:shadow-md">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-medium text-foreground truncate transition-colors duration-200 group-hover:text-primary">
                  {user.firstName} {user.lastName}
                </p>
                <RoleBadge role={user.role} size="sm" />
              </div>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            <ChevronRight
              className={`w-4 h-4 text-muted-foreground transition-all duration-300 ${
                isProfileMenuOpen ? 'rotate-90' : ''
              }`}
            />
          </div>
        </button>

        {/* Dropdown menu */}
        {isProfileMenuOpen && (
          <div className="absolute bottom-full mb-2 left-4 right-4 bg-card border border-border rounded-lg shadow-2xl py-1 z-50 animate-scale-in">
            <Link href="/dashboard/settings">
              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  onMobileClose();
                }}
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
              className="w-full flex items-center px-4 py-2.5 text-sm text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-all duration-200 hover:translate-x-1"
            >
              <LogOut className="w-4 h-4 mr-3" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden animate-fade-in"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-16 bottom-0 left-0 w-72 bg-card/95 backdrop-blur-md border-r border-border z-40
          flex flex-col shadow-2xl
          transition-transform duration-500 ease-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Mobile close button */}
        <button
          onClick={onMobileClose}
          className="md:hidden absolute top-4 right-4 p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>

        {sidebarContent}
      </aside>
    </>
  );
}
