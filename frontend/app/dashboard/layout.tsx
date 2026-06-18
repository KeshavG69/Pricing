/**
 * Dashboard route group layout.
 *
 * Wrapping DashboardLayout at the route-group level (instead of inside each
 * page component) is the Next.js App Router idiom for "persist this shell
 * across child route navigations." The TopNavBar + ProposalsSidebar + billing
 * modals stay mounted; only the page content swaps when the user navigates
 * between /dashboard/* routes.
 *
 * Before this layout existed, every page imported DashboardLayout itself,
 * which meant the sidebar would unmount + remount on every navigation,
 * re-triggering its mount-effect fetch of the proposals list.
 */

import DashboardLayout from '@/components/layout/DashboardLayout';

export default function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
