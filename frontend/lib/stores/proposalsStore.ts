import { create } from 'zustand';
import { Proposal, ProposalUpdate } from '@/types';
import { proposalsApi } from '../api/proposals';
import { cacheManager } from '../cache';
import { useAuthStore } from './authStore';
import { deduplicateRequest } from '../utils/requestDeduplication';

interface ProposalsState {
  proposals: Proposal[];
  currentProposal: Proposal | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedOrgId: string | null; // Track organization changes

  // Pagination state
  hasMore: boolean;
  currentPage: number;
  sortBy: 'date' | 'name' | 'status';
  sortOrder: 'asc' | 'desc';

  // Actions
  fetchProposals: (force?: boolean) => Promise<void>;
  fetchProposal: (id: string) => Promise<void>;
  uploadDocuments: (
    files: File[],
    name: string,
    solicitationNumber?: string,
    wageSourceType?: 'bls' | 'gsa',
    wageSourceFileId?: string
  ) => Promise<string>;
  updateProposal: (id: string, updates: ProposalUpdate) => Promise<void>;
  deleteProposal: (id: string) => Promise<void>;
  duplicateProposal: (id: string, newName: string) => Promise<void>;
  setCurrentProposal: (proposal: Proposal | null) => void;
  clearError: () => void;

  // Pagination actions
  fetchProposalsPaginated: (
    append: boolean,
    sortBy?: 'date' | 'name' | 'status',
    sortOrder?: 'asc' | 'desc'
  ) => Promise<void>;
  resetPagination: () => void;
}

export const useProposalsStore = create<ProposalsState>((set, get) => ({
  proposals: [],
  currentProposal: null,
  isLoading: false,
  error: null,
  lastFetchedOrgId: null,

  // Pagination state
  hasMore: true,
  currentPage: 0,
  sortBy: 'date',
  sortOrder: 'desc',

  fetchProposals: async (force = false) => {
    try {
      // Get current organization ID
      const user = useAuthStore.getState().user;
      const orgId = user?.organization_id;

      if (!orgId) {
        console.warn('[PROPOSALS] No organization ID, skipping fetch');
        return;
      }

      // Check if organization changed
      const state = get();
      if (state.lastFetchedOrgId && state.lastFetchedOrgId !== orgId) {
        console.log(`[PROPOSALS] Organization changed: ${state.lastFetchedOrgId} -> ${orgId}`);
        // Clear old org cache
        cacheManager.invalidate(`proposals:list:${state.lastFetchedOrgId}`);
        cacheManager.invalidate(`proposal:${state.lastFetchedOrgId}:*`);
      }

      // Conditional refresh pattern: Check cache first, only fetch if expired or forced
      const cacheKey = `proposals:list:${orgId}`;
      const cached = cacheManager.get<Proposal[]>(cacheKey);

      // If cache is valid and not forced, use cached data (no fetch)
      if (cached && !cached.isExpired && !force) {
        console.log('[PROPOSALS] ✅ Using cached data (no fetch needed)');
        // Deduplicate cached data just in case
        const uniqueCached = Array.from(
          new Map(cached.data.map((p: Proposal) => [p.id, p])).values()
        );
        set({
          proposals: uniqueCached,
          isLoading: false,
          lastFetchedOrgId: orgId,
        });
        return;
      }

      // Cache expired or forced refresh - fetch from API
      set({ isLoading: true, error: null });
      console.log(`[PROPOSALS] Fetching fresh data... (force=${force}, expired=${cached?.isExpired})`);

      // Deduplicate request to prevent multiple simultaneous calls
      const response = await deduplicateRequest(
        cacheKey,
        () => proposalsApi.list()
      );

      // Handle response format: extract proposals array from metadata response
      const freshProposals = Array.isArray(response) ? response : response.proposals;

      // Deduplicate proposals by ID to ensure uniqueness
      const uniqueProposals = Array.from(
        new Map(freshProposals.map((p: Proposal) => [p.id, p])).values()
      );

      // Update with fresh data and cache
      set({
        proposals: uniqueProposals,
        isLoading: false,
        lastFetchedOrgId: orgId,
      });

      // Update cache
      cacheManager.set(cacheKey, freshProposals);
      console.log('[PROPOSALS] Fresh data loaded and cached');
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch proposals',
        isLoading: false,
      });
    }
  },

  fetchProposal: async (id) => {
    try {
      set({ isLoading: true, error: null });

      // Deduplicate request to prevent multiple simultaneous calls for same proposal
      const proposal = await deduplicateRequest(
        `proposal:${id}`,
        () => proposalsApi.get(id)
      );

      set({ currentProposal: proposal, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch proposal',
        isLoading: false,
      });
    }
  },

  uploadDocuments: async (files, name, solicitationNumber, wageSourceType, wageSourceFileId) => {
    try {
      set({ isLoading: true, error: null });
      const response = await proposalsApi.upload(
        files,
        name,
        solicitationNumber,
        wageSourceType,
        wageSourceFileId
      );

      // Invalidate proposals list cache (new proposal added)
      const user = useAuthStore.getState().user;
      if (user?.organization_id) {
        cacheManager.invalidate(`proposals:list:${user.organization_id}`);
      }

      set({ isLoading: false });
      return response.proposal_id;
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to upload documents',
        isLoading: false,
      });
      throw error;
    }
  },

  updateProposal: async (id, updates) => {
    try {
      set({ isLoading: true, error: null });
      const updated = await proposalsApi.update(id, updates);

      // Invalidate cache (proposal updated)
      const user = useAuthStore.getState().user;
      if (user?.organization_id) {
        cacheManager.invalidate(`proposal:${id}`);
        cacheManager.invalidate(`proposals:list:${user.organization_id}`);
      }

      // Update in list
      set((state) => ({
        proposals: state.proposals.map((p) => (p.id === id ? updated : p)),
        currentProposal:
          state.currentProposal?.id === id ? updated : state.currentProposal,
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to update proposal',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteProposal: async (id) => {
    try {
      set({ isLoading: true, error: null });
      await proposalsApi.delete(id);

      // Invalidate cache (proposal deleted)
      const user = useAuthStore.getState().user;
      if (user?.organization_id) {
        cacheManager.invalidate(`proposal:${id}`);
        cacheManager.invalidate(`proposals:list:${user.organization_id}`);
      }

      // Remove from list
      set((state) => ({
        proposals: state.proposals.filter((p) => p.id !== id),
        currentProposal:
          state.currentProposal?.id === id ? null : state.currentProposal,
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to delete proposal',
        isLoading: false,
      });
      throw error;
    }
  },

  duplicateProposal: async (id, newName) => {
    try {
      set({ isLoading: true, error: null });
      const newProposal = await proposalsApi.duplicate(id, newName);

      // Add to list
      set((state) => ({
        proposals: [newProposal, ...state.proposals],
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to duplicate proposal',
        isLoading: false,
      });
      throw error;
    }
  },

  setCurrentProposal: (proposal) => set({ currentProposal: proposal }),

  clearError: () => set({ error: null }),

  fetchProposalsPaginated: async (append, sortBy, sortOrder) => {
    const state = get();

    // If sort changed, reset pagination
    const sortChanged =
      (sortBy && sortBy !== state.sortBy) ||
      (sortOrder && sortOrder !== state.sortOrder);

    if (sortChanged) {
      set({
        currentPage: 0,
        hasMore: true,
        proposals: [],
        sortBy: sortBy || state.sortBy,
        sortOrder: sortOrder || state.sortOrder,
      });
    }

    // Don't fetch if already fetching or no more data
    if (!sortChanged && !state.hasMore && append) {
      return;
    }

    try {
      // DON'T set global isLoading - use local loading state in components
      // This prevents re-rendering other components that subscribe to proposals store
      const currentState = get();
      const skip = append && !sortChanged ? currentState.currentPage * 20 : 0;
      const limit = 20;

      const response = await proposalsApi.list(
        skip,
        limit,
        currentState.sortBy,
        currentState.sortOrder
      );

      // Handle both response formats: object with metadata (skip=0) or plain array (skip>0)
      let proposalsArray: Proposal[];
      let hasMoreData: boolean;

      if (skip === 0 && !Array.isArray(response) && typeof response === 'object' && 'proposals' in response) {
        // New format with metadata (skip=0)
        proposalsArray = response.proposals as Proposal[];
        hasMoreData = response.hasMore as boolean;
      } else {
        // Old format (plain array) for backwards compatibility (skip>0)
        proposalsArray = Array.isArray(response) ? response : [];
        hasMoreData = proposalsArray.length === limit;
      }

      // Deduplicate incoming proposals first (in case API returns duplicates)
      const uniqueProposalsArray = Array.from(
        new Map(proposalsArray.map((p) => [p.id, p])).values()
      );

      // Then deduplicate against existing state (for append mode)
      const existingIds = new Set(state.proposals.map((p) => p.id));
      const uniqueNewProposals = uniqueProposalsArray.filter((p) => !existingIds.has(p.id));

      // Final deduplicated list
      let finalProposals: typeof proposalsArray;
      if (append && !sortChanged) {
        // Append mode: add only new unique proposals
        finalProposals = [...state.proposals, ...uniqueNewProposals];
      } else {
        // Replace mode: use deduplicated incoming proposals
        finalProposals = uniqueProposalsArray;
      }

      // Final safety check: ensure no duplicates in final array
      const deduplicatedFinalProposals = Array.from(
        new Map(finalProposals.map((p) => [p.id, p])).values()
      );

      set((state) => ({
        proposals: deduplicatedFinalProposals,
        hasMore: hasMoreData,
        currentPage: sortChanged ? 1 : state.currentPage + 1,
        // DON'T set isLoading here - pagination should use local loading state
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch proposals',
        // DON'T set isLoading here either
      });
    }
  },

  resetPagination: () => {
    set({
      proposals: [],
      currentPage: 0,
      hasMore: true,
      sortBy: 'date',
      sortOrder: 'desc',
    });
  },
}));
