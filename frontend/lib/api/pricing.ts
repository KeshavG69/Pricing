import apiClient from './client';
import {
  RecalculateRequest,
  RecalculateResponse,
  ExcelGenerationRequest,
} from '@/types';

export const pricingApi = {
  /**
   * Recalculate pricing based on updated positions and rates
   */
  recalculate: async (data: RecalculateRequest): Promise<RecalculateResponse> => {
    const response = await apiClient.post<RecalculateResponse>(
      '/api/pricing/recalculate',
      data
    );
    return response.data;
  },

  /**
   * Export proposal to Excel file
   */
  exportToExcel: async (data: ExcelGenerationRequest): Promise<Blob> => {
    const response = await apiClient.post('/api/excel/generate-from-data', data, {
      responseType: 'blob',
    });
    return response.data;
  },
};
