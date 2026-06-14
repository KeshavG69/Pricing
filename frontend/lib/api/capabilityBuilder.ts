import apiClient from './client';
import type {
  CapabilityProfile,
  CapabilityProfileBuildRequest,
  CapabilityProfileUpdate,
  MatchDatesResponse,
  MatchesForDateResponse,
  ScanRunResponse,
} from '@/types';

/**
 * Client for /api/capability-builder/*  — RFP Radar backend.
 *
 * Profile lifecycle: build once on signup, optional patches, rebuild only
 * if the user's wins/certs change. Matches are produced by the daily Celery
 * scan (or the manual /scan/run-now trigger).
 */
export const capabilityBuilderApi = {
  // ----- profile -----

  /** Auto-build the capability profile from past USASpending wins. ~5s. */
  buildProfile: async (
    payload: CapabilityProfileBuildRequest
  ): Promise<CapabilityProfile> => {
    const response = await apiClient.post<CapabilityProfile>(
      '/capability-builder/profile/build',
      payload
    );
    return response.data;
  },

  /** Returns null if no profile exists yet (404). */
  getProfile: async (): Promise<CapabilityProfile | null> => {
    try {
      const response = await apiClient.get<CapabilityProfile>(
        '/capability-builder/profile'
      );
      return response.data;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  },

  updateProfile: async (
    updates: CapabilityProfileUpdate
  ): Promise<CapabilityProfile> => {
    const response = await apiClient.patch<CapabilityProfile>(
      '/capability-builder/profile',
      updates
    );
    return response.data;
  },

  deleteProfile: async (): Promise<void> => {
    await apiClient.delete('/capability-builder/profile');
  },

  // ----- matches -----

  /**
   * Manually trigger a scan for this org. SYNCHRONOUS — takes 30-60s.
   * Production uses the daily Celery beat; this is for ad-hoc testing or
   * "Refresh now" buttons.
   */
  runScanNow: async (): Promise<ScanRunResponse> => {
    const response = await apiClient.post<ScanRunResponse>(
      '/capability-builder/matches/scan/run-now'
    );
    return response.data;
  },

  /**
   * Get the day's saved matches. Omit `date` to get today (UTC).
   * Format: YYYY-MM-DD.
   */
  getMatchesForDate: async (
    date?: string
  ): Promise<MatchesForDateResponse> => {
    const response = await apiClient.get<MatchesForDateResponse>(
      '/capability-builder/matches',
      date ? { params: { date } } : undefined
    );
    return response.data;
  },

  /**
   * List ISO date strings that have saved matches for this org — used by the
   * calendar nav to render available dates.
   */
  listMatchDates: async (
    start?: string,
    end?: string
  ): Promise<MatchDatesResponse> => {
    const params: Record<string, string> = {};
    if (start) params.start = start;
    if (end) params.end = end;
    const response = await apiClient.get<MatchDatesResponse>(
      '/capability-builder/matches/dates',
      { params }
    );
    return response.data;
  },

  /**
   * Proxy-download the pre-picked PWS file for a saved match. The backend
   * fetches it from SAM.gov (browser can't — CORS) and streams the bytes.
   * Used by the "Price this RFP" handoff: the blob gets wrapped in a File
   * and fed to the standard proposals upload API.
   */
  downloadPwsFile: async (noticeId: string): Promise<Blob> => {
    const response = await apiClient.get<Blob>(
      `/capability-builder/matches/${noticeId}/pws-file`,
      { responseType: 'blob' }
    );
    return response.data;
  },
};
