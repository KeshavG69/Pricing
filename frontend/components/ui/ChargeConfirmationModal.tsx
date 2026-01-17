'use client';

import Dialog from './Dialog';
import Button from './Button';
import { AlertCircle, DollarSign } from 'lucide-react';

interface ChargeConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  amount: number; // in dollars
  currency?: string;
  isLoading?: boolean;
  features?: string[]; // What the user is paying for
}

export const ChargeConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  amount,
  currency = 'USD',
  isLoading = false,
  features = [],
}: ChargeConfirmationModalProps) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {isLoading ? 'Processing...' : `Confirm & Pay $${amount.toFixed(2)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Info Banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
          <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Payment Required
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {description}
            </p>
          </div>
        </div>

        {/* Charge Details */}
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">Charge Amount:</span>
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <span className="text-2xl font-bold text-foreground">
                {amount.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">{currency}</span>
            </div>
          </div>

          {/* Features List */}
          {features.length > 0 && (
            <div className="pt-3 border-t border-border">
              <p className="text-sm font-medium text-muted-foreground mb-2">What's included:</p>
              <ul className="space-y-1.5">
                {features.map((feature, index) => (
                  <li key={index} className="text-sm text-foreground flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Additional Info */}
        <p className="text-xs text-muted-foreground">
          By confirming, you authorize this charge to your payment method on file.
          You can view your billing history in your organization settings.
        </p>
      </div>
    </Dialog>
  );
};

export default ChargeConfirmationModal;
