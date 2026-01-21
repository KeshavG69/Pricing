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
        <h3 className="text-base font-semibold mb-2">Step 1: Upload Proposals</h3>
        <p className="text-sm text-gray-600 mb-2">
          Click the "New Proposal" button to start. You'll be able to:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4">
          <li>• Upload contract documents (PDF, Word, etc.)</li>
          <li>• AI will extract job descriptions automatically</li>
          <li>• Jobs are matched to wage data from BLS database</li>
        </ul>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="proposals-tab"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-2">Step 2: Proposals Tab</h3>
        <p className="text-sm text-gray-600 mb-2">
          Click the "Proposals" tab in the navigation to view all your proposals:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4">
          <li>• See all proposals in one place</li>
          <li>• Click any proposal to open the pricing workspace</li>
          <li>• Edit labor rates and calculations</li>
          <li>• Share with team members</li>
          <li>• Export to Excel when ready</li>
        </ul>
      </div>
    ),
    placement: 'bottom',
  },
  {
    target: '[data-tour="company-repository"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-2">Step 3: Configure Company Rates</h3>
        <p className="text-sm text-gray-600 mb-2">
          Click "Company Rates" to set your default rates:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4">
          <li>• <strong>Fringe:</strong> Employee benefits (default: 24.7%)</li>
          <li>• <strong>OH (On-Site/Off-Site):</strong> Overhead rates</li>
          <li>• <strong>G&A:</strong> General & Administrative (default: 22.4%)</li>
          <li>• <strong>Fee:</strong> Profit margin (default: 8%)</li>
        </ul>
        <p className="text-sm text-gray-600 mt-2">
          These rates will be automatically applied to all new proposals.
        </p>
      </div>
    ),
    placement: 'bottom',
  },
  {
    target: '[data-tour="organization-link"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-2">Step 4: Organization Management 📋</h3>
        <p className="text-sm text-gray-600 mb-3">
          <strong>Admins:</strong> Click "Organization" in the navigation to access:
        </p>
        <div className="space-y-2">
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="text-sm font-semibold text-blue-900 mb-1">👥 Team Tab:</p>
            <ul className="text-xs text-blue-800 space-y-1 ml-3">
              <li>• Invite team members via email</li>
              <li>• Assign roles: Admin or User</li>
              <li>• Manage team access</li>
            </ul>
          </div>
          <div className="bg-green-50 p-3 rounded-lg border border-green-200">
            <p className="text-sm font-semibold text-green-900 mb-1">💳 Billing Tab:</p>
            <ul className="text-xs text-green-800 space-y-1 ml-3">
              <li>• Add payment method (credit card)</li>
              <li>• View usage and billing history</li>
              <li>• First proposal is free!</li>
            </ul>
          </div>
        </div>
      </div>
    ),
    placement: 'bottom',
  },
  {
    target: '[data-tour="help-center"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-2">Step 5: Help Center ❓</h3>
        <p className="text-sm text-gray-600 mb-3">
          Need help? Click the question mark icon anytime to:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4">
          <li>• Ask questions using AI assistant</li>
          <li>• Search documentation and guides</li>
          <li>• Get instant answers about features</li>
          <li>• Learn tips and best practices</li>
        </ul>
        <p className="text-xs text-gray-500 mt-2 italic">
          Your AI-powered help is always one click away!
        </p>
      </div>
    ),
    placement: 'bottom',
  },
  {
    target: '[data-tour="settings-menu"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-2">Step 6: Account Settings ⚙️</h3>
        <p className="text-sm text-gray-600 mb-3">
          Click your profile menu, then select "Settings" to:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4">
          <li>• Update your name and profile</li>
          <li>• Change your password</li>
          <li>• Restart this product tour</li>
          <li>• Manage your account</li>
        </ul>
        <p className="text-xs text-gray-500 mt-2 italic">
          Keep your account secure and up to date.
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
          You're ready to create your first proposal. Check the setup guide in the bottom-right corner to track your progress.
        </p>
        <p className="text-xs text-gray-500">
          Tip: You can restart this tour anytime from Settings → Help & Support.
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
        <h3 className="text-base font-semibold mb-2">Step 1: Upload Proposals</h3>
        <p className="text-sm text-gray-600 mb-2">
          Click the "New Proposal" button to start. You'll be able to:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4">
          <li>• Upload contract documents (PDF, Word, etc.)</li>
          <li>• AI will extract job descriptions automatically</li>
          <li>• Jobs are matched to wage data from BLS database</li>
        </ul>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="proposals-tab"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-2">Step 2: Proposals Tab</h3>
        <p className="text-sm text-gray-600 mb-2">
          Click the "Proposals" tab in the navigation to view all your proposals:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4">
          <li>• See all proposals in one place</li>
          <li>• Click any proposal to open the pricing workspace</li>
          <li>• Edit labor rates and calculations</li>
          <li>• View shared proposals from your team</li>
          <li>• Work on active proposals</li>
        </ul>
      </div>
    ),
    placement: 'bottom',
  },
  {
    target: '[data-tour="help-center"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-2">Step 3: Help Center ❓</h3>
        <p className="text-sm text-gray-600 mb-3">
          Need help? Click the question mark icon anytime to:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4">
          <li>• Ask questions using AI assistant</li>
          <li>• Search documentation and guides</li>
          <li>• Get instant answers about features</li>
          <li>• Learn tips and best practices</li>
        </ul>
        <p className="text-xs text-gray-500 mt-2 italic">
          Your AI-powered help is always one click away!
        </p>
      </div>
    ),
    placement: 'bottom',
  },
  {
    target: '[data-tour="settings-menu"]',
    content: (
      <div>
        <h3 className="text-base font-semibold mb-2">Step 4: Account Settings ⚙️</h3>
        <p className="text-sm text-gray-600 mb-3">
          Click your profile menu, then select "Settings" to:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4">
          <li>• Update your name and profile</li>
          <li>• Change your password</li>
          <li>• Restart this tour anytime</li>
          <li>• Manage your account</li>
        </ul>
        <p className="text-xs text-gray-500 mt-2 italic">
          Keep your account secure and up to date.
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
          You're ready to start working on proposals. Check the setup guide in the bottom-right corner to track your progress.
        </p>
        <p className="text-xs text-gray-500">
          Tip: You can restart this tour anytime from Settings → Help & Support.
        </p>
      </div>
    ),
    placement: 'center',
  },
];

export function ProductTour() {
  const { user } = useAuthStore();
  const { progress, startTour, completeTour } = useOnboardingStore();
  const [runTour, setRunTour] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  // No need to fetch progress - it's synced from user data via authStore

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
      const { status, action, index, type } = data;
      console.log('[ProductTour] Callback:', { type, status, action, index, totalSteps: steps.length });

      const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

      if (finishedStatuses.includes(status as string)) {
        console.log('[ProductTour] Tour finished:', status);
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
    [completeTour, steps.length]
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
