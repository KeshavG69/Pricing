import apiClient from './client';
import {
  RecalculateRequest,
  RecalculateResponse,
  PTWSuggestResponse,
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

  /**
   * Suggest a Price-to-Win target from comparable past awards + bottom-up
   * proposal scope. Backend reads NAICS/agency/scope_keywords saved on the
   * proposal during upload, so this only needs the proposal ID. Optionally
   * override keywords for ad-hoc refinement.
   */
  suggestPTW: async (
    proposalId: string,
    keywords?: string[]
  ): Promise<PTWSuggestResponse> => {
    const response = await apiClient.post<PTWSuggestResponse>(
      '/pricing/ptw/suggest',
      { proposal_id: proposalId, keywords }
    );
    return response.data;
  },
};
