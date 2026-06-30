'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '@/lib/stores/onboardingStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { Check, CheckCircle2, ChevronDown } from 'lucide-react';

// Navigation mapping for each task
const TASK_NAVIGATION: Record<string, string> = {
  first_proposal_uploaded: '/dashboard/upload',
  rates_configured: '/dashboard/company-repository',
  payment_added: '/dashboard/settings/organization?tab=billing',
  team_invited: '/dashboard/settings/organization?tab=members',
};

export function SetupGuideButton() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { progress, taskDefinitions, syncTaskDefinitions } = useOnboardingStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ensure task definitions are loaded for the user's role
  useEffect(() => {
    if (user?.role && (!taskDefinitions || taskDefinitions.length === 0)) {
      syncTaskDefinitions(user.role);
    }
  }, [user?.role, taskDefinitions, syncTaskDefinitions]);

  // Don't render if no task definitions loaded yet or user not loaded
  if (!user || !taskDefinitions || taskDefinitions.length === 0) {
    return null;
  }

  // Create default progress for new users without backend progress
  const effectiveProgress = progress || {
    tasks: {} as Record<string, boolean>,
    checklist_dismissed: false,
    checklist_collapsed: false,
    completion_stats: {
      completed_count: 0,
      total_count: taskDefinitions.length,
      percentage: 0,
    },
  };

  const stats = effectiveProgress.completion_stats;

  const handleTaskClick = (taskId: string) => {
    // Navigate to the appropriate page (even if task is completed)
    const navigationPath = TASK_NAVIGATION[taskId];
    if (navigationPath) {
      setIsOpen(false);
      router.push(navigationPath);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-muted transition-all duration-200 active:scale-95 text-muted-foreground hover:text-foreground relative text-sm font-medium"
        title={`Onboarding (${stats.completed_count}/${stats.total_count})`}
      >
        <CheckCircle2 className="w-4 h-4" />
        Onboarding
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-200">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Setup Guide</h3>
              <p className="text-xs text-gray-500">
                {stats.completed_count} of {stats.total_count} · {Math.round(stats.percentage)}%
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="px-3 pt-2">
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500 ease-out"
                style={{ width: `${stats.percentage}%` }}
              />
            </div>
          </div>

          {/* Task List */}
          <div className="px-3 py-3 space-y-1.5 max-h-80 overflow-y-auto">
            {taskDefinitions.map((task) => {
              const isCompleted = effectiveProgress.tasks[task.id] || false;
              const hasNavigation = !!TASK_NAVIGATION[task.id];

              return (
                <div
                  key={task.id}
                  onClick={() => handleTaskClick(task.id)}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-all ${
                    isCompleted
                      ? 'bg-green-50/50 hover:bg-green-100/50 cursor-pointer'
                      : hasNavigation
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
                        isCompleted ? 'text-gray-700' : 'text-gray-900'
                      }`}
                    >
                      {task.label}
                    </h4>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
