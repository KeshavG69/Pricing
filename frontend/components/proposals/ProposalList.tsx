import React from 'react';
import { ProposalCard } from './ProposalCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { Proposal } from '@/types';

interface ProposalListProps {
  proposals: Proposal[];
  isLoading: boolean;
  onProposalClick: (id: string) => void;
  onDuplicate: (id: string, name: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onShare?: (id: string, name: string, e: React.MouseEvent) => void;
  showShareButton?: boolean;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
}

export const ProposalList: React.FC<ProposalListProps> = ({
  proposals,
  isLoading,
  onProposalClick,
  onDuplicate,
  onDelete,
  onShare,
  showShareButton = false,
  emptyMessage = 'No proposals found',
  emptyAction,
}) => {
  if (isLoading && proposals.length === 0) {
    return (
      <div className="divide-y divide-border">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="p-4 flex items-center space-x-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground mb-4">{emptyMessage}</p>
        {emptyAction && <div>{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {proposals.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          onClick={onProposalClick}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onShare={onShare}
          showShareButton={showShareButton}
        />
      ))}
    </div>
  );
};
