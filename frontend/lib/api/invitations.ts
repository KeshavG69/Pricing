import apiClient from './client';
import { Invitation, InviteUserRequest, AcceptInvitationRequest, ValidateTokenResponse } from '@/types';

interface AcceptInvitationResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: any;
}

export interface InvitationStats {
  pending: number;
  accepted: number;
  expired: number;
  revoked: number;
  total: number;
}

export const invitationsApi = {
  // Send invitation (admin only)
  sendInvitation: async (data: InviteUserRequest): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/invitations', data);
    return response.data;
  },

  // List invitations with optional status filter (admin only)
  listInvitations: async (status?: 'pending' | 'accepted' | 'expired' | 'revoked'): Promise<Invitation[]> => {
    const params = status ? { status } : {};
    const response = await apiClient.get<Invitation[]>('/invitations', { params });
    return response.data;
  },

  // Get invitation statistics (admin only)
  getStats: async (): Promise<InvitationStats> => {
    const response = await apiClient.get<InvitationStats>('/invitations/stats');
    return response.data;
  },

  // Revoke invitation (admin only)
  revokeInvitation: async (invitationId: string): Promise<void> => {
    await apiClient.delete(`/invitations/${invitationId}`);
  },

  // Validate token (public)
  validateToken: async (token: string): Promise<ValidateTokenResponse> => {
    const response = await apiClient.get<ValidateTokenResponse>(`/invitations/validate/${token}`);
    return response.data;
  },

  // Accept invitation (public)
  acceptInvitation: async (data: AcceptInvitationRequest): Promise<AcceptInvitationResponse> => {
    const response = await apiClient.post<AcceptInvitationResponse>('/invitations/accept', data);
    return response.data;
  },
};
