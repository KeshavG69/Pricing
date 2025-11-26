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
import { Plus, FileText, Clock, CheckCircle, AlertCircle, Trash2, Copy } from 'lucide-react';
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

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Processing...';
      case 'error':
        return 'Error';
      default:
        return 'Draft';
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
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-50 mb-2">Dashboard</h1>
            <p className="text-slate-400">Manage your pricing proposals</p>
          </div>
          <Link href="/dashboard/upload">
            <Button variant="primary">
              <Plus className="w-4 h-4 mr-2" />
              New Proposal
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Total Proposals</p>
                  <p className="text-2xl font-semibold text-slate-50">{proposals.length}</p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-slate-800 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-slate-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Completed</p>
                  <p className="text-2xl font-semibold text-emerald-400">
                    {proposals.filter((p) => p.status === 'completed').length}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Processing</p>
                  <p className="text-2xl font-semibold text-sky-400">
                    {proposals.filter((p) => p.status === 'processing').length}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-sky-500/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-sky-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Proposals */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Proposals</CardTitle>
            <CardDescription>Your latest pricing proposals</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-slate-400">Loading proposals...</div>
            ) : proposals.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 mb-4">No proposals yet</p>
                <Link href="/dashboard/upload">
                  <Button variant="primary">
                    <Plus className="w-4 h-4 mr-2" />
                    Create your first proposal
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {proposals.slice(0, 10).map((proposal) => (
                  <div
                    key={proposal.id}
                    onClick={() => router.push(`/proposals/${proposal.id}`)}
                    className="flex items-center justify-between p-4 rounded-lg border border-slate-800 hover:border-slate-700 hover:bg-slate-900/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center space-x-4 flex-1 min-w-0">
                      {getStatusIcon(proposal.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-50 truncate">
                          {proposal.name}
                        </p>
                        {proposal.solicitation_number && (
                          <p className="text-xs text-slate-400 truncate">
                            {proposal.solicitation_number}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-6">
                      <div className="text-right">
                        <p className="text-xs text-slate-400">
                          {getStatusText(proposal.status)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDate(proposal.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={(e) =>
                            handleDuplicateClick(proposal.id, proposal.name, e)
                          }
                          className="p-2 text-slate-400 hover:text-slate-50 hover:bg-slate-800 rounded transition-colors"
                          title="Duplicate proposal"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(proposal.id, e)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete proposal"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
