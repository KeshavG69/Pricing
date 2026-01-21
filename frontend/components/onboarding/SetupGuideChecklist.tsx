'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '@/lib/stores/onboardingStore';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';

// Navigation mapping for each task
const TASK_NAVIGATION: Record<string, string> = {
  first_proposal_uploaded: '/dashboard/upload',
  rates_configured: '/dashboard/company-repository',
  payment_added: '/dashboard/settings/organization?tab=billing',
  team_invited: '/dashboard/settings/organization?tab=members',
};

export function SetupGuideChecklist() {
  const router = useRouter();
  const { progress, taskDefinitions, isLoading, fetchProgress, fetchTaskDefinitions, toggleCollapse, dismissChecklist } = useOnboardingStore();

  useEffect(() => {
    // Fetch progress and task definitions on mount
    fetchProgress();
    fetchTaskDefinitions();
  }, [fetchProgress, fetchTaskDefinitions]);

  // Don't render if dismissed or no progress yet
  if (!progress || progress.checklist_dismissed) {
    return null;
  }

  // Don't render if all tasks completed
  if (progress.completion_stats.percentage === 100) {
    return null;
  }

  const isCollapsed = progress.checklist_collapsed;
  const stats = progress.completion_stats;

  const handleToggleCollapse = async () => {
    try {
      await toggleCollapse(!isCollapsed);
    } catch (error) {
      console.error('Failed to toggle collapse:', error);
    }
  };

  const handleDismiss = async () => {
    try {
      await dismissChecklist(true);
    } catch (error) {
      console.error('Failed to dismiss checklist:', error);
    }
  };

  const handleTaskClick = (taskId: string) => {
    // Don't navigate if task is completed or it's the tour task
    if (progress?.tasks[taskId] || taskId === 'tour_completed') {
      return;
    }

    // Navigate to the appropriate page
    const navigationPath = TASK_NAVIGATION[taskId];
    if (navigationPath) {
      router.push(navigationPath);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3 flex-1">
          <button
            onClick={handleToggleCollapse}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            aria-label={isCollapsed ? 'Expand checklist' : 'Collapse checklist'}
          >
            {isCollapsed ? (
              <ChevronUp className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-600" />
            )}
          </button>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Setup Guide</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {stats.completed_count} of {stats.total_count} completed · {Math.round(stats.percentage)}%
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          aria-label="Dismiss setup guide"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Progress Bar */}
      {!isCollapsed && (
        <div className="px-4 pt-3 pb-2">
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${stats.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Task List */}
      {!isCollapsed && (
        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {isLoading && taskDefinitions.length === 0 ? (
            <div className="text-center py-4 text-sm text-gray-500">Loading...</div>
          ) : (
            taskDefinitions.map((task) => {
              const isCompleted = progress.tasks[task.id] || false;
              const isClickable = !isCompleted && task.id !== 'tour_completed' && TASK_NAVIGATION[task.id];

              return (
                <div
                  key={task.id}
                  onClick={() => handleTaskClick(task.id)}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                    isCompleted
                      ? 'bg-green-50 border border-green-100'
                      : isClickable
                      ? 'bg-gray-50 border border-gray-100 hover:bg-blue-50 hover:border-blue-200 cursor-pointer'
                      : 'bg-gray-50 border border-gray-100'
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 transition-colors ${
                      isCompleted
                        ? 'bg-green-500'
                        : 'bg-white border-2 border-gray-300'
                    }`}
                  >
                    {isCompleted && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </div>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <h4
                      className={`text-sm font-medium transition-colors ${
                        isCompleted ? 'text-green-900 line-through' : 'text-gray-900'
                      }`}
                    >
                      {task.label}
                    </h4>
                    {!isCompleted && (
                      <p className="text-xs text-gray-500 mt-1">{task.description}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Footer (collapsed state) */}
      {isCollapsed && (
        <div className="px-4 pb-4">
          <p className="text-xs text-center text-gray-500">
            Click to expand setup guide
          </p>
        </div>
      )}
    </div>
  );
}
