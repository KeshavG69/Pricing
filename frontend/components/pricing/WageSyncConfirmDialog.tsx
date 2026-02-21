'use client';

import { Dialog } from '../ui/Dialog';
import Button from '../ui/Button';

export interface WageSyncConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateAll: () => void;
  onUpdateOne: () => void;
  laborCategory: string;
  matchingCount: number;
}

export const WageSyncConfirmDialog = ({
  isOpen,
  onClose,
  onUpdateAll,
  onUpdateOne,
  laborCategory,
  matchingCount,
}: WageSyncConfirmDialogProps) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Update Wage Information"
      size="md"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onUpdateOne}
            className="flex-1"
          >
            Update Only This Position
          </Button>
          <Button
            variant="primary"
            onClick={onUpdateAll}
            className="flex-1"
          >
            Update All ({matchingCount + 1})
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          You are about to update wage information for:
        </p>
        <div className="bg-muted/50 rounded-lg p-3 border border-border">
          <p className="text-sm font-semibold text-foreground">{laborCategory}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          There {matchingCount === 1 ? 'is' : 'are'}{' '}
          <span className="font-semibold text-foreground">{matchingCount} other position{matchingCount !== 1 ? 's' : ''}</span>{' '}
          with the same labor category.
        </p>
        <p className="text-sm text-muted-foreground">
          Would you like to update all positions with this labor category, or only the one you're editing?
        </p>
      </div>
    </Dialog>
  );
};

export default WageSyncConfirmDialog;
