/**
 * RFP Radar — capability builder + matches store.
 *
 * Holds the org's capability profile and today's (or any day's) saved matches,
 * plus loading/error state for each remote operation. Pages subscribe via
 * `useCapabilityBuilderStore`.
 */

import { create } from 'zustand';

import { capabilityBuilderApi } from '../api/capabilityBuilder';
import type {
  CapabilityProfile,
  CapabilityProfileBuildRequest,
  CapabilityProfileUpdate,
  RFPRadarMatch,
} from '@/types';

/**
 * Today as YYYY-MM-DD in the **user's local timezone** — what their
 * wall clock would say. Using a UTC default here would silently roll
 * the calendar forward by a day for users west of UTC (e.g. a
 * Californian opening Radar at 9 PM PT would land on "tomorrow").
 */
function todayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface CapabilityBuilderState {
  // ── profile ──
  profile: CapabilityProfile | null;
  profileLoading: boolean;
  profileError: string | null;
  /** Tracks the build-from-scratch flow specifically — separate from
   *  profileLoading so the dashboard can show a "Building…" status without
   *  blocking other reads. */
  profileBuilding: boolean;

  // ── matches ──
  /** ISO date (YYYY-MM-DD) the user is currently viewing. */
  viewingDate: string;
  /** Matches for the currently-viewed date. */
  matches: RFPRadarMatch[];
  matchesLoading: boolean;
  matchesError: string | null;

  /** Distinct dates with saved matches — drives the calendar dots. */
  availableDates: string[];

  /** Scanner status (manual scan trigger). */
  scanning: boolean;
  scanError: string | null;

  // ── actions ──
  loadProfile: () => Promise<void>;
  buildProfile: (payload: CapabilityProfileBuildRequest) => Promise<void>;
  updateProfile: (updates: CapabilityProfileUpdate) => Promise<void>;
  deleteProfile: () => Promise<void>;

  setViewingDate: (date: string) => void;
  loadMatches: (date?: string) => Promise<void>;
  loadAvailableDates: () => Promise<void>;
  runScanNow: () => Promise<void>;

  reset: () => void;
}

const initialState = {
  profile: null,
  profileLoading: false,
  profileError: null,
  profileBuilding: false,
  viewingDate: todayLocal(),
  matches: [],
  matchesLoading: false,
  matchesError: null,
  availableDates: [],
  scanning: false,
  scanError: null,
};

function extractError(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (err?.message) return err.message;
  return fallback;
}

export const useCapabilityBuilderStore = create<CapabilityBuilderState>(
  (set, get) => ({
    ...initialState,

    // ── profile actions ──

    loadProfile: async () => {
      set({ profileLoading: true, profileError: null });
      try {
        const profile = await capabilityBuilderApi.getProfile();
        set({ profile, profileLoading: false });
      } catch (err: any) {
        set({
          profile: null,
          profileLoading: false,
          profileError: extractError(err, 'Failed to load profile.'),
        });
      }
    },

    buildProfile: async (payload) => {
      set({ profileBuilding: true, profileError: null });
      try {
        const profile = await capabilityBuilderApi.buildProfile(payload);
        set({ profile, profileBuilding: false });
      } catch (err: any) {
        set({
          profileBuilding: false,
          profileError: extractError(err, 'Profile build failed.'),
        });
        throw err;
      }
    },

    updateProfile: async (updates) => {
      const prev = get().profile;
      if (!prev) return;
      // optimistic: merge locally, revert on failure
      set({ profile: { ...prev, ...updates } as CapabilityProfile });
      try {
        const profile = await capabilityBuilderApi.updateProfile(updates);
        set({ profile });
      } catch (err: any) {
        set({
          profile: prev,
          profileError: extractError(err, 'Update failed.'),
        });
        throw err;
      }
    },

    deleteProfile: async () => {
      try {
        await capabilityBuilderApi.deleteProfile();
        set({
          profile: null,
          matches: [],
          availableDates: [],
          viewingDate: todayLocal(),
        });
      } catch (err: any) {
        set({ profileError: extractError(err, 'Delete failed.') });
        throw err;
      }
    },

    // ── matches actions ──

    setViewingDate: (date) => {
      set({ viewingDate: date });
      // immediately fire a load for the new date
      void get().loadMatches(date);
    },

    loadMatches: async (date) => {
      const target = date ?? get().viewingDate;
      set({ matchesLoading: true, matchesError: null });
      try {
        const resp = await capabilityBuilderApi.getMatchesForDate(target);
        set({
          matches: resp.matches,
          viewingDate: resp.scan_date,
          matchesLoading: false,
        });
      } catch (err: any) {
        set({
          matchesLoading: false,
          matchesError: extractError(err, 'Failed to load matches.'),
        });
      }
    },

    loadAvailableDates: async () => {
      try {
        const resp = await capabilityBuilderApi.listMatchDates();
        set({ availableDates: resp.dates });
      } catch (err: any) {
        // Calendar is non-essential — keep silent on errors here; the
        // primary matches fetch will surface failures.
        console.warn('[capabilityBuilder] listMatchDates failed:', err);
      }
    },

    runScanNow: async () => {
      set({ scanning: true, scanError: null });
      try {
        await capabilityBuilderApi.runScanNow();
        // Refresh matches + calendar after a successful scan.
        await Promise.all([
          get().loadMatches(todayLocal()),
          get().loadAvailableDates(),
        ]);
        set({ scanning: false, viewingDate: todayLocal() });
      } catch (err: any) {
        set({
          scanning: false,
          scanError: extractError(err, 'Scan failed.'),
        });
        throw err;
      }
    },

    reset: () => set({ ...initialState }),
  })
);
