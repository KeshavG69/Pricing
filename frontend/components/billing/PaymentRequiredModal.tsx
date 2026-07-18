'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { useBillingStore } from '@/lib/stores/billingStore';
import { StripeProvider } from './StripeProvider';
import { PaymentMethodForm } from './PaymentMethodForm';
import { CreditCard, ShieldAlert, Settings } from 'lucide-react';
import { pricing } from '@/lib/config';

/**
 * PaymentRequiredModal - Blocks proposal upload if no payment method.
 * Cannot be skipped - user MUST add payment or go to settings.
 * Shows different content for admins vs regular users.
 */
export function PaymentRequiredModal() {
  const router = useRouter();
  const {
    showPaymentRequiredModal,
    setShowPaymentRequiredModal,
    status,
    setupIntentClientSecret,
    createSetupIntent,
    isCreatingSetupIntent,
    error,
  } = useBillingStore();

  const [showForm, setShowForm] = useState(false);

  const isAdmin = status?.is_admin || false;

  // Create setup intent when admin wants to add card
  const handleAddCard = async () => {
    const clientSecret = await createSetupIntent();
    if (clientSecret) {
      setShowForm(true);
    }
  };

  const handleSuccess = () => {
    setShowForm(false);
    setShowPaymentRequiredModal(false);
  };

  const handleGoToSettings = () => {
    setShowPaymentRequiredModal(false);
    router.push('/dashboard/settings/organization?tab=billing');
  };

  // Close without allowing bypass - just hide the modal
  // User still can't upload without payment
  const handleClose = () => {
    setShowPaymentRequiredModal(false);
  };

  if (!showPaymentRequiredModal) {
    return null;
  }

  return (
    <Dialog
      isOpen={showPaymentRequiredModal}
      onClose={handleClose}
      title={showForm ? 'Add Payment Method' : 'Payment Required'}
      size="md"
    >
      {!showForm ? (
        <div className="space-y-6">
          {/* Warning Icon and Message */}
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">
                Payment method required to create proposals
              </h3>
              <p className="text-sm text-muted-foreground">
                {isAdmin
                  ? 'Please add a payment method to enable proposal creation for your organization.'
                  : 'Your organization doesn\'t have a payment method configured. Please contact your administrator.'}
              </p>
            </div>
          </div>

          {/* Pricing Info */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-medium text-sm text-foreground mb-2">Pricing:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Basic proposal: <strong>{pricing.basic}</strong></li>
              <li>• Advanced analysis: <strong>{pricing.advanced}</strong></li>
            </ul>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          {isAdmin ? (
            // Admin view - can add payment method
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleGoToSettings}
                className="flex-1"
              >
                <Settings className="w-4 h-4 mr-2" />
                Go to Settings
              </Button>
              <Button
                variant="primary"
                onClick={handleAddCard}
                isLoading={isCreatingSetupIntent}
                className="flex-1"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Add Payment Method
              </Button>
            </div>
          ) : (
            // Regular user view - contact admin
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  Only administrators can add payment methods. Please contact your organization admin to set up billing.
                </p>
              </div>
              <Button variant="outline" onClick={handleClose} fullWidth>
                Close
              </Button>
            </div>
          )}
        </div>
      ) : (
        // Card form view (admin only)
        <StripeProvider clientSecret={setupIntentClientSecret || undefined}>
          <PaymentMethodForm
            onSuccess={handleSuccess}
            onCancel={() => setShowForm(false)}
          />
        </StripeProvider>
      )}
    </Dialog>
  );
}

export default PaymentRequiredModal;
