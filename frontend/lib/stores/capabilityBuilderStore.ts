/**
 * RFP Radar — capability builder + matches store.
 *
 * Holds the org's capability profile and today's (or any day's) saved matches,
 * plus loading/error state for each remote operation. Pages subscribe via
 * `useCapabilityBuilderStore`.
 */

import { create } from 'zustand';

import { capabilityBuilderApi } from '../api/capabilityBuilder';
import { proposalsApi } from '../api/proposals';
import { cacheManager } from '../cache';
import { useAuthStore } from './authStore';
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

  /** notice_id of the match currently being handed off to PriceIQ, if any.
   *  Drives the per-card "Preparing…" button state. */
  pricingNoticeId: string | null;
  priceError: string | null;

  // ── hydration guard ──
  /** True once the page's initial load has run for the current org. Lets
   *  `loadInitial` short-circuit on navigation so we render the in-memory
   *  data instead of refetching + flashing spinners. */
  hydrated: boolean;
  /** Org the in-memory data belongs to — used to invalidate on workspace
   *  switch (mirrors the proposals sidebar's `lastFetchedOrgId`). */
  lastLoadedOrgId: string | null;

  // ── actions ──
  /** One-shot initial load for the RFP Radar page. Skips the network
   *  entirely when the store is already hydrated for the active org, so
   *  navigating back to the page is instant and reload-free. */
  loadInitial: () => Promise<void>;
  loadProfile: () => Promise<void>;
  buildProfile: (payload: CapabilityProfileBuildRequest) => Promise<void>;
  updateProfile: (updates: CapabilityProfileUpdate) => Promise<void>;
  deleteProfile: () => Promise<void>;

  setViewingDate: (date: string) => void;
  loadMatches: (date?: string) => Promise<void>;
  loadAvailableDates: () => Promise<void>;
  runScanNow: () => Promise<void>;

  /** "Price this RFP" handoff — downloads the PWS, feeds it through the
   *  standard proposals upload API, returns the new proposal_id. */
  priceMatch: (match: RFPRadarMatch) => Promise<string>;

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
  pricingNoticeId: null,
  priceError: null,
  hydrated: false,
  lastLoadedOrgId: null,
};

/** Extension → File MIME type for the PWS handoff. */
const PWS_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  rtf: 'application/rtf',
};

/** Collapse whitespace + cap length so RFP titles make sane proposal names. */
function proposalNameFromTitle(title: string): string {
  const collapsed = title.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 120) return collapsed;
  // cut at the last word boundary before the cap
  const cut = collapsed.slice(0, 120);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut) + '…';
}

function extractError(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (err?.message) return err.message;
  return fallback;
}

export const useCapabilityBuilderStore = create<CapabilityBuilderState>(
  (set, get) => ({
    ...initialState,

    // ── hydration / initial load ──

    loadInitial: async () => {
      const orgId = useAuthStore.getState().user?.organization_id ?? null;
      const { hydrated, lastLoadedOrgId } = get();

      // Cache hit: already loaded for this org → keep in-memory data,
      // skip the network so navigation is instant and spinner-free.
      if (hydrated && lastLoadedOrgId === orgId) return;

      // Org switched since the last hydration → drop stale data first.
      if (hydrated && lastLoadedOrgId !== orgId) {
        set({ ...initialState });
      }

      // Stamp the org up front so concurrent mounts don't double-fetch.
      set({ lastLoadedOrgId: orgId });
      await Promise.all([
        get().loadProfile(),
        get().loadAvailableDates(),
        get().loadMatches(),
      ]);
      set({ hydrated: true });
    },

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

    priceMatch: async (match) => {
      set({ pricingNoticeId: match.notice_id, priceError: null });
      try {
        // 1. Pull the PWS through our backend proxy (SAM.gov blocks CORS).
        const blob = await capabilityBuilderApi.downloadPwsFile(match.notice_id);

        // 2. Wrap it in a File so the existing upload API treats it exactly
        //    like a manually-selected document.
        const filename = match.pws.filename || 'pws-document.pdf';
        const ext = filename.includes('.')
          ? filename.split('.').pop()!.toLowerCase()
          : '';
        const file = new File([blob], filename, {
          type: PWS_MIME_TYPES[ext] ?? 'application/octet-stream',
        });

        // 3. Reuse the standard proposals upload — same endpoint, same
        //    background processing, same parser-event feed as manual upload.
        const resp = await proposalsApi.upload(
          [file],
          proposalNameFromTitle(match.title),
          match.solicitation_number ?? undefined,
        );

        // New proposal exists now — invalidate the list cache and refresh
        // the sidebar's store. (The sidebar persists across navigation and
        // only fetches on org change, so it won't pick this up by itself.)
        const user = useAuthStore.getState().user;
        if (user?.organization_id) {
          cacheManager.invalidate(`proposals:list:${user.organization_id}`);
        }
        const { useProposalsStore } = await import('./proposalsStore');
        const proposals = useProposalsStore.getState();
        proposals.resetPagination();
        void proposals.fetchProposalsPaginated(false);

        set({ pricingNoticeId: null });
        return resp.proposal_id;
      } catch (err: any) {
        set({
          pricingNoticeId: null,
          priceError: extractError(err, 'Failed to start pricing this RFP.'),
        });
        throw err;
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
