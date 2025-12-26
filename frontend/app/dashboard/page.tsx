'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent } from '@/components/ui/Card';
import { FileText, CheckCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/authStore';
import { proposalsApi, ProposalStats } from '@/lib/api/proposals';
import { cacheManager } from '@/lib/cache';
import { deduplicateRequest } from '@/lib/utils/requestDeduplication';

export default function DashboardPage() {
  const { user } = useAuthStore();

  // Stats state
  const [stats, setStats] = useState<ProposalStats>({
    total: 0,
    completed: 0,
    processing: 0,
    submitted: 0,
    error: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Fetch stats on mount and when organization changes
  useEffect(() => {
    const fetchData = async () => {
      // Fetch stats with conditional refresh pattern
      const orgId = user?.organization_id;
      if (!orgId) {
        console.warn('[DASHBOARD] No organization ID, skipping stats fetch');
        return;
      }

      // Cache key scoped to organization
      const cacheKey = `stats:${orgId}`;

      // Check cache first
      const cached = cacheManager.get<ProposalStats>(cacheKey);

      // If cache is valid, use cached data (no fetch)
      if (cached && !cached.isExpired) {
        console.log('[DASHBOARD] ✅ Using cached stats (no fetch needed)');
        setStats(cached.data);
        setStatsLoading(false);
        return;
      }

      // Cache expired or missing - fetch from API
      setStatsLoading(true);
      try {
        console.log(`[DASHBOARD] Fetching stats... (expired=${cached?.isExpired})`);

        // Deduplicate request to prevent multiple simultaneous calls
        const freshStats = await deduplicateRequest(
          cacheKey,
          () => proposalsApi.getStats()
        );

        // Update with fresh stats and cache
        setStats(freshStats);
        cacheManager.set(cacheKey, freshStats, 2 * 60 * 1000); // Cache for 2 minutes
        console.log('[DASHBOARD] Stats loaded and cached');
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setStatsLoading(false);
      }
    };

    if (user?.organization_id) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.organization_id]);

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, here's what's happening with your proposals.</p>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="hover-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">Total</span>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">
                {statsLoading ? '...' : stats.total}
              </p>
              <p className="text-sm text-muted-foreground">Total proposals</p>
            </CardContent>
          </Card>

          <Card className="hover-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">In Progress</span>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">
                {statsLoading ? '...' : stats.completed}
              </p>
              <p className="text-sm text-muted-foreground">In Progress proposals</p>
            </CardContent>
          </Card>

          <Card className="hover-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-full">Submitted</span>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">
                {statsLoading ? '...' : stats.submitted}
              </p>
              <p className="text-sm text-muted-foreground">Submitted proposals</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
