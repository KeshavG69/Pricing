import apiClient from './client';
import { GSAContract, GSALaborCategory } from '@/types';

export interface UploadGSAContractResponse {
  file_id: string;
  status: string;
  message: string;
}

export interface UpdateStartDateRequest {
  contract_start_date: string;
}

export const companyRepositoryApi = {
  // List all GSA contracts for the organization
  list: async (): Promise<GSAContract[]> => {
    const response = await apiClient.get<GSAContract[]>('/company-repository');
    return response.data;
  },

  // Get a specific GSA contract by file_id
  get: async (fileId: string): Promise<GSAContract & { labor_categories: GSALaborCategory[] }> => {
    const response = await apiClient.get<GSAContract & { labor_categories: GSALaborCategory[] }>(
      `/company-repository/${fileId}`
    );
    return response.data;
  },

  // Upload a new GSA contract
  upload: async (file: File, name: string): Promise<UploadGSAContractResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);

    const response = await apiClient.post<UploadGSAContractResponse>(
      '/company-repository/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  // Update contract start date (for contracts that need_date)
  updateStartDate: async (fileId: string, startDate: string): Promise<GSAContract> => {
    const response = await apiClient.patch<GSAContract>(
      `/company-repository/${fileId}/start-date`,
      { contract_start_date: startDate }
    );
    return response.data;
  },

  // Check processing status
  getStatus: async (fileId: string): Promise<{ status: string; progress?: number; message?: string }> => {
    const response = await apiClient.get<{ status: string; progress?: number; message?: string }>(
      `/company-repository/${fileId}/status`
    );
    return response.data;
  },

  // Delete a GSA contract
  delete: async (fileId: string): Promise<void> => {
    await apiClient.delete(`/company-repository/${fileId}`);
  },
};
