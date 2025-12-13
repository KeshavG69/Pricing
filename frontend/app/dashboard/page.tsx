'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import Input from '@/components/ui/Input';
import { ProposalCard } from '@/components/proposals/ProposalCard';
import ShareProposalModal from '@/components/proposals/ShareProposalModal';
import { Plus, FileText, Clock, CheckCircle, AlertCircle, Trash2, Copy, Search, Filter, MoreVertical, ChevronRight } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { isAdmin } from '@/lib/utils/permissions';
import { useAuthStore } from '@/lib/stores/authStore';

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { proposals, isLoading, fetchProposals, deleteProposal, duplicateProposal } =
    useProposalsStore();
  const toast = useToast();

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [proposalToDelete, setProposalToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Duplicate dialog state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [proposalToDuplicate, setProposalToDuplicate] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [proposalToShare, setProposalToShare] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Fetch proposals on mount and when organization changes
  useEffect(() => {
    console.log('[DASHBOARD] Fetching proposals for org:', user?.organization_id);
    fetchProposals();
  }, [fetchProposals, user?.organization_id]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'processing':
        return <Clock className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <FileText className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            Completed
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            Processing
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
            Draft
          </span>
        );
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Delete handlers
  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProposalToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!proposalToDelete) return;

    setIsDeleting(true);
    try {
      await deleteProposal(proposalToDelete);
      toast.success('Proposal deleted successfully');
      setDeleteConfirmOpen(false);
      setProposalToDelete(null);
    } catch (error) {
      toast.error('Failed to delete proposal');
    } finally {
      setIsDeleting(false);
    }
  };

  // Duplicate handlers
  const handleDuplicateClick = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProposalToDuplicate({ id, name });
    setDuplicateName(`${name} (Copy)`);
    setDuplicateDialogOpen(true);
  };

  const handleDuplicateConfirm = async () => {
    if (!proposalToDuplicate || !duplicateName.trim()) return;

    setIsDuplicating(true);
    try {
      await duplicateProposal(proposalToDuplicate.id, duplicateName);
      toast.success('Proposal duplicated successfully');
      setDuplicateDialogOpen(false);
      setProposalToDuplicate(null);
      setDuplicateName('');
    } catch (error) {
      toast.error('Failed to duplicate proposal');
    } finally {
      setIsDuplicating(false);
    }
  };

  // Share handlers
  const handleShareClick = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProposalToShare({ id, name });
    setShareModalOpen(true);
  };

  const handleShareSuccess = () => {
    // Refresh proposals to get updated sharing status
    fetchProposals();
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, here's what's happening with your proposals.</p>
          </div>
          <Link href="/dashboard/upload">
            <Button variant="primary" className="shadow-md shadow-primary/10">
              <Plus className="w-4 h-4 mr-2" />
              New Proposal
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="hover-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">Total</span>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">{proposals.length}</p>
              <p className="text-sm text-muted-foreground">Active proposals</p>
            </CardContent>
          </Card>

          <Card className="hover-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">Completed</span>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">
                {proposals.filter((p) => p.status === 'completed').length}
              </p>
              <p className="text-sm text-muted-foreground">Ready for review</p>
            </CardContent>
          </Card>

          <Card className="hover-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-full">In Progress</span>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">
                {proposals.filter((p) => p.status === 'processing').length}
              </p>
              <p className="text-sm text-muted-foreground">Processing now</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Proposals */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Recent Proposals</h2>
            <Link href="/dashboard/proposals">
              <Button variant="ghost" size="sm">
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>

          <Card className="overflow-hidden border border-border bg-card">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-4 animate-pulse text-muted-foreground/50" />
                  Loading proposals...
                </div>
              ) : proposals.length === 0 ? (
                <div className="text-center py-16">
                  <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">No proposals yet</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    Get started by creating your first pricing proposal. It only takes a few minutes.
                  </p>
                  <Link href="/dashboard/upload">
                    <Button variant="primary">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Proposal
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {proposals.slice(0, 5).map((proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      onClick={() => router.push(`/proposals/${proposal.id}`)}
                      onDuplicate={handleDuplicateClick}
                      onDelete={handleDeleteClick}
                      onShare={handleShareClick}
                      showShareButton={user ? isAdmin(user) : false}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Proposal?"
        message="This will permanently delete this proposal and all associated data. This action cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        isLoading={isDeleting}
      />

      {/* Duplicate Dialog */}
      <Dialog
        isOpen={duplicateDialogOpen}
        onClose={() => setDuplicateDialogOpen(false)}
        title="Duplicate Proposal"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDuplicateDialogOpen(false)}
              disabled={isDuplicating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleDuplicateConfirm}
              isLoading={isDuplicating}
              disabled={!duplicateName.trim()}
            >
              Duplicate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a copy of &ldquo;{proposalToDuplicate?.name}&rdquo;
          </p>
          <Input
            label="New proposal name"
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
            placeholder="Enter proposal name"
          />
        </div>
      </Dialog>

      {/* Share Proposal Modal */}
      {proposalToShare && (
        <ShareProposalModal
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setProposalToShare(null);
          }}
          proposalId={proposalToShare.id}
          proposalName={proposalToShare.name}
          onSuccess={handleShareSuccess}
        />
      )}
    </DashboardLayout>
  );
}
