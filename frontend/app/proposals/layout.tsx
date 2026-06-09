/**
 * /proposals route group layout.
 *
 * Wraps the proposal workspace pages (e.g. /proposals/[id]) in the same
 * DashboardLayout shell that /dashboard/* uses. By living in a layout
 * file (instead of being imported inside each page), the layout — and
 * crucially the ProposalsSidebar inside it — persists across all
 * navigations within this route group: opening a proposal, switching
 * between proposals, etc. The Zustand-cached proposals list is reused
 * with no re-fetch or empty-state flash.
 */

import DashboardLayout from '@/components/layout/DashboardLayout';

export default function ProposalsRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
