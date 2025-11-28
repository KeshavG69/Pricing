'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import Input from '@/components/ui/Input';
import { ProposalList } from '@/components/proposals/ProposalList';
import { useInfiniteScroll } from '@/lib/hooks/useInfiniteScroll';
import { Plus, Loader2, ArrowUpDown } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';

type SortOption = {
  label: string;
  sortBy: 'date' | 'name' | 'status';
  sortOrder: 'asc' | 'desc';
};

const sortOptions: SortOption[] = [
  { label: 'Newest First', sortBy: 'date', sortOrder: 'desc' },
  { label: 'Oldest First', sortBy: 'date', sortOrder: 'asc' },
  { label: 'Name A-Z', sortBy: 'name', sortOrder: 'asc' },
  { label: 'Name Z-A', sortBy: 'name', sortOrder: 'desc' },
  { label: 'Status', sortBy: 'status', sortOrder: 'asc' },
];

export default function ProposalsPage() {
  const router = useRouter();
  const {
    proposals,
    isLoading,
    hasMore,
    fetchProposalsPaginated,
    resetPagination,
    deleteProposal,
    duplicateProposal,
  } = useProposalsStore();
  const toast = useToast();

  // Sort state
  const [selectedSortIndex, setSelectedSortIndex] = useState(0);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

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

  // Load initial data
  useEffect(() => {
    resetPagination();
    fetchProposalsPaginated(false);
  }, [fetchProposalsPaginated, resetPagination]);

  // Infinite scroll callback
  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchProposalsPaginated(true);
    }
  }, [isLoading, hasMore, fetchProposalsPaginated]);

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: handleLoadMore,
    hasMore,
    isLoading,
  });

  // Sort change handler
  const handleSortChange = (index: number) => {
    const option = sortOptions[index];
    setSelectedSortIndex(index);
    setShowSortDropdown(false);
    fetchProposalsPaginated(false, option.sortBy, option.sortOrder);
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

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setProposalToDelete(null);
  };

  // Duplicate handlers
  const handleDuplicateClick = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProposalToDuplicate({ id, name });
    setDuplicateName(`${name} (Copy)`);
    setDuplicateDialogOpen(true);
  };

  const handleDuplicateConfirm = async () => {
    if (!proposalToDuplicate) return;

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

  const handleDuplicateCancel = () => {
    setDuplicateDialogOpen(false);
    setProposalToDuplicate(null);
    setDuplicateName('');
  };

  const handleProposalClick = (id: string) => {
    router.push(`/proposals/${id}`);
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-foreground mb-2">All Proposals</h1>
            <p className="text-muted-foreground">
              View and manage all your proposals
            </p>
          </div>
          <Link href="/dashboard/upload">
            <Button variant="primary">
              <Plus className="w-4 h-4 mr-2" />
              New Proposal
            </Button>
          </Link>
        </div>

        {/* Sort Controls */}
        <div className="mb-6 flex items-center justify-end">
          <div className="relative">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowUpDown className="w-4 h-4" />
              <span>Sort: {sortOptions[selectedSortIndex].label}</span>
            </button>
            {showSortDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-background border border-border rounded-lg shadow-lg z-10">
                {sortOptions.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handleSortChange(index)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      index === selectedSortIndex
                        ? 'bg-muted font-medium'
                        : ''
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Proposals List */}
        <Card>
          <CardHeader>
            <CardTitle>Proposals</CardTitle>
          </CardHeader>
          <CardContent className="pl-0">
            <ProposalList
              proposals={proposals}
              isLoading={isLoading && proposals.length === 0}
              onProposalClick={handleProposalClick}
              onDuplicate={handleDuplicateClick}
              onDelete={handleDeleteClick}
              emptyMessage="No proposals found. Create your first proposal to get started."
              emptyAction={
                <Link href="/dashboard/upload">
                  <Button variant="primary">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Proposal
                  </Button>
                </Link>
              }
            />

            {/* Infinite Scroll Sentinel */}
            <div ref={sentinelRef} className="h-4" />

            {/* Loading indicator at bottom */}
            {isLoading && proposals.length > 0 && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            )}

            {/* No more proposals message */}
            {!hasMore && proposals.length > 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                No more proposals
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Proposal"
        message="Are you sure you want to delete this proposal? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={isDeleting}
      />

      {/* Duplicate Dialog */}
      <Dialog
        isOpen={duplicateDialogOpen}
        onClose={handleDuplicateCancel}
        title="Duplicate Proposal"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter a name for the duplicated proposal
          </p>
          <Input
            type="text"
            placeholder="Proposal name"
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
            autoFocus
          />
          <div className="flex items-center justify-end space-x-3">
            <Button variant="ghost" onClick={handleDuplicateCancel}>
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
          </div>
        </div>
      </Dialog>
    </DashboardLayout>
  );
}
