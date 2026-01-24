'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '@/lib/stores/onboardingStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

// Navigation mapping for each task
const TASK_NAVIGATION: Record<string, string> = {
  first_proposal_uploaded: '/dashboard/upload',
  rates_configured: '/dashboard/company-repository',
  payment_added: '/dashboard/settings/organization?tab=billing',
  team_invited: '/dashboard/settings/organization?tab=members',
};

export function SetupGuideChecklist() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { progress, taskDefinitions, isLoading, toggleCollapse, getCollapseState, syncTaskDefinitions } = useOnboardingStore();

  console.log('[Checklist] Render check:', {
    user: !!user,
    role: user?.role,
    progress: !!progress,
    taskDefinitions: taskDefinitions?.length,
    isCollapsed: progress?.checklist_collapsed
  });

  // Clear old localStorage dismissed state (one-time cleanup)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('checklist_dismissed');
    }
  }, []);

  // Ensure task definitions are loaded for the user's role
  useEffect(() => {
    if (user?.role && (!taskDefinitions || taskDefinitions.length === 0)) {
      console.log('[Checklist] Loading task definitions for role:', user.role);
      syncTaskDefinitions(user.role);
    }
  }, [user?.role, taskDefinitions]);

  // Initialize collapse state from localStorage on mount (keep collapse, remove dismiss)
  useEffect(() => {
    if (progress) {
      // Initialize collapse state
      const storedCollapsed = getCollapseState();
      if (progress.checklist_collapsed !== storedCollapsed) {
        toggleCollapse(storedCollapsed);
      }
    }
  }, [progress?.id]); // Only run when progress changes

  // Don't render if no task definitions loaded yet or user not loaded
  if (!user || !taskDefinitions || taskDefinitions.length === 0) {
    console.log('[Checklist] Not rendering - missing data:', { user: !!user, taskDefinitions: taskDefinitions?.length });
    return null;
  }

  // ALWAYS show checklist - boss wants it visible for all users
  console.log('[Checklist] Showing checklist for user:', user.email);

  // Create default progress for new users without backend progress
  const effectiveProgress = progress || {
    tasks: {} as Record<string, boolean>,
    checklist_dismissed: false,
    checklist_collapsed: getCollapseState(),
    completion_stats: {
      completed_count: 0,
      total_count: taskDefinitions.length,
      percentage: 0,
    },
  };

  // Don't render if all tasks completed
  if (effectiveProgress.completion_stats.percentage === 100) {
    return null;
  }

  const isCollapsed = effectiveProgress.checklist_collapsed;
  const stats = effectiveProgress.completion_stats;

  const handleToggleCollapse = () => {
    toggleCollapse(!isCollapsed);
  };

  const handleTaskClick = (taskId: string) => {
    // Don't navigate if task is completed
    if (effectiveProgress.tasks[taskId]) {
      return;
    }

    // Navigate to the appropriate page
    const navigationPath = TASK_NAVIGATION[taskId];
    if (navigationPath) {
      router.push(navigationPath);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-40">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors rounded-t-xl"
        onClick={handleToggleCollapse}
      >
        <button
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          aria-label={isCollapsed ? 'Expand checklist' : 'Collapse checklist'}
        >
          {isCollapsed ? (
            <ChevronUp className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          )}
        </button>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Setup Guide</h3>
          <p className="text-xs text-gray-500">
            {stats.completed_count} of {stats.total_count} · {Math.round(stats.percentage)}%
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {!isCollapsed && (
        <div className="px-3 pb-2">
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${stats.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Task List */}
      {!isCollapsed && (
        <div className="px-3 pb-3 space-y-1.5 max-h-80 overflow-y-auto">
          {isLoading && taskDefinitions.length === 0 ? (
            <div className="text-center py-4 text-sm text-gray-500">Loading...</div>
          ) : (
            taskDefinitions.map((task) => {
              const isCompleted = effectiveProgress.tasks[task.id] || false;
              const isClickable = !isCompleted && TASK_NAVIGATION[task.id];

              return (
                <div
                  key={task.id}
                  onClick={() => handleTaskClick(task.id)}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-all ${
                    isCompleted
                      ? 'bg-green-50/50'
                      : isClickable
                      ? 'hover:bg-gray-50 cursor-pointer'
                      : ''
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                      isCompleted
                        ? 'bg-green-500'
                        : 'bg-white border-2 border-gray-300'
                    }`}
                  >
                    {isCompleted && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </div>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <h4
                      className={`text-xs font-medium transition-colors ${
                        isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'
                      }`}
                    >
                      {task.label}
                    </h4>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
