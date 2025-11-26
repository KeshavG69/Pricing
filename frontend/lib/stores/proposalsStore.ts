import { create } from 'zustand';
import { Proposal, ProposalUpdate } from '@/types';
import { proposalsApi } from '../api/proposals';

interface ProposalsState {
  proposals: Proposal[];
  currentProposal: Proposal | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchProposals: () => Promise<void>;
  fetchProposal: (id: string) => Promise<void>;
  uploadDocuments: (files: File[]) => Promise<string>;
  updateProposal: (id: string, updates: ProposalUpdate) => Promise<void>;
  deleteProposal: (id: string) => Promise<void>;
  duplicateProposal: (id: string, newName: string) => Promise<void>;
  setCurrentProposal: (proposal: Proposal | null) => void;
  clearError: () => void;
}

export const useProposalsStore = create<ProposalsState>((set, get) => ({
  proposals: [],
  currentProposal: null,
  isLoading: false,
  error: null,

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

  uploadDocuments: async (files) => {
    try {
      set({ isLoading: true, error: null });
      const response = await proposalsApi.upload(files);
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

  setCurrentProposal: (proposal) => set({ currentProposal: proposal }),

  clearError: () => set({ error: null }),
}));
