'use client';

import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { useBillingStore } from '@/lib/stores/billingStore';
import { StripeProvider } from './StripeProvider';
import { PaymentMethodForm } from './PaymentMethodForm';
import { CreditCard, AlertCircle } from 'lucide-react';
import { pricing } from '@/lib/config';

/**
 * AddPaymentPrompt - Shows for admins who haven't configured payment.
 * Appears every time admin logs in until payment is configured.
 * Can be dismissed (skipped) but will show again on next login.
 */
export function AddPaymentPrompt() {
  const {
    showPaymentPrompt,
    setShowPaymentPrompt,
    status,
    setupIntentClientSecret,
    createSetupIntent,
    isCreatingSetupIntent,
  } = useBillingStore();

  const [showForm, setShowForm] = useState(false);

  // Create setup intent when user wants to add card
  const handleAddCard = async () => {
    const clientSecret = await createSetupIntent();
    if (clientSecret) {
      setShowForm(true);
    }
  };

  const handleSuccess = () => {
    setShowForm(false);
    setShowPaymentPrompt(false);
  };

  const handleSkip = () => {
    setShowPaymentPrompt(false);
  };

  // Don't show if billing status not loaded or already has payment
  if (!status || status.has_payment_method || !status.is_admin || !status.stripe_configured) {
    return null;
  }

  return (
    <Dialog
      isOpen={showPaymentPrompt}
      onClose={handleSkip}
      title={showForm ? 'Add Payment Method' : 'Set Up Billing'}
      size="md"
    >
      {!showForm ? (
        // Initial prompt view
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 rounded-lg">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">
                Payment method required
              </h3>
              <p className="text-sm text-muted-foreground">
                To create proposals, your organization needs a payment method on file.
                You&apos;ll be charged <strong>{pricing.basic}</strong> per proposal processed.
              </p>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-medium text-sm text-foreground mb-2">How billing works:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Basic proposal processing: {pricing.basic}</li>
              <li>• Advanced analysis: {pricing.advanced} (optional)</li>
              <li>• Charged automatically after processing</li>
              <li>• All organization members can create proposals</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleSkip} className="flex-1">
              Skip for now
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
        </div>
      ) : (
        // Card form view
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

export default AddPaymentPrompt;
