import apiClient from './client';
import {
  Proposal,
  ProposalUpdate,
  ProposalStatus,
  UploadResponse,
  DocumentInfo,
  BusinessStatusAnalytics,
} from '@/types';

export interface ProposalStats {
  total: number;
  active: {
    count: number;
    value: number;
  };
  analyzed: {           // SUPERSET: Active + No-Bid combined
    count: number;
    value: number;
  };
  no_bid: {
    count: number;
    value: number;
  };
  submitted: {
    count: number;
    value: number;
  };
  processing: number;
  error: number;
}

export interface ProposalListResponse {
  proposals: Proposal[];
  total: number;
  hasMore: boolean;
  skip: number;
  limit: number;
}

export const proposalsApi = {
  // Get proposal statistics
  getStats: async (): Promise<ProposalStats> => {
    const response = await apiClient.get<ProposalStats>('/proposals/stats');
    return response.data;
  },

  // Upload documents and create proposal
  upload: async (
    files: File[],
    name: string,
    solicitationNumber?: string,
    wageSourceType?: 'bls' | 'gsa',
    wageSourceFileId?: string
  ): Promise<UploadResponse> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    formData.append('name', name);

    if (solicitationNumber) {
      formData.append('solicitation_number', solicitationNumber);
    }

    // Add wage source parameters for GSA support
    if (wageSourceType) {
      formData.append('wage_source_type', wageSourceType);
    }
    if (wageSourceFileId) {
      formData.append('wage_source_file_id', wageSourceFileId);
    }

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

  // Re-ingest documents for existing proposal (preserves mode state)
  reingest: async (
    proposalId: string,
    files: File[],
    wageSourceType?: 'bls' | 'gsa',
    wageSourceFileId?: string
  ): Promise<UploadResponse> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    // Add wage source parameters for GSA support
    if (wageSourceType) {
      formData.append('wage_source_type', wageSourceType);
    }
    if (wageSourceFileId) {
      formData.append('wage_source_file_id', wageSourceFileId);
    }

    const response = await apiClient.post<UploadResponse>(
      `/proposals/${proposalId}/reingest`,
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
  // Returns ProposalListResponse when skip=0 (with metadata), Proposal[] otherwise
  list: async (
    skip: number = 0,
    limit: number = 20,
    sortBy: 'date' | 'name' | 'status' = 'date',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<Proposal[] | ProposalListResponse> => {
    const response = await apiClient.get<Proposal[] | ProposalListResponse>('/proposals', {
      params: { skip, limit, sort_by: sortBy, sort_order: sortOrder },
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

  // Update position subcontractor hours
  // Share proposal with users (admin only)
  shareProposal: async (
    proposalId: string,
    userIds: string[]
  ): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      `/proposals/${proposalId}/share`,
      { user_ids: userIds }
    );
    return response.data;
  },

  // Make proposal private (admin only)
  makePrivate: async (proposalId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(
      `/proposals/${proposalId}/share`
    );
    return response.data;
  },

  // Get proposal access info
  getAccessInfo: async (proposalId: string): Promise<{
    visibility: string;
    shared_with: Array<{ id: string; email: string; firstName: string; lastName: string }>;
    is_owner: boolean;
  }> => {
    const response = await apiClient.get(`/proposals/${proposalId}/access`);
    return response.data;
  },

  // Mark proposal as downloaded (Excel exported)
  markDownloaded: async (proposalId: string): Promise<{ message: string; excel_downloaded: boolean }> => {
    const response = await apiClient.post(`/proposals/${proposalId}/mark-downloaded`);
    return response.data;
  },

  // Retry processing for stuck/failed proposal
  retry: async (proposalId: string): Promise<{ status: string; message: string }> => {
    const response = await apiClient.post(`/proposals/${proposalId}/retry`);
    return response.data;
  },

  // Refresh document URLs (pre-signed URLs expire after 7 days)
  refreshDocumentUrls: async (proposalId: string): Promise<Proposal> => {
    const response = await apiClient.post<Proposal>(`/proposals/${proposalId}/refresh-urls`);
    return response.data;
  },

  // Update proposal business status (active, no-bid, submitted)
  updateBusinessStatus: async (
    proposalId: string,
    businessStatus: 'active' | 'no-bid' | 'submitted'
  ): Promise<Proposal> => {
    const response = await apiClient.patch(
      `/proposals/${proposalId}/business-status`,
      null,
      { params: { business_status: businessStatus } }
    );
    return response.data;
  },

  // Get detailed analytics for specific business status
  getAnalytics: async (
    businessStatus: 'active' | 'no-bid' | 'submitted' | 'analyzed',
    skip: number = 0,
    limit: number = 100
  ): Promise<BusinessStatusAnalytics> => {
    const response = await apiClient.get(
      `/proposals/analytics/${businessStatus}`,
      { params: { skip, limit } }
    );
    return response.data;
  },
};
