'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Plus, LogOut, Settings, ChevronRight, X, MoreVertical, Pencil, Trash2, Share2, XCircle, CheckCircle, RotateCcw } from 'lucide-react';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { proposalsApi } from '@/lib/api/proposals';
import WorkspaceSwitcher from '../workspace/WorkspaceSwitcher';
import RoleBadge from '../ui/RoleBadge';
import Button from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import Input from '../ui/Input';
import { useToast } from '@/lib/hooks/useToast';
import { ShareOrInviteModal } from '../proposals/ShareOrInviteModal';

interface ProposalsSidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

const getStatusColor = (status: string, businessStatus?: string) => {
  // Business status colors for completed proposals
  if (status === 'completed' && businessStatus) {
    switch (businessStatus) {
      case 'active':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'no-bid':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'submitted':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }
  }

  // Technical status colors
  switch (status) {
    case 'processing':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'error':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

const getStatusLabel = (status: string, businessStatus?: string) => {
  if (status === 'completed' && businessStatus) {
    switch (businessStatus) {
      case 'active': return 'Active';
      case 'no-bid': return 'No-Bid';
      case 'submitted': return 'Submitted';
    }
  }

  switch (status) {
    case 'processing': return 'Processing';
    case 'error': return 'Error';
    default: return 'Draft';
  }
};

export default function ProposalsSidebar({ isMobileOpen, onMobileClose }: ProposalsSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { user, logout } = useAuthStore();
  const { proposals, fetchProposals, deleteProposal } = useProposalsStore();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  // Three-dots menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Rename modal state
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameProposalId, setRenameProposalId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteProposalId, setDeleteProposalId] = useState<string | null>(null);
  const [deleteProposalName, setDeleteProposalName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareProposalId, setShareProposalId] = useState<string | null>(null);
  const [shareProposalName, setShareProposalName] = useState('');

  // Fetch proposals on mount (force refresh to get latest data)
  useEffect(() => {
    if (user) {
      fetchProposals(true); // Force refresh on page load
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
      // Close three-dots menu when clicking outside
      if (openMenuId && !target.closest('.proposal-menu-container')) {
        setOpenMenuId(null);
      }
    };

    if (isProfileMenuOpen || openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen, openMenuId]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  // Open rename modal
  const handleOpenRename = (proposalId: string, currentName: string) => {
    setRenameProposalId(proposalId);
    setRenameValue(currentName);
    setRenameModalOpen(true);
    setOpenMenuId(null);
  };

  // Handle rename submit
  const handleRename = async () => {
    if (!renameProposalId || !renameValue.trim()) return;

    setIsRenaming(true);
    try {
      await proposalsApi.update(renameProposalId, { name: renameValue.trim() });
      await fetchProposals();
      setRenameModalOpen(false);
      toast.success('Proposal renamed');
    } catch (error) {
      console.error('Failed to rename proposal:', error);
      toast.error('Failed to rename proposal');
    } finally {
      setIsRenaming(false);
    }
  };

  // Open delete confirmation
  const handleOpenDelete = (proposalId: string, proposalName: string) => {
    setDeleteProposalId(proposalId);
    setDeleteProposalName(proposalName);
    setDeleteDialogOpen(true);
    setOpenMenuId(null);
  };

  // Open share modal
  const handleOpenShare = (proposalId: string, proposalName: string) => {
    setShareProposalId(proposalId);
    setShareProposalName(proposalName);
    setShareModalOpen(true);
    setOpenMenuId(null);
  };

  // Handle delete confirm
  const handleDelete = async () => {
    if (!deleteProposalId) return;

    setIsDeleting(true);
    try {
      await deleteProposal(deleteProposalId);
      setDeleteDialogOpen(false);
      toast.success('Proposal deleted');
      // If we're on the deleted proposal's page, redirect to dashboard
      if (pathname === `/proposals/${deleteProposalId}`) {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Failed to delete proposal:', error);
      toast.error('Failed to delete proposal');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle business status change
  const handleChangeStatus = async (
    proposalId: string,
    newStatus: 'active' | 'no-bid' | 'submitted'
  ) => {
    setOpenMenuId(null);

    try {
      await proposalsApi.updateBusinessStatus(proposalId, newStatus);
      await fetchProposals();

      const label = newStatus === 'no-bid' ? 'No-Bid' :
                    newStatus === 'submitted' ? 'Submitted' : 'Active';
      toast.success(`Proposal marked as ${label}`);
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update proposal status');
    }
  };

  if (!user) return null;

  // Filter to only show active proposals (exclude submitted and no-bid)
  const activeProposals = proposals.filter(
    (p) => !p.business_status || p.business_status === 'active'
  );

  // Sort proposals by date (most recent first)
  const sortedProposals = [...activeProposals].sort(
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
            Active Proposals
          </h3>

          {activeProposals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No active proposals</p>
              <p className="text-xs mt-1">Create a new proposal</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedProposals.map((proposal) => {
                const isActive = pathname === `/proposals/${proposal.id}`;
                const isMenuOpen = openMenuId === proposal.id;
                return (
                  <div key={proposal.id} className="relative proposal-menu-container">
                    <Link href={`/proposals/${proposal.id}`}>
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
                          {/* Three-dots menu button */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenMenuId(isMenuOpen ? null : proposal.id);
                            }}
                            className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          >
                            <MoreVertical className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>

                        {proposal.solicitation_number && (
                          <p className="text-xs text-muted-foreground mb-1.5 truncate">
                            {proposal.solicitation_number}
                          </p>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${getStatusColor(
                              proposal.status,
                              proposal.business_status
                            )}`}
                          >
                            {getStatusLabel(proposal.status, proposal.business_status)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </Link>

                    {/* Dropdown menu */}
                    {isMenuOpen && (
                      <div className="absolute right-2 top-8 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                        <button
                          onClick={() => handleOpenRename(proposal.id, proposal.name)}
                          className="w-full flex items-center px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Rename
                        </button>
                        {user?.role === 'admin' && (
                          <button
                            onClick={() => handleOpenShare(proposal.id, proposal.name)}
                            className="w-full flex items-center px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                          >
                            <Share2 className="w-4 h-4 mr-2" />
                            Share
                          </button>
                        )}
                        {/* Status change actions - only for completed proposals */}
                        {proposal.status === 'completed' && (
                          <>
                            <div className="border-t border-border my-1" />
                            {proposal.business_status === 'active' && (
                              <>
                                <button
                                  onClick={() => handleChangeStatus(proposal.id, 'no-bid')}
                                  className="w-full flex items-center px-3 py-2 text-sm hover:bg-muted"
                                >
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Mark as No-Bid
                                </button>
                                <button
                                  onClick={() => handleChangeStatus(proposal.id, 'submitted')}
                                  className="w-full flex items-center px-3 py-2 text-sm hover:bg-muted"
                                >
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Mark as Submitted
                                </button>
                              </>
                            )}
                            {(proposal.business_status === 'no-bid' ||
                              proposal.business_status === 'submitted') && (
                              <button
                                onClick={() => handleChangeStatus(proposal.id, 'active')}
                                className="w-full flex items-center px-3 py-2 text-sm hover:bg-muted"
                              >
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Revert to Active
                              </button>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => handleOpenDelete(proposal.id, proposal.name)}
                          className="w-full flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
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

      {/* Rename Modal */}
      <Dialog
        isOpen={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        title="Rename Proposal"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameModalOpen(false)} disabled={isRenaming}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRename} isLoading={isRenaming}>
              Rename
            </Button>
          </>
        }
      >
        <Input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="Enter new name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleRename();
            }
          }}
          autoFocus
        />
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Delete Proposal"
        message={`Are you sure you want to delete "${deleteProposalName}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        isLoading={isDeleting}
      />

      {/* Share Modal */}
      {shareProposalId && (
        <ShareOrInviteModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          proposalId={shareProposalId}
          proposalName={shareProposalName}
        />
      )}
    </>
  );
}
