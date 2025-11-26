import apiClient from './client';
import {
  Proposal,
  ProposalUpdate,
  ProposalStatus,
  UploadResponse,
  DocumentInfo,
} from '@/types';

export const proposalsApi = {
  // Upload documents and create proposal
  upload: async (files: File[]): Promise<UploadResponse> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await apiClient.post<UploadResponse>(
      '/proposals/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  // Get proposal status (lightweight for polling)
  getStatus: async (proposalId: string): Promise<ProposalStatus> => {
    const response = await apiClient.get<ProposalStatus>(
      `/proposals/${proposalId}/status`
    );
    return response.data;
  },

  // List user's proposals
  list: async (skip: number = 0, limit: number = 20): Promise<Proposal[]> => {
    const response = await apiClient.get<Proposal[]>('/proposals', {
      params: { skip, limit },
    });
    return response.data;
  },

  // Get full proposal data
  get: async (proposalId: string): Promise<Proposal> => {
    const response = await apiClient.get<Proposal>(`/proposals/${proposalId}`);
    return response.data;
  },

  // Update proposal
  update: async (
    proposalId: string,
    updates: ProposalUpdate
  ): Promise<Proposal> => {
    const response = await apiClient.patch<Proposal>(
      `/proposals/${proposalId}`,
      updates
    );
    return response.data;
  },

  // Delete proposal
  delete: async (proposalId: string): Promise<void> => {
    await apiClient.delete(`/proposals/${proposalId}`);
  },

  // Duplicate proposal
  duplicate: async (proposalId: string, newName: string): Promise<Proposal> => {
    const response = await apiClient.post<Proposal>(
      `/proposals/${proposalId}/duplicate`,
      null,
      {
        params: { new_name: newName },
      }
    );
    return response.data;
  },

  // Get proposal documents
  getDocuments: async (proposalId: string): Promise<DocumentInfo[]> => {
    const response = await apiClient.get<DocumentInfo[]>(
      `/proposals/${proposalId}/documents`
    );
    return response.data;
  },

  // Delete document
  deleteDocument: async (
    proposalId: string,
    documentIndex: number
  ): Promise<void> => {
    await apiClient.delete(
      `/proposals/${proposalId}/documents/${documentIndex}`
    );
  },
};
