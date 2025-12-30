import { create } from 'zustand';
import {
  getBillingStatus,
  createSetupIntent,
  savePaymentMethod,
  listPaymentMethods,
  deletePaymentMethod,
  setDefaultPaymentMethod,
  getBillingHistory,
  getBillingStats,
  BillingStatus,
  PaymentMethod,
  BillingRecord,
  BillingStats,
} from '../api/billing';

interface BillingState {
  // Status
  status: BillingStatus | null;
  isLoadingStatus: boolean;

  // Payment methods
  paymentMethods: PaymentMethod[];
  isLoadingPaymentMethods: boolean;

  // Setup intent for adding card
  setupIntentClientSecret: string | null;
  isCreatingSetupIntent: boolean;

  // Billing history
  billingHistory: BillingRecord[];
  billingStats: BillingStats | null;
  isLoadingHistory: boolean;

  // UI state
  showPaymentPrompt: boolean; // For admin login prompt
  showPaymentRequiredModal: boolean; // For upload gate
  error: string | null;

  // Actions
  fetchBillingStatus: () => Promise<BillingStatus | null>;
  fetchPaymentMethods: () => Promise<void>;
  createSetupIntent: () => Promise<string | null>;
  savePaymentMethod: (paymentMethodId: string) => Promise<boolean>;
  removePaymentMethod: (paymentMethodId: string) => Promise<boolean>;
  setAsDefaultPaymentMethod: (paymentMethodId: string) => Promise<boolean>;
  fetchBillingHistory: (skip?: number, limit?: number) => Promise<void>;
  fetchBillingStats: () => Promise<void>;

  // UI actions
  setShowPaymentPrompt: (show: boolean) => void;
  setShowPaymentRequiredModal: (show: boolean) => void;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  status: null,
  isLoadingStatus: false,
  paymentMethods: [],
  isLoadingPaymentMethods: false,
  setupIntentClientSecret: null,
  isCreatingSetupIntent: false,
  billingHistory: [],
  billingStats: null,
  isLoadingHistory: false,
  showPaymentPrompt: false,
  showPaymentRequiredModal: false,
  error: null,
};

export const useBillingStore = create<BillingState>((set, get) => ({
  ...initialState,

  fetchBillingStatus: async () => {
    try {
      set({ isLoadingStatus: true, error: null });
      const status = await getBillingStatus();
      set({ status, isLoadingStatus: false });

      // If admin and no payment method, show prompt
      if (status.is_admin && !status.has_payment_method && status.stripe_configured) {
        set({ showPaymentPrompt: true });
      }

      return status;
    } catch (error: any) {
      console.error('Failed to fetch billing status:', error);
      set({
        error: error.response?.data?.detail || 'Failed to fetch billing status',
        isLoadingStatus: false,
      });
      return null;
    }
  },

  fetchPaymentMethods: async () => {
    try {
      set({ isLoadingPaymentMethods: true, error: null });
      const methods = await listPaymentMethods();
      set({ paymentMethods: methods, isLoadingPaymentMethods: false });
    } catch (error: any) {
      console.error('Failed to fetch payment methods:', error);
      set({
        error: error.response?.data?.detail || 'Failed to fetch payment methods',
        isLoadingPaymentMethods: false,
      });
    }
  },

  createSetupIntent: async () => {
    try {
      set({ isCreatingSetupIntent: true, error: null });
      const { client_secret } = await createSetupIntent();
      set({ setupIntentClientSecret: client_secret, isCreatingSetupIntent: false });
      return client_secret;
    } catch (error: any) {
      console.error('Failed to create setup intent:', error);
      set({
        error: error.response?.data?.detail || 'Failed to create setup intent',
        isCreatingSetupIntent: false,
      });
      return null;
    }
  },

  savePaymentMethod: async (paymentMethodId: string) => {
    try {
      set({ error: null });
      await savePaymentMethod(paymentMethodId);

      // Refresh status and payment methods
      await get().fetchBillingStatus();
      await get().fetchPaymentMethods();

      // Hide prompts since payment method is now saved
      set({
        showPaymentPrompt: false,
        showPaymentRequiredModal: false,
        setupIntentClientSecret: null,
      });

      return true;
    } catch (error: any) {
      console.error('Failed to save payment method:', error);
      set({
        error: error.response?.data?.detail || 'Failed to save payment method',
      });
      return false;
    }
  },

  removePaymentMethod: async (paymentMethodId: string) => {
    try {
      set({ error: null });
      await deletePaymentMethod(paymentMethodId);

      // Refresh status and payment methods
      await get().fetchBillingStatus();
      await get().fetchPaymentMethods();

      return true;
    } catch (error: any) {
      console.error('Failed to remove payment method:', error);
      set({
        error: error.response?.data?.detail || 'Failed to remove payment method',
      });
      return false;
    }
  },

  setAsDefaultPaymentMethod: async (paymentMethodId: string) => {
    try {
      set({ error: null });
      await setDefaultPaymentMethod(paymentMethodId);

      // Refresh status and payment methods
      await get().fetchBillingStatus();
      await get().fetchPaymentMethods();

      return true;
    } catch (error: any) {
      console.error('Failed to set default payment method:', error);
      set({
        error: error.response?.data?.detail || 'Failed to set default payment method',
      });
      return false;
    }
  },

  fetchBillingHistory: async (skip = 0, limit = 50) => {
    try {
      set({ isLoadingHistory: true, error: null });
      const { records } = await getBillingHistory(skip, limit);
      set({ billingHistory: records, isLoadingHistory: false });
    } catch (error: any) {
      console.error('Failed to fetch billing history:', error);
      set({
        error: error.response?.data?.detail || 'Failed to fetch billing history',
        isLoadingHistory: false,
      });
    }
  },

  fetchBillingStats: async () => {
    try {
      set({ error: null });
      const stats = await getBillingStats();
      set({ billingStats: stats });
    } catch (error: any) {
      console.error('Failed to fetch billing stats:', error);
      set({
        error: error.response?.data?.detail || 'Failed to fetch billing stats',
      });
    }
  },

  setShowPaymentPrompt: (show: boolean) => set({ showPaymentPrompt: show }),
  setShowPaymentRequiredModal: (show: boolean) => set({ showPaymentRequiredModal: show }),
  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}));
