'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { FileText, TrendingUp, CheckCircle, ArrowLeft, Search } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/authStore';
import { proposalsApi, ProposalStats } from '@/lib/api/proposals';
import { BusinessStatusAnalytics } from '@/types';
import { formatDistanceToNow } from 'date-fns';

type BusinessStatus = 'active' | 'analyzed' | 'submitted';
type AnalyzedTab = 'all' | 'active' | 'no-bid';

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Stats state
  const [stats, setStats] = useState<ProposalStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Analytics view state
  const [selectedSection, setSelectedSection] = useState<BusinessStatus | null>(null);
  const [analytics, setAnalytics] = useState<BusinessStatusAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyzedTab, setAnalyzedTab] = useState<AnalyzedTab>('all');

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [valueFilter, setValueFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('updated');

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true);
        const data = await proposalsApi.getStats();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setStatsLoading(false);
      }
    };

    if (user) {
      fetchStats();
    }
  }, [user]);

  // Fetch analytics when section is selected
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!selectedSection) return;

      try {
        setAnalyticsLoading(true);
        const data = await proposalsApi.getAnalytics(selectedSection, 0, 100);
        setAnalytics(data);
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setAnalyticsLoading(false);
      }
    };

    if (selectedSection) {
      fetchAnalytics();
    }
  }, [selectedSection]);

  // Format currency
  const formatCurrency = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  // Filter and sort proposals
  const filteredProposals = useMemo(() => {
    if (!analytics) return [];

    let proposals = [...analytics.proposals];

    // Tab filtering for Analyzed section
    if (selectedSection === 'analyzed') {
      if (analyzedTab === 'active') {
        proposals = proposals.filter(p => p.business_status === 'active');
      } else if (analyzedTab === 'no-bid') {
        proposals = proposals.filter(p => p.business_status === 'no-bid');
      }
    }

    // Search filter
    if (searchQuery) {
      proposals = proposals.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.solicitation_number && p.solicitation_number.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Value filter
    if (valueFilter !== 'all') {
      proposals = proposals.filter(p => {
        const cost = p.total_cost || 0;
        switch (valueFilter) {
          case 'under500k': return cost < 500000;
          case '500k-1m': return cost >= 500000 && cost < 1000000;
          case '1m-5m': return cost >= 1000000 && cost < 5000000;
          case 'over5m': return cost >= 5000000;
          default: return true;
        }
      });
    }

    // Sorting
    proposals.sort((a, b) => {
      switch (sortBy) {
        case 'updated':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case 'oldest':
          return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        case 'highest':
          return (b.total_cost || 0) - (a.total_cost || 0);
        case 'lowest':
          return (a.total_cost || 0) - (b.total_cost || 0);
        case 'name-az':
          return a.name.localeCompare(b.name);
        case 'name-za':
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

    return proposals;
  }, [analytics, selectedSection, analyzedTab, searchQuery, valueFilter, sortBy]);

  // Calculate metrics for current tab
  const tabMetrics = useMemo(() => {
    if (!analytics || selectedSection !== 'analyzed') {
      return analytics;
    }

    const proposals = filteredProposals;
    const count = proposals.length;
    const total_value = proposals.reduce((sum, p) => sum + (p.total_cost || 0), 0);

    return {
      ...analytics,
      count,
      total_value,
      avg_value: count > 0 ? total_value / count : 0,
    };
  }, [analytics, filteredProposals, selectedSection]);

  // Handle back to overview
  const handleBack = () => {
    setSelectedSection(null);
    setAnalytics(null);
    setSearchQuery('');
    setValueFilter('all');
    setSortBy('updated');
    setAnalyzedTab('all');
  };

  // Handle card click
  const handleCardClick = (section: BusinessStatus) => {
    setSelectedSection(section);
  };

  // Handle row click
  const handleRowClick = (proposalId: string) => {
    router.push(`/proposals/${proposalId}`);
  };

  // Loading state
  if (statsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  // Overview cards
  if (!selectedSection) {
    return (
      <DashboardLayout>
        <div className="p-8 max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-foreground mb-8">Dashboard</h1>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Active Proposals */}
            <Card
              className="cursor-pointer hover:shadow-lg transition-all bg-blue-50 hover:bg-blue-100 border-blue-200"
              onClick={() => handleCardClick('active')}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-blue-600 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-blue-900 mb-1">
                  {stats?.active.count || 0}
                </h3>
                <p className="text-sm text-blue-700 font-medium mb-2">Active Proposals</p>
                <p className="text-lg font-semibold text-blue-900">
                  {formatCurrency(stats?.active.value || 0)}
                </p>
              </CardContent>
            </Card>

            {/* Analyzed Proposals */}
            <Card
              className="cursor-pointer hover:shadow-lg transition-all bg-gray-50 hover:bg-gray-100 border-gray-200"
              onClick={() => handleCardClick('analyzed')}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gray-600 rounded-lg">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-1">
                  {stats?.analyzed.count || 0}
                </h3>
                <p className="text-sm text-gray-700 font-medium mb-2">Analyzed Proposals</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(stats?.analyzed.value || 0)}
                </p>
              </CardContent>
            </Card>

            {/* Submitted Proposals */}
            <Card
              className="cursor-pointer hover:shadow-lg transition-all bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
              onClick={() => handleCardClick('submitted')}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-emerald-600 rounded-lg">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-emerald-900 mb-1">
                  {stats?.submitted.count || 0}
                </h3>
                <p className="text-sm text-emerald-700 font-medium mb-2">Submitted Proposals</p>
                <p className="text-lg font-semibold text-emerald-900">
                  {formatCurrency(stats?.submitted.value || 0)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Analytics view
  const metrics = tabMetrics || analytics;
  const sectionTitle = selectedSection === 'active' ? 'Active Proposals' :
                       selectedSection === 'analyzed' ? 'Analyzed Proposals' :
                       'Submitted Proposals';

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" onClick={handleBack} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Overview
          </Button>

          <h1 className="text-3xl font-bold text-foreground mb-4">{sectionTitle}</h1>

          {analyticsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* Summary Metrics */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Count</p>
                    <p className="text-2xl font-bold">{metrics?.count || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p className="text-2xl font-bold">{formatCurrency(metrics?.total_value || 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Avg Value</p>
                    <p className="text-2xl font-bold">{formatCurrency(metrics?.avg_value || 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Avg Age</p>
                    <p className="text-2xl font-bold">{metrics?.avg_age_days || 0} days</p>
                  </CardContent>
                </Card>
              </div>

              {/* Tabs for Analyzed section */}
              {selectedSection === 'analyzed' && (
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setAnalyzedTab('all')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      analyzedTab === 'all'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    All ({analytics?.count || 0})
                  </button>
                  <button
                    onClick={() => setAnalyzedTab('active')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      analyzedTab === 'active'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    Active ({analytics?.proposals.filter(p => p.business_status === 'active').length || 0})
                  </button>
                  <button
                    onClick={() => setAnalyzedTab('no-bid')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      analyzedTab === 'no-bid'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    No-Bid ({analytics?.proposals.filter(p => p.business_status === 'no-bid').length || 0})
                  </button>
                </div>
              )}

              {/* Filters and Search */}
              <Card className="mb-6">
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search proposals..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <select
                      value={valueFilter}
                      onChange={(e) => setValueFilter(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-border bg-background"
                    >
                      <option value="all">All Values</option>
                      <option value="under500k">Under $500K</option>
                      <option value="500k-1m">$500K - $1M</option>
                      <option value="1m-5m">$1M - $5M</option>
                      <option value="over5m">Over $5M</option>
                    </select>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-border bg-background"
                    >
                      <option value="updated">Most Recently Updated</option>
                      <option value="oldest">Oldest First</option>
                      <option value="highest">Highest Value</option>
                      <option value="lowest">Lowest Value</option>
                      <option value="name-az">Name A-Z</option>
                      <option value="name-za">Name Z-A</option>
                    </select>
                  </div>
                </CardContent>
              </Card>

              {/* Proposals Table */}
              {filteredProposals.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    {searchQuery || valueFilter !== 'all'
                      ? 'No proposals match your search'
                      : 'No proposals in this category yet'}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Solicitation #</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Value</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Last Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProposals.map((proposal) => (
                            <tr
                              key={proposal.id}
                              onClick={() => handleRowClick(proposal.id)}
                              className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-3">
                                <span className="font-medium text-foreground">{proposal.name}</span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {proposal.solicitation_number || '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-semibold">
                                {proposal.total_cost ? formatCurrency(proposal.total_cost) : '-'}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(proposal.updated_at), { addSuffix: true })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
