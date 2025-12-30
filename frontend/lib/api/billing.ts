/**
 * Billing API client for Stripe payments.
 */

import { apiClient } from './client';

// Types
export interface BillingStatus {
  has_payment_method: boolean;
  can_create_proposals: boolean;
  is_admin: boolean;
  stripe_configured: boolean;
}

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

export interface SetupIntentResponse {
  client_secret: string;
  setup_intent_id: string;
}

export interface BillingRecord {
  id: string;
  organization_id: string;
  proposal_id: string;
  charge_type: 'basic' | 'advanced';
  stripe_payment_intent_id: string;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed';
  error_message: string | null;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface BillingStats {
  total_charges: number;
  successful_charges: number;
  failed_charges: number;
  pending_charges: number;
  total_amount_cents: number;
  successful_amount_cents: number;
}

export interface ProposalBilling {
  proposal_id: string;
  basic: BillingRecord | null;
  advanced: BillingRecord | null;
}

// API Functions

/**
 * Get billing status for current organization.
 */
export async function getBillingStatus(): Promise<BillingStatus> {
  const response = await apiClient.get('/billing/status');
  return response.data;
}

/**
 * Create SetupIntent for adding a payment method.
 * Admin only.
 */
export async function createSetupIntent(): Promise<SetupIntentResponse> {
  const response = await apiClient.post('/billing/setup-intent');
  return response.data;
}

/**
 * Save payment method after SetupIntent confirmation.
 * Admin only.
 */
export async function savePaymentMethod(paymentMethodId: string): Promise<{ message: string }> {
  const response = await apiClient.post('/billing/payment-methods', {
    payment_method_id: paymentMethodId,
  });
  return response.data;
}

/**
 * List all saved payment methods.
 * Admin only.
 */
export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  const response = await apiClient.get('/billing/payment-methods');
  return response.data;
}

/**
 * Delete a payment method.
 * Admin only.
 */
export async function deletePaymentMethod(paymentMethodId: string): Promise<{ message: string }> {
  const response = await apiClient.delete(`/billing/payment-methods/${paymentMethodId}`);
  return response.data;
}

/**
 * Charge for a proposal.
 */
export async function chargeForProposal(
  proposalId: string,
  chargeType: 'basic' | 'advanced'
): Promise<{
  success: boolean;
  billing_id?: string;
  payment_intent_id?: string;
  amount_cents?: number;
  already_charged?: boolean;
}> {
  const response = await apiClient.post('/billing/charge', {
    proposal_id: proposalId,
    charge_type: chargeType,
  });
  return response.data;
}

/**
 * Get billing history for organization.
 * Admin only.
 */
export async function getBillingHistory(
  skip: number = 0,
  limit: number = 50
): Promise<{ records: BillingRecord[]; count: number }> {
  const response = await apiClient.get('/billing/history', {
    params: { skip, limit },
  });
  return response.data;
}

/**
 * Get billing stats for organization.
 * Admin only.
 */
export async function getBillingStats(): Promise<BillingStats> {
  const response = await apiClient.get('/billing/stats');
  return response.data;
}

/**
 * Get billing status for a specific proposal.
 */
export async function getProposalBilling(proposalId: string): Promise<ProposalBilling> {
  const response = await apiClient.get(`/billing/proposal/${proposalId}`);
  return response.data;
}
