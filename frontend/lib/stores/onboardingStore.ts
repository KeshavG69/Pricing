import { create } from 'zustand';
import {
  OnboardingProgress,
  TaskDefinition,
  getOnboardingProgress,
  getTaskDefinitionsByRole,
  updateTask as updateTaskApi,
  startTour as startTourApi,
  completeTour as completeTourApi,
  restartTour as restartTourApi,
} from '@/lib/api/onboarding';

interface OnboardingState {
  // Data
  progress: OnboardingProgress | null;
  taskDefinitions: TaskDefinition[]; // Computed from static data + user role

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  syncProgress: (progress: OnboardingProgress | null) => void; // Sync from user data (no API call)
  syncTaskDefinitions: (role: 'admin' | 'user') => void; // Sync from static data (no API call)
  fetchProgress: () => Promise<void>; // Legacy - kept for backward compatibility
  updateTask: (taskId: string, completed: boolean) => Promise<void>;
  startTour: () => Promise<void>;
  completeTour: (skipped?: boolean) => Promise<void>;
  restartTour: () => Promise<void>;
  dismissChecklist: (dismissed?: boolean) => void; // localStorage only - no API call
  getDismissState: () => boolean; // Read from localStorage
  toggleCollapse: (collapsed: boolean) => void; // localStorage only - no API call
  getCollapseState: () => boolean; // Read from localStorage
  clearError: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  // Initial state
  progress: null,
  taskDefinitions: [],
  isLoading: false,
  error: null,

  /**
   * Sync progress from user data (no API call - progress comes from /api/auth/me)
   */
  syncProgress: (progress: OnboardingProgress | null) => {
    set({ progress, isLoading: false, error: null });
  },

  /**
   * Sync task definitions from static data filtered by role (no API call)
   */
  syncTaskDefinitions: (role: 'admin' | 'user') => {
    const taskDefinitions = getTaskDefinitionsByRole(role);
    set({ taskDefinitions });
  },

  /**
   * Fetch user's onboarding progress (role-filtered)
   * LEGACY: Kept for backward compatibility, but prefer syncProgress from user data
   */
  fetchProgress: async () => {
    try {
      set({ isLoading: true, error: null });
      const progress = await getOnboardingProgress();
      set({ progress, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch onboarding progress',
        isLoading: false,
      });
      console.error('Failed to fetch onboarding progress:', error);
    }
  },

  /**
   * Update a specific task completion status
   */
  updateTask: async (taskId: string, completed: boolean) => {
    try {
      const response = await updateTaskApi(taskId, completed);
      set({ progress: response.progress });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to update task' });
      console.error('Failed to update task:', error);
      throw error;
    }
  },

  /**
   * Mark product tour as started
   */
  startTour: async () => {
    try {
      await startTourApi();
      // Refetch progress to get updated state
      await get().fetchProgress();
    } catch (error: any) {
      console.error('Failed to start tour:', error);
    }
  },

  /**
   * Mark product tour as completed or skipped
   */
  completeTour: async (skipped: boolean = false) => {
    try {
      const response = await completeTourApi(skipped);
      set({ progress: response.progress });
    } catch (error: any) {
      console.error('Failed to complete tour:', error);
      throw error;
    }
  },

  /**
   * Restart the product tour
   */
  restartTour: async () => {
    try {
      const response = await restartTourApi();
      set({ progress: response.progress });
      // Note: Navigation should be handled by the calling component
    } catch (error: any) {
      set({ error: error.response?.data?.detail || 'Failed to restart tour' });
      console.error('Failed to restart tour:', error);
      throw error;
    }
  },

  /**
   * Dismiss or restore setup guide checklist (localStorage only - no API call)
   */
  dismissChecklist: (dismissed: boolean = true) => {
    // Store in localStorage (UI preference only)
    if (typeof window !== 'undefined') {
      localStorage.setItem('checklist_dismissed', dismissed.toString());
    }

    // Update local state
    const currentProgress = get().progress;
    if (currentProgress) {
      set({
        progress: {
          ...currentProgress,
          checklist_dismissed: dismissed,
        },
      });
    }
  },

  /**
   * Get dismiss state from localStorage
   */
  getDismissState: (): boolean => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('checklist_dismissed');
      return stored === 'true';
    }
    return false;
  },

  /**
   * Toggle checklist collapsed state (localStorage only - no API call)
   */
  toggleCollapse: (collapsed: boolean) => {
    // Store in localStorage (UI preference only)
    if (typeof window !== 'undefined') {
      localStorage.setItem('checklist_collapsed', collapsed.toString());
    }

    // Update local state
    const currentProgress = get().progress;
    if (currentProgress) {
      set({
        progress: {
          ...currentProgress,
          checklist_collapsed: collapsed,
        },
      });
    }
  },

  /**
   * Get collapse state from localStorage
   */
  getCollapseState: (): boolean => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('checklist_collapsed');
      return stored === 'true';
    }
    return false;
  },

  /**
   * Clear error state
   */
  clearError: () => {
    set({ error: null });
  },
}));
