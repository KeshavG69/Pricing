import apiClient from './client';
import { Invitation, InviteUserRequest, AcceptInvitationRequest, ValidateTokenResponse } from '@/types';

interface AcceptInvitationResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: any;
}

export const invitationsApi = {
  // Send invitation (admin only)
  sendInvitation: async (data: InviteUserRequest): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/invitations', data);
    return response.data;
  },

  // List pending invitations (admin only)
  listInvitations: async (): Promise<Invitation[]> => {
    const response = await apiClient.get<Invitation[]>('/invitations');
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
