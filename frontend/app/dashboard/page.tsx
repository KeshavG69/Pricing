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
import { Plus, FileText, Clock, CheckCircle, AlertCircle, Trash2, Copy, Search, Filter, MoreVertical } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';

export default function DashboardPage() {
  const router = useRouter();
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

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'processing':
        return <Clock className="w-5 h-5 text-sky-400 animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      default:
        return <FileText className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Completed
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
            Processing
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
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

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-50 mb-2">Dashboard</h1>
            <p className="text-slate-400">Welcome back, here's what's happening with your proposals.</p>
          </div>
          <Link href="/dashboard/upload">
            <Button variant="primary" className="shadow-lg shadow-sky-500/20">
              <Plus className="w-4 h-4 mr-2" />
              New Proposal
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="glass-hover">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-slate-800/50 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-slate-400" />
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-800/30 px-2 py-1 rounded-full">Total</span>
              </div>
              <p className="text-3xl font-bold text-slate-50 mb-1">{proposals.length}</p>
              <p className="text-sm text-slate-400">Active proposals</p>
            </CardContent>
          </Card>

          <Card className="glass-hover">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="text-xs font-medium text-emerald-500/80 bg-emerald-500/10 px-2 py-1 rounded-full">Completed</span>
              </div>
              <p className="text-3xl font-bold text-slate-50 mb-1">
                {proposals.filter((p) => p.status === 'completed').length}
              </p>
              <p className="text-sm text-slate-400">Ready for review</p>
            </CardContent>
          </Card>

          <Card className="glass-hover">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-sky-400" />
                </div>
                <span className="text-xs font-medium text-sky-500/80 bg-sky-500/10 px-2 py-1 rounded-full">In Progress</span>
              </div>
              <p className="text-3xl font-bold text-slate-50 mb-1">
                {proposals.filter((p) => p.status === 'processing').length}
              </p>
              <p className="text-sm text-slate-400">Processing now</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Proposals */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-50">Recent Proposals</h2>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden border-0 bg-slate-900/40">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="text-center py-12 text-slate-400">
                  <Clock className="w-8 h-8 mx-auto mb-4 animate-pulse text-slate-600" />
                  Loading proposals...
                </div>
              ) : proposals.length === 0 ? (
                <div className="text-center py-16">
                  <div className="h-16 w-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <FileText className="w-8 h-8 text-slate-600" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-50 mb-2">No proposals yet</h3>
                  <p className="text-slate-400 mb-6 max-w-sm mx-auto">
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
                <div className="divide-y divide-slate-800/50">
                  {proposals.slice(0, 10).map((proposal) => (
                    <div
                      key={proposal.id}
                      onClick={() => router.push(`/proposals/${proposal.id}`)}
                      className="group flex items-center justify-between p-4 hover:bg-slate-800/30 transition-all duration-200 cursor-pointer"
                    >
                      <div className="flex items-center space-x-4 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-slate-800/50 flex items-center justify-center group-hover:bg-slate-800 transition-colors">
                          {getStatusIcon(proposal.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-50 truncate group-hover:text-sky-400 transition-colors">
                            {proposal.name}
                          </p>
                          {proposal.solicitation_number && (
                            <p className="text-xs text-slate-500 truncate">
                              {proposal.solicitation_number}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-6">
                        <div className="hidden sm:block text-right">
                          <p className="text-xs text-slate-500 mb-1">Status</p>
                          {getStatusBadge(proposal.status)}
                        </div>
                        <div className="text-right min-w-[80px]">
                          <p className="text-xs text-slate-500 mb-1">Created</p>
                          <p className="text-sm text-slate-400">
                            {formatDate(proposal.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) =>
                              handleDuplicateClick(proposal.id, proposal.name, e)
                            }
                            className="p-2 text-slate-400 hover:text-slate-50 hover:bg-slate-700/50 rounded-lg transition-colors"
                            title="Duplicate"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteClick(proposal.id, e)}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <MoreVertical className="w-4 h-4 text-slate-600 sm:hidden" />
                      </div>
                    </div>
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
          <p className="text-sm text-slate-400">
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
    </DashboardLayout>
  );
}
