'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { FileText, TrendingUp, CheckCircle, ArrowLeft, Search, ChevronDown, Check } from 'lucide-react';
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

  // Dropdown states
  const [valueDropdownOpen, setValueDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const valueDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (valueDropdownRef.current && !valueDropdownRef.current.contains(event.target as Node)) {
        setValueDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setSortDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format currency
  const formatCurrency = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  // Get the most recent timestamp (updated_at or created_at)
  const getLastModified = (proposal: any): string => {
    // Use updated_at if available, otherwise fall back to created_at
    const timestamp = proposal.updated_at || proposal.created_at;
    if (!timestamp) return 'Unknown';

    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (error) {
      console.error('Error formatting date:', error, timestamp);
      return 'Unknown';
    }
  };

  // Get label for value filter
  const getValueFilterLabel = (value: string): string => {
    const labels: Record<string, string> = {
      all: 'All Values',
      under500k: 'Under $500K',
      '500k-1m': '$500K - $1M',
      '1m-5m': '$1M - $5M',
      over5m: 'Over $5M',
    };
    return labels[value] || 'All Values';
  };

  // Get label for sort option
  const getSortLabel = (value: string): string => {
    const labels: Record<string, string> = {
      updated: 'Most Recently Updated',
      oldest: 'Oldest First',
      highest: 'Highest Value',
      lowest: 'Lowest Value',
      'name-az': 'Name A-Z',
      'name-za': 'Name Z-A',
    };
    return labels[value] || 'Most Recently Updated';
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
        case 'updated': {
          // Use updated_at if available and different from created_at, otherwise use created_at
          const aTime = new Date(a.updated_at || a.created_at).getTime();
          const bTime = new Date(b.updated_at || b.created_at).getTime();
          return bTime - aTime;
        }
        case 'oldest': {
          const aTime = new Date(a.updated_at || a.created_at).getTime();
          const bTime = new Date(b.updated_at || b.created_at).getTime();
          return aTime - bTime;
        }
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
      <>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      
      </>
  );
  }

  // Overview cards
  if (!selectedSection) {
    return (
      <>
        <div className="p-8 max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-foreground mb-8">Dashboard</h1>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Active Proposals */}
            <Card
              className="cursor-pointer hover:shadow-lg transition-all bg-blue-50 hover:bg-blue-100 border-blue-200"
              onClick={() => handleCardClick('active')}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="p-3 bg-blue-600 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-bold text-blue-900">
                    {stats?.active.count || 0}
                  </h3>
                  <p className="text-sm text-blue-700 font-medium">Active Proposals</p>
                  <p className="text-xl font-semibold text-blue-900 pt-2">
                    {formatCurrency(stats?.active.value || 0)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Analyzed Proposals */}
            <Card
              className="cursor-pointer hover:shadow-lg transition-all bg-gray-50 hover:bg-gray-100 border-gray-200"
              onClick={() => handleCardClick('analyzed')}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="p-3 bg-gray-600 rounded-lg">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-bold text-gray-900">
                    {stats?.analyzed.count || 0}
                  </h3>
                  <p className="text-sm text-gray-700 font-medium">Analyzed Proposals</p>
                  <p className="text-xl font-semibold text-gray-900 pt-2">
                    {formatCurrency(stats?.analyzed.value || 0)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Submitted Proposals */}
            <Card
              className="cursor-pointer hover:shadow-lg transition-all bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
              onClick={() => handleCardClick('submitted')}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="p-3 bg-emerald-600 rounded-lg">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-bold text-emerald-900">
                    {stats?.submitted.count || 0}
                  </h3>
                  <p className="text-sm text-emerald-700 font-medium">Submitted Proposals</p>
                  <p className="text-xl font-semibold text-emerald-900 pt-2">
                    {formatCurrency(stats?.submitted.value || 0)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      
      </>
  );
  }

  // Analytics view
  const metrics = tabMetrics || analytics;
  const sectionTitle = selectedSection === 'active' ? 'Active Proposals' :
                       selectedSection === 'analyzed' ? 'Analyzed Proposals' :
                       'Submitted Proposals';

  return (
    <>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground mb-2">Count</p>
                    <p className="text-3xl font-bold">{metrics?.count || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground mb-2">Total Value</p>
                    <p className="text-3xl font-bold">{formatCurrency(metrics?.total_value || 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground mb-2">Avg Value</p>
                    <p className="text-3xl font-bold">{formatCurrency(metrics?.avg_value || 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground mb-2">Avg Age</p>
                    <p className="text-3xl font-bold">{metrics?.avg_age_days || 0} days</p>
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
                  <div className="flex flex-col md:flex-row gap-4">
                    {/* Search Input */}
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Search proposals..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-10"
                      />
                    </div>

                    {/* Value Filter Dropdown */}
                    <div ref={valueDropdownRef} className="relative min-w-[200px]">
                      <button
                        onClick={() => setValueDropdownOpen(!valueDropdownOpen)}
                        className="w-full h-10 px-3 py-2 rounded-lg border border-border bg-background text-sm text-left flex items-center justify-between hover:bg-muted/50 transition-colors"
                      >
                        <span>{getValueFilterLabel(valueFilter)}</span>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${valueDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {valueDropdownOpen && (
                        <div className="absolute z-50 w-full mt-2 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
                          {[
                            { value: 'all', label: 'All Values' },
                            { value: 'under500k', label: 'Under $500K' },
                            { value: '500k-1m', label: '$500K - $1M' },
                            { value: '1m-5m', label: '$1M - $5M' },
                            { value: 'over5m', label: 'Over $5M' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setValueFilter(option.value);
                                setValueDropdownOpen(false);
                              }}
                              className="w-full px-3 py-2 text-sm text-left hover:bg-muted/80 flex items-center justify-between transition-colors"
                            >
                              <span>{option.label}</span>
                              {valueFilter === option.value && (
                                <Check className="w-4 h-4 text-primary" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sort By Dropdown */}
                    <div ref={sortDropdownRef} className="relative min-w-[220px]">
                      <button
                        onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                        className="w-full h-10 px-3 py-2 rounded-lg border border-border bg-background text-sm text-left flex items-center justify-between hover:bg-muted/50 transition-colors"
                      >
                        <span>{getSortLabel(sortBy)}</span>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${sortDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {sortDropdownOpen && (
                        <div className="absolute z-50 w-full mt-2 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
                          {[
                            { value: 'updated', label: 'Most Recently Updated' },
                            { value: 'oldest', label: 'Oldest First' },
                            { value: 'highest', label: 'Highest Value' },
                            { value: 'lowest', label: 'Lowest Value' },
                            { value: 'name-az', label: 'Name A-Z' },
                            { value: 'name-za', label: 'Name Z-A' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setSortBy(option.value);
                                setSortDropdownOpen(false);
                              }}
                              className="w-full px-3 py-2 text-sm text-left hover:bg-muted/80 flex items-center justify-between transition-colors"
                            >
                              <span>{option.label}</span>
                              {sortBy === option.value && (
                                <Check className="w-4 h-4 text-primary" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
                        <thead className="bg-muted/50 border-b border-border">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Solicitation #</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Updated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredProposals.map((proposal) => (
                            <tr
                              key={proposal.id}
                              onClick={() => handleRowClick(proposal.id)}
                              className="hover:bg-muted/30 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-4">
                                <span className="font-medium text-foreground">{proposal.name}</span>
                              </td>
                              <td className="px-4 py-4 text-muted-foreground text-sm">
                                {proposal.solicitation_number || '-'}
                              </td>
                              <td className="px-4 py-4 text-right font-mono font-semibold text-foreground">
                                {proposal.total_cost ? formatCurrency(proposal.total_cost) : '-'}
                              </td>
                              <td className="px-4 py-4 text-right text-sm text-muted-foreground whitespace-nowrap">
                                {getLastModified(proposal)}
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
    
    </>
  );
}
