import React from 'react';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Copy,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { Proposal } from '@/types';

interface ProposalCardProps {
  proposal: Proposal;
  onClick: (id: string) => void;
  onDuplicate: (id: string, name: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

export const ProposalCard = React.memo(
  ({ proposal, onClick, onDuplicate, onDelete }: ProposalCardProps) => {
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

    return (
      <div
        onClick={() => onClick(proposal.id)}
        className="group flex items-center justify-between p-4 hover:bg-muted/50 transition-all duration-200 cursor-pointer"
      >
        <div className="flex items-center space-x-4 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
            {getStatusIcon(proposal.status)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
              {proposal.name}
            </p>
            {proposal.solicitation_number && (
              <p className="text-xs text-muted-foreground truncate">
                {proposal.solicitation_number}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="hidden sm:block text-right">
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            {getStatusBadge(proposal.status)}
          </div>
          <div className="text-right min-w-[80px]">
            <p className="text-xs text-muted-foreground mb-1">Created</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(proposal.created_at)}
            </p>
          </div>
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => onDuplicate(proposal.id, proposal.name, e)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Duplicate"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => onDelete(proposal.id, e)}
              className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <MoreVertical className="w-4 h-4 text-muted-foreground sm:hidden" />
        </div>
      </div>
    );
  }
);

ProposalCard.displayName = 'ProposalCard';
