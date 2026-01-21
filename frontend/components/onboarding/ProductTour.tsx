'use client';

import { useEffect, useState, useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useOnboardingStore } from '@/lib/stores/onboardingStore';
import { useAuthStore } from '@/lib/stores/authStore';

// Define tour steps for admin users
const ADMIN_TOUR_STEPS: Step[] = [
  {
    target: 'body',
    content: (
      <div>
        <h2 className="text-lg font-semibold mb-2">Welcome to PriceIQ! 👋</h2>
        <p className="text-sm text-gray-600">
          Let's take a quick tour to show you around. You can skip this anytime by clicking "Skip" or pressing ESC.
        </p>
      </div>
    ),
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="upload-button"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-1">Upload Proposals</h3>
        <p className="text-sm text-gray-600">
          Start by uploading your contract documents. Our AI will extract job descriptions and match them to wage data.
        </p>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="proposals-list"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-1">Your Proposals</h3>
        <p className="text-sm text-gray-600">
          All your proposals are listed here. Click any proposal to open the pricing workspace and start editing.
        </p>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="company-repository"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-1">Company Rates</h3>
        <p className="text-sm text-gray-600">
          Configure your organization's default rates (Fringe, OH, G&A, Fee) here. These will be applied to all new proposals.
        </p>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="settings-menu"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-1">Settings & Team</h3>
        <p className="text-sm text-gray-600">
          Manage your organization, invite team members, and add payment methods from here.
        </p>
      </div>
    ),
    placement: 'bottom',
  },
  {
    target: 'body',
    content: (
      <div>
        <h2 className="text-lg font-semibold mb-2">You're all set! 🎉</h2>
        <p className="text-sm text-gray-600 mb-3">
          You're ready to create your first proposal. Check the setup guide in the bottom-right corner for next steps.
        </p>
        <p className="text-xs text-gray-500">
          Tip: You can always restart this tour from the help menu.
        </p>
      </div>
    ),
    placement: 'center',
  },
];

// Define tour steps for regular users
const USER_TOUR_STEPS: Step[] = [
  {
    target: 'body',
    content: (
      <div>
        <h2 className="text-lg font-semibold mb-2">Welcome to PriceIQ! 👋</h2>
        <p className="text-sm text-gray-600">
          Let's take a quick tour to show you around. You can skip this anytime by clicking "Skip" or pressing ESC.
        </p>
      </div>
    ),
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="upload-button"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-1">Upload Proposals</h3>
        <p className="text-sm text-gray-600">
          Start by uploading your contract documents. Our AI will extract job descriptions and match them to wage data.
        </p>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="proposals-list"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-1">Your Proposals</h3>
        <p className="text-sm text-gray-600">
          All your proposals are listed here. Click any proposal to open the pricing workspace and start editing.
        </p>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="settings-menu"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-1">Your Settings</h3>
        <p className="text-sm text-gray-600">
          Manage your account settings and preferences from here.
        </p>
      </div>
    ),
    placement: 'bottom',
  },
  {
    target: 'body',
    content: (
      <div>
        <h2 className="text-lg font-semibold mb-2">You're all set! 🎉</h2>
        <p className="text-sm text-gray-600 mb-3">
          You're ready to start working on proposals. Check the setup guide in the bottom-right corner for next steps.
        </p>
        <p className="text-xs text-gray-500">
          Tip: You can always restart this tour from the help menu.
        </p>
      </div>
    ),
    placement: 'center',
  },
];

export function ProductTour() {
  const { user } = useAuthStore();
  const { progress, fetchProgress, startTour, completeTour } = useOnboardingStore();
  const [runTour, setRunTour] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  // Fetch progress on mount
  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // Determine which steps to show based on role
  useEffect(() => {
    if (user?.role === 'admin') {
      setSteps(ADMIN_TOUR_STEPS);
    } else {
      setSteps(USER_TOUR_STEPS);
    }
  }, [user?.role]);

  // Auto-start tour if not completed and not skipped
  useEffect(() => {
    if (progress && !progress.tour_completed && !progress.tour_skipped) {
      // Delay slightly to ensure DOM elements are rendered
      const timer = setTimeout(() => {
        setRunTour(true);
        startTour();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [progress, startTour]);

  // Handle tour callbacks
  const handleJoyrideCallback = useCallback(
    async (data: CallBackProps) => {
      const { status, action } = data;
      const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

      if (finishedStatuses.includes(status as string)) {
        setRunTour(false);

        // Mark tour as completed or skipped
        const skipped = status === STATUS.SKIPPED || action === 'skip';
        try {
          await completeTour(skipped);
        } catch (error) {
          console.error('Failed to complete tour:', error);
        }
      }
    },
    [completeTour]
  );

  // Don't render if already completed/skipped
  if (!progress || progress.tour_completed || progress.tour_skipped) {
    return null;
  }

  return (
    <Joyride
      steps={steps}
      run={runTour}
      continuous
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: '#3b82f6', // Blue-500
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 8,
          padding: 20,
        },
        buttonNext: {
          backgroundColor: '#3b82f6',
          borderRadius: 6,
          padding: '8px 16px',
          fontSize: '14px',
        },
        buttonBack: {
          color: '#6b7280',
          marginRight: 8,
        },
        buttonSkip: {
          color: '#6b7280',
          fontSize: '13px',
        },
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        open: 'Open',
        skip: 'Skip tour',
      }}
    />
  );
}
