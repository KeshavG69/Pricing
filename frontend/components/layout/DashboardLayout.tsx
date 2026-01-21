'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { useBillingStore } from '@/lib/stores/billingStore';
import TopNavBar from './TopNavBar';
import ProposalsSidebar from './ProposalsSidebar';
import { AddPaymentPrompt, PaymentRequiredModal } from '@/components/billing';
import { TermsBlockingModal } from '@/components/terms/TermsBlockingModal';
import HelpCenterModal from '@/components/help/HelpCenterModal';
import { SetupGuideChecklist, ProductTour } from '@/components/onboarding';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const { user, isInitializing } = useAuthStore();
  const { fetchBillingStatus } = useBillingStore();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Redirect to login if not authenticated (wait for initialization first)
  useEffect(() => {
    if (!isInitializing && !user) {
      router.push('/auth/login');
    }
  }, [user, isInitializing, router]);

  // Fetch billing status on mount (shows payment prompt for admins)
  useEffect(() => {
    if (user) {
      fetchBillingStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.organization_id]);

  // Show loading spinner during auth initialization
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // After initialization, if no user, return null (redirect will happen)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/10">
      {/* Top Navigation Bar */}
      <TopNavBar
        user={user}
        onMobileSidebarToggle={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
      />

      {/* Proposals Sidebar */}
      <ProposalsSidebar
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content */}
      <main className="pt-16 md:ml-72 p-6">
        <div className="animate-fade-in">
          {children}
        </div>
      </main>

      {/* Billing Modals */}
      <AddPaymentPrompt />
      <PaymentRequiredModal />

      {/* Terms and Conditions Blocking Modal */}
      <TermsBlockingModal />

      {/* Help Center Modal */}
      <HelpCenterModal />

      {/* Onboarding Setup Guide Checklist */}
      <SetupGuideChecklist />

      {/* Product Tour */}
      <ProductTour />
    </div>
  );
}
