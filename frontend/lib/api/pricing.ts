import apiClient from './client';
import {
  RecalculateRequest,
  RecalculateResponse,
} from '@/types';

export const pricingApi = {
  /**
   * Recalculate pricing based on updated positions and rates
   */
  recalculate: async (data: RecalculateRequest): Promise<RecalculateResponse> => {
    const response = await apiClient.post<RecalculateResponse>(
      '/pricing/recalculate',
      data
    );
    return response.data;
  },

  /**
   * Export proposal to Excel file using proposal ID
   */
  exportToExcel: async (proposalId: string): Promise<Blob> => {
    const response = await apiClient.get(`/excel/generate-from-proposal/${proposalId}`, {
      responseType: 'blob',
    });
    return response.data;
  },
};
