import { create } from 'zustand';
import { GSAContract, GSALaborCategory } from '@/types';
import { companyRepositoryApi } from '../api/companyRepository';
import { cacheManager } from '../cache';
import { useAuthStore } from './authStore';

interface CompanyRepositoryState {
  contracts: GSAContract[];
  selectedContract: (GSAContract & { labor_categories: GSALaborCategory[] }) | null;
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;

  // Actions
  fetchContracts: (force?: boolean) => Promise<void>;
  fetchContract: (fileId: string) => Promise<void>;
  uploadContract: (file: File, name: string) => Promise<string>;
  updateStartDate: (fileId: string, startDate: string) => Promise<void>;
  deleteContract: (fileId: string) => Promise<void>;
  pollStatus: (fileId: string) => Promise<GSAContract>;
  clearSelectedContract: () => void;
  clearError: () => void;
  invalidateAllCaches: (fileId?: string) => void;
}

export const useCompanyRepositoryStore = create<CompanyRepositoryState>((set, get) => ({
  contracts: [],
  selectedContract: null,
  isLoading: false,
  isUploading: false,
  error: null,

  fetchContracts: async (force = false) => {
    try {
      const user = useAuthStore.getState().user;
      const orgId = user?.organization_id;

      if (!orgId) {
        console.warn('[COMPANY_REPO] No organization ID, skipping fetch');
        return;
      }

      const cacheKey = `company-repo:${orgId}:contracts`;
      const cached = cacheManager.get<GSAContract[]>(cacheKey);

      if (cached && !cached.isExpired && !force) {
        console.log('[COMPANY_REPO] Using cached contracts');
        set({ contracts: cached.data, isLoading: false });
        return;
      }

      set({ isLoading: true, error: null });
      console.log(`[COMPANY_REPO] Fetching contracts... (force=${force})`);

      const contracts = await companyRepositoryApi.list();
      set({ contracts, isLoading: false });

      cacheManager.set(cacheKey, contracts, 5 * 60 * 1000);
      console.log('[COMPANY_REPO] Contracts loaded and cached');
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch contracts',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchContract: async (fileId: string) => {
    try {
      const user = useAuthStore.getState().user;
      const orgId = user?.organization_id;

      // Check cache first
      if (orgId) {
        const cacheKey = `company-repo:${orgId}:contract:${fileId}`;
        const cached = cacheManager.get<GSAContract & { labor_categories: GSALaborCategory[] }>(cacheKey);

        if (cached && !cached.isExpired) {
          console.log('[COMPANY_REPO] Using cached contract details');
          set({ selectedContract: cached.data, isLoading: false });
          return;
        }
      }

      set({ isLoading: true, error: null });
      const contract = await companyRepositoryApi.get(fileId);
      set({ selectedContract: contract, isLoading: false });

      // Cache the contract details
      if (orgId) {
        cacheManager.set(
          `company-repo:${orgId}:contract:${fileId}`,
          contract,
          10 * 60 * 1000 // 10 minutes
        );
      }
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch contract',
        isLoading: false,
      });
      throw error;
    }
  },

  uploadContract: async (file: File, name: string) => {
    try {
      set({ isUploading: true, error: null });
      const response = await companyRepositoryApi.upload(file, name);

      // Invalidate all caches (new contract means all caches are stale)
      get().invalidateAllCaches();

      // Refresh contracts list
      await get().fetchContracts(true);
      set({ isUploading: false });

      return response.file_id;
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to upload contract',
        isUploading: false,
      });
      throw error;
    }
  },

  updateStartDate: async (fileId: string, startDate: string) => {
    try {
      set({ isLoading: true, error: null });
      await companyRepositoryApi.updateStartDate(fileId, startDate);

      // Invalidate all caches for this contract
      get().invalidateAllCaches(fileId);

      await get().fetchContracts(true);
      set({ isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to update start date',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteContract: async (fileId: string) => {
    try {
      set({ isLoading: true, error: null });
      await companyRepositoryApi.delete(fileId);

      // Remove from local state
      set((state) => ({
        contracts: state.contracts.filter((c) => c.file_id !== fileId),
        isLoading: false,
      }));

      // Invalidate all caches for this contract
      get().invalidateAllCaches(fileId);
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to delete contract',
        isLoading: false,
      });
      throw error;
    }
  },

  pollStatus: async (fileId: string) => {
    const status = await companyRepositoryApi.getStatus(fileId);

    // If status is no longer processing, fetch full details to update metadata
    if (status.status !== 'processing') {
      try {
        const user = useAuthStore.getState().user;
        const orgId = user?.organization_id;

        // Fetch full contract details
        const fullContract = await companyRepositoryApi.get(fileId);

        // Update contract in list with full metadata
        set((state) => ({
          contracts: state.contracts.map((c) =>
            c.file_id === fileId
              ? {
                  ...c,
                  status: status.status as GSAContract['status'],
                  labor_categories_count: status.labor_category_count || c.labor_categories_count,
                  contract_number: fullContract.contract_number,
                  company_name: fullContract.company_name,
                  contract_start_date: fullContract.contract_start_date,
                  contract_end_date: fullContract.contract_end_date,
                }
              : c
          ),
        }));

        // Cache the full contract details
        if (orgId) {
          cacheManager.set(
            `company-repo:${orgId}:contract:${fileId}`,
            fullContract,
            10 * 60 * 1000 // 10 minutes
          );
        }
      } catch (error) {
        console.error('[COMPANY_REPO] Failed to fetch full contract details:', error);
        // Still update status even if full fetch fails
        set((state) => ({
          contracts: state.contracts.map((c) =>
            c.file_id === fileId
              ? {
                  ...c,
                  status: status.status as GSAContract['status'],
                  labor_categories_count: status.labor_category_count || c.labor_categories_count,
                }
              : c
          ),
        }));
      }
    } else {
      // Still processing, just update status and count
      set((state) => ({
        contracts: state.contracts.map((c) =>
          c.file_id === fileId
            ? {
                ...c,
                status: status.status as GSAContract['status'],
                labor_categories_count: status.labor_category_count || c.labor_categories_count,
              }
            : c
        ),
      }));
    }

    // Return the updated contract
    const contract = get().contracts.find((c) => c.file_id === fileId);
    return contract!;
  },

  clearSelectedContract: () => set({ selectedContract: null }),
  clearError: () => set({ error: null }),

  // Invalidate all caches (both cacheManager and sessionStorage)
  invalidateAllCaches: (fileId?: string) => {
    const user = useAuthStore.getState().user;
    const orgId = user?.organization_id;

    if (!orgId) return;

    console.log('[COMPANY_REPO] Invalidating all caches', fileId ? `for file ${fileId}` : 'for all contracts');

    // Invalidate cacheManager caches
    cacheManager.invalidate(`company-repo:${orgId}:contracts`);

    if (fileId) {
      // Invalidate specific contract detail cache
      cacheManager.invalidate(`company-repo:${orgId}:contract:${fileId}`);
    } else {
      // Invalidate all contract detail caches (use wildcard pattern)
      // Note: cacheManager doesn't support wildcards, so we need to clear all keys
      const allKeys = Object.keys(localStorage).filter(key =>
        key.startsWith(`company-repo:${orgId}:contract:`)
      );
      allKeys.forEach(key => cacheManager.invalidate(key.replace('cache_', '')));
    }

    // Clear sessionStorage caches used by SOCSelectionModal
    const GSA_CACHE_PREFIX = 'soc_cache_gsa_cache_';
    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(GSA_CACHE_PREFIX)) {
        if (fileId) {
          // Only clear caches for this specific file
          if (key.includes(fileId)) {
            keysToRemove.push(key);
          }
        } else {
          // Clear all GSA caches
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    console.log('[COMPANY_REPO] Cleared', keysToRemove.length, 'sessionStorage cache entries');
  },
}));
