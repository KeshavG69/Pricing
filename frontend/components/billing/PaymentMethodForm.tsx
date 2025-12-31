'use client';

import { useState, useEffect } from 'react';
import {
  useStripe,
  useElements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
} from '@stripe/react-stripe-js';
import { useBillingStore } from '@/lib/stores/billingStore';
import Button from '@/components/ui/Button';
import { CreditCard, Lock } from 'lucide-react';

interface PaymentMethodFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1f2937',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': {
        color: '#9ca3af',
      },
    },
    invalid: {
      color: '#ef4444',
      iconColor: '#ef4444',
    },
  },
};

export function PaymentMethodForm({ onSuccess, onCancel }: PaymentMethodFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { savePaymentMethod, setupIntentClientSecret, error: storeError } = useBillingStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fix: Radix Dialog sets pointer-events: none on body, blocking Stripe iframe interaction
  // Reset pointer-events when this form mounts inside a dialog
  useEffect(() => {
    // Small delay to ensure dialog has set its styles first
    const timer = setTimeout(() => {
      document.body.style.pointerEvents = '';
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !setupIntentClientSecret) {
      setError('Payment system not ready. Please try again.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const cardNumber = elements.getElement(CardNumberElement);

      if (!cardNumber) {
        throw new Error('Card element not found');
      }

      // Confirm SetupIntent with card details
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(
        setupIntentClientSecret,
        {
          payment_method: {
            card: cardNumber,
          },
        }
      );

      if (stripeError) {
        throw new Error(stripeError.message || 'Failed to save card');
      }

      if (setupIntent?.payment_method) {
        // Save payment method to our backend
        const success = await savePaymentMethod(setupIntent.payment_method as string);

        if (success) {
          onSuccess?.();
        } else {
          throw new Error(storeError || 'Failed to save payment method');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Card Number */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Card Number
        </label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="pl-11 pr-4 py-3 border border-border rounded-lg bg-background focus-within:ring-2 focus-within:ring-primary focus-within:border-primary">
            <CardNumberElement options={cardElementOptions} />
          </div>
        </div>
      </div>

      {/* Expiry and CVC */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Expiry Date
          </label>
          <div className="px-4 py-3 border border-border rounded-lg bg-background focus-within:ring-2 focus-within:ring-primary focus-within:border-primary">
            <CardExpiryElement options={cardElementOptions} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            CVC
          </label>
          <div className="relative">
            <div className="px-4 py-3 border border-border rounded-lg bg-background focus-within:ring-2 focus-within:ring-primary focus-within:border-primary">
              <CardCvcElement options={cardElementOptions} />
            </div>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              <Lock className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {(error || storeError) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error || storeError}</p>
        </div>
      )}

      {/* Security Note */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="w-3 h-3" />
        <span>Your card information is encrypted and secure</span>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          isLoading={isProcessing}
          disabled={!stripe || isProcessing}
          className="flex-1"
        >
          {isProcessing ? 'Saving...' : 'Save Card'}
        </Button>
      </div>
    </form>
  );
}

export default PaymentMethodForm;
