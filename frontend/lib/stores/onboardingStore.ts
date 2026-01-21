import { create } from 'zustand';
import {
  OnboardingProgress,
  TaskDefinition,
  getOnboardingProgress,
  getTaskDefinitions,
  updateTask as updateTaskApi,
  startTour as startTourApi,
  completeTour as completeTourApi,
  dismissChecklist as dismissChecklistApi,
  toggleChecklistCollapse as toggleChecklistCollapseApi,
} from '@/lib/api/onboarding';

interface OnboardingState {
  // Data
  progress: OnboardingProgress | null;
  taskDefinitions: TaskDefinition[];

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchProgress: () => Promise<void>;
  fetchTaskDefinitions: () => Promise<void>;
  updateTask: (taskId: string, completed: boolean) => Promise<void>;
  startTour: () => Promise<void>;
  completeTour: (skipped?: boolean) => Promise<void>;
  dismissChecklist: (dismissed?: boolean) => Promise<void>;
  toggleCollapse: (collapsed: boolean) => Promise<void>;
  clearError: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  // Initial state
  progress: null,
  taskDefinitions: [],
  isLoading: false,
  error: null,

  /**
   * Fetch user's onboarding progress (role-filtered)
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
   * Fetch task definitions (metadata) filtered by role
   */
  fetchTaskDefinitions: async () => {
    try {
      const response = await getTaskDefinitions();
      set({ taskDefinitions: response.tasks });
    } catch (error: any) {
      console.error('Failed to fetch task definitions:', error);
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
   * Dismiss or restore setup guide checklist
   */
  dismissChecklist: async (dismissed: boolean = true) => {
    try {
      await dismissChecklistApi(dismissed);

      // Update local state optimistically
      const currentProgress = get().progress;
      if (currentProgress) {
        set({
          progress: {
            ...currentProgress,
            checklist_dismissed: dismissed,
          },
        });
      }
    } catch (error: any) {
      console.error('Failed to dismiss checklist:', error);
      throw error;
    }
  },

  /**
   * Toggle checklist collapsed state
   */
  toggleCollapse: async (collapsed: boolean) => {
    try {
      await toggleChecklistCollapseApi(collapsed);

      // Update local state optimistically
      const currentProgress = get().progress;
      if (currentProgress) {
        set({
          progress: {
            ...currentProgress,
            checklist_collapsed: collapsed,
          },
        });
      }
    } catch (error: any) {
      console.error('Failed to toggle checklist:', error);
      throw error;
    }
  },

  /**
   * Clear error state
   */
  clearError: () => {
    set({ error: null });
  },
}));
