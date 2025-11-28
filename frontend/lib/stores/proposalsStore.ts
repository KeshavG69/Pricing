import { create } from 'zustand';
import { Proposal, ProposalUpdate } from '@/types';
import { proposalsApi } from '../api/proposals';

interface ProposalsState {
  proposals: Proposal[];
  currentProposal: Proposal | null;
  isLoading: boolean;
  error: string | null;

  // Pagination state
  hasMore: boolean;
  currentPage: number;
  sortBy: 'date' | 'name' | 'status';
  sortOrder: 'asc' | 'desc';

  // Actions
  fetchProposals: () => Promise<void>;
  fetchProposal: (id: string) => Promise<void>;
  uploadDocuments: (files: File[], solicitationNumber?: string) => Promise<string>;
  updateProposal: (id: string, updates: ProposalUpdate) => Promise<void>;
  deleteProposal: (id: string) => Promise<void>;
  duplicateProposal: (id: string, newName: string) => Promise<void>;
  updatePositionSubcontractorHours: (proposalId: string, positionIndex: number, subHours: number) => Promise<void>;
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

  // Pagination state
  hasMore: true,
  currentPage: 0,
  sortBy: 'date',
  sortOrder: 'desc',

  fetchProposals: async () => {
    try {
      set({ isLoading: true, error: null });
      const proposals = await proposalsApi.list();
      set({ proposals, isLoading: false });
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
      const proposal = await proposalsApi.get(id);
      set({ currentProposal: proposal, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch proposal',
        isLoading: false,
      });
    }
  },

  uploadDocuments: async (files, solicitationNumber) => {
    try {
      set({ isLoading: true, error: null });
      const response = await proposalsApi.upload(files, solicitationNumber);
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

  updatePositionSubcontractorHours: async (proposalId, positionIndex, subHours) => {
    try {
      await proposalsApi.updatePositionSubcontractorHours(
        proposalId,
        positionIndex,
        subHours
      );

      // Refresh current proposal to get updated position data
      const state = get();
      if (state.currentProposal?.id === proposalId) {
        await get().fetchProposal(proposalId);
      }
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to update subcontractor hours',
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

    // Don't fetch if already loading or no more data
    if (state.isLoading || (!sortChanged && !state.hasMore && append)) {
      return;
    }

    try {
      set({ isLoading: true, error: null });

      const currentState = get();
      const skip = append && !sortChanged ? currentState.currentPage * 20 : 0;
      const limit = 20;

      const newProposals = await proposalsApi.list(
        skip,
        limit,
        currentState.sortBy,
        currentState.sortOrder
      );

      set((state) => ({
        proposals:
          append && !sortChanged
            ? [...state.proposals, ...newProposals]
            : newProposals,
        hasMore: newProposals.length === limit,
        currentPage: sortChanged ? 1 : state.currentPage + 1,
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch proposals',
        isLoading: false,
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
