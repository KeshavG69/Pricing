import React from 'react';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Copy,
  Trash2,
  MoreVertical,
  Users,
  Share2,
  Pencil,
} from 'lucide-react';
import { Proposal } from '@/types';

interface ProposalCardProps {
  proposal: Proposal;
  onClick: (id: string) => void;
  onDuplicate: (id: string, name: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onShare?: (id: string, name: string, e: React.MouseEvent) => void;
  onRename?: (id: string, name: string, e: React.MouseEvent) => void;
  showShareButton?: boolean;
}

export const ProposalCard = React.memo(
  ({ proposal, onClick, onDuplicate, onDelete, onShare, onRename, showShareButton = false }: ProposalCardProps) => {
    const getStatusIcon = (status: string, businessStatus?: string) => {
      // PRIORITY: Show business status icon if exists
      if (businessStatus) {
        switch (businessStatus) {
          case 'active':
            return <CheckCircle className="w-5 h-5 text-blue-500" />;
          case 'no-bid':
            return <AlertCircle className="w-5 h-5 text-amber-500" />;
          case 'submitted':
            return <CheckCircle className="w-5 h-5 text-emerald-500" />;
        }
      }

      // FALLBACK: Technical status icon
      switch (status) {
        case 'processing':
          return <Clock className="w-5 h-5 text-blue-500 animate-pulse" />;
        case 'error':
          return <AlertCircle className="w-5 h-5 text-red-500" />;
        case 'completed':
          return <CheckCircle className="w-5 h-5 text-emerald-500" />;
        default:
          return <FileText className="w-5 h-5 text-muted-foreground" />;
      }
    };

    const getStatusBadge = (status: string, businessStatus?: string) => {
      // PRIORITY: Show business status badge if exists
      if (businessStatus) {
        switch (businessStatus) {
          case 'active':
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                Active
              </span>
            );
          case 'no-bid':
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                No-Bid
              </span>
            );
          case 'submitted':
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                Submitted
              </span>
            );
        }
      }

      // FALLBACK: Technical status badge
      switch (status) {
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
        case 'completed':
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
              Completed
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
        className="group flex items-center justify-between p-4.5 hover:bg-muted/50 transition-all duration-200 cursor-pointer"
      >
        <div className="flex items-center space-x-4 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
            {getStatusIcon(proposal.status, proposal.business_status)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                {proposal.name}
              </p>
              {proposal.visibility === 'shared' && proposal.shared_with && proposal.shared_with.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200 flex-shrink-0">
                  <Users className="w-3 h-3 mr-1" />
                  Shared
                </span>
              )}
            </div>
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
            {getStatusBadge(proposal.status, proposal.business_status)}
          </div>
          <div className="text-right min-w-[80px]">
            <p className="text-xs text-muted-foreground mb-1">Created</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(proposal.createdAt)}
            </p>
          </div>
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onRename && (
              <button
                onClick={(e) => onRename(proposal.id, proposal.name, e)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Rename"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {showShareButton && onShare && (
              <button
                onClick={(e) => onShare(proposal.id, proposal.name, e)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Share"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
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
