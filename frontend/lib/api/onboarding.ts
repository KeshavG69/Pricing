import { apiClient } from './client';

/**
 * Onboarding API client for tracking user onboarding progress
 */

// Types
export interface TaskDefinition {
  id: string;
  label: string;
  description: string;
  order: number;
  required_role?: 'admin' | null; // null means both admin and user can see it
}

export interface CompletionStats {
  completed_count: number;
  total_count: number;
  percentage: number;
}

// Static task definitions (no API call needed)
export const ONBOARDING_TASKS: TaskDefinition[] = [
  {
    id: "tour_completed",
    label: "Complete product tour",
    description: "Take a guided tour of PriceIQ features",
    order: 1,
    required_role: null, // Both admin and user
  },
  {
    id: "first_proposal_uploaded",
    label: "Upload your first proposal",
    description: "Upload a contract document to get started",
    order: 2,
    required_role: null, // Both admin and user
  },
  {
    id: "rates_configured",
    label: "Configure default rates",
    description: "Set your organization's Fringe, OH, G&A, and Fee rates",
    order: 3,
    required_role: 'admin', // Admin only
  },
  {
    id: "payment_added",
    label: "Add payment method",
    description: "Add a credit card to enable proposal generation",
    order: 4,
    required_role: 'admin', // Admin only
  },
  {
    id: "team_invited",
    label: "Invite team members",
    description: "Collaborate by inviting colleagues to your workspace",
    order: 5,
    required_role: 'admin', // Admin only
  },
];

/**
 * Filter tasks by user role (client-side)
 */
export const getTaskDefinitionsByRole = (role: 'admin' | 'user'): TaskDefinition[] => {
  return ONBOARDING_TASKS.filter(task => {
    // Include task if no role requirement or user is admin and task requires admin
    return task.required_role === null || (role === 'admin' && task.required_role === 'admin');
  });
};

export interface OnboardingProgress {
  id: string;
  user_id: string;
  organization_id: string;

  // Tour state
  tour_completed: boolean;
  tour_skipped: boolean;
  tour_last_step: number;
  tour_started_at: string | null;
  tour_completed_at: string | null;

  // Tasks (filtered by role)
  tasks: Record<string, boolean>;

  // UI state
  checklist_dismissed: boolean;
  checklist_collapsed: boolean;

  // Completion stats
  completion_stats: CompletionStats;

  createdAt: string;
  updatedAt: string;
}

export interface TaskDefinitionsResponse {
  tasks: TaskDefinition[];
  role: string;
}

export interface UpdateTaskRequest {
  task_id: string;
  completed: boolean;
}

export interface CompleteTourRequest {
  skipped: boolean;
}

export interface DismissChecklistRequest {
  dismissed: boolean;
}

export interface CollapseChecklistRequest {
  collapsed: boolean;
}

/**
 * Get task definitions filtered by user's role
 */
export const getTaskDefinitions = async (): Promise<TaskDefinitionsResponse> => {
  const response = await apiClient.get<TaskDefinitionsResponse>('/onboarding/tasks');
  return response.data;
};

/**
 * Get user's onboarding progress (role-filtered)
 */
export const getOnboardingProgress = async (): Promise<OnboardingProgress> => {
  const response = await apiClient.get<OnboardingProgress>('/onboarding/progress');
  return response.data;
};

/**
 * Update a specific task completion status
 */
export const updateTask = async (taskId: string, completed: boolean): Promise<{ progress: OnboardingProgress }> => {
  const response = await apiClient.put<{ message: string; progress: OnboardingProgress }>('/onboarding/task', {
    task_id: taskId,
    completed
  });
  return response.data;
};

/**
 * Mark product tour as started
 */
export const startTour = async (): Promise<{ message: string }> => {
  const response = await apiClient.post<{ message: string }>('/onboarding/tour/start');
  return response.data;
};

/**
 * Mark product tour as completed or skipped
 */
export const completeTour = async (skipped: boolean = false): Promise<{ message: string; progress: OnboardingProgress }> => {
  const response = await apiClient.post<{ message: string; progress: OnboardingProgress }>('/onboarding/tour/complete', {
    skipped
  });
  return response.data;
};

/**
 * Restart the product tour
 */
export const restartTour = async (): Promise<{ message: string; progress: OnboardingProgress }> => {
  const response = await apiClient.post<{ message: string; progress: OnboardingProgress }>('/onboarding/tour/restart');
  return response.data;
};

/**
 * Dismiss or restore setup guide checklist
 */
export const dismissChecklist = async (dismissed: boolean = true): Promise<{ message: string }> => {
  const response = await apiClient.put<{ message: string }>('/onboarding/checklist/dismiss', {
    dismissed
  });
  return response.data;
};

/**
 * Toggle checklist collapsed state
 */
export const toggleChecklistCollapse = async (collapsed: boolean): Promise<{ message: string }> => {
  const response = await apiClient.put<{ message: string }>('/onboarding/checklist/collapse', {
    collapsed
  });
  return response.data;
};
