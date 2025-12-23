'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SpreadsheetPosition, AdvancedPosition, SOCSuggestion } from '@/types';
import { Search, Sparkles, CheckCircle2, Loader2, Info } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { usePricingStore } from '@/lib/stores/pricingStore';

interface SOCSelectionModalProps {
  open: boolean;
  onClose: () => void;
  position: SpreadsheetPosition | AdvancedPosition | null;
  onUpdate: (updates: Partial<SpreadsheetPosition> | Partial<AdvancedPosition>) => void;
}

// Session storage cache keys
const CACHE_PREFIX = 'soc_cache_';
const AI_SUGGESTIONS_CACHE = 'ai_suggestions';
const BROWSE_ALL_CACHE = 'browse_all';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Cache utilities
function getCachedData<T>(key: string): T | null {
  try {
    const cached = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return null;

    const entry: CacheEntry<T> = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is still valid
    if (now - entry.timestamp > CACHE_DURATION) {
      sessionStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
}

function setCachedData<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now()
    };
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

export const SOCSelectionModal = ({
  open,
  onClose,
  position,
  onUpdate,
}: SOCSelectionModalProps) => {
  const [selectedSOC, setSelectedSOC] = useState<{ code: string; title: string } | null>(null);

  // AI Suggestions state
  const [aiSuggestions, setAiSuggestions] = useState<SOCSuggestion[]>([]);
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  // Browse All state with infinite scroll
  const [allOccupations, setAllOccupations] = useState<SOCSuggestion[]>([]);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [hasMoreOccupations, setHasMoreOccupations] = useState(true);
  const [currentSkip, setCurrentSkip] = useState(0);
  const [totalOccupations, setTotalOccupations] = useState(0);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SOCSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Apply state
  const [isApplying, setIsApplying] = useState(false);

  const proposalId = usePricingStore((state) => state.proposalId);

  // Infinite scroll observer ref
  const observerTarget = useRef<HTMLDivElement>(null);

  // Initialize modal
  useEffect(() => {
    if (open && position) {
      // Set initial selected SOC
      if (position.soc_code && position.soc_title) {
        setSelectedSOC({ code: position.soc_code, title: position.soc_title });
      } else {
        setSelectedSOC(null);
      }

      // Load AI suggestions
      fetchAISuggestions();

      // Load first batch of all occupations
      loadInitialOccupations();

      // Reset search
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [open, position]);

  // Fetch AI suggestions (FAISS vector search) with caching
  const fetchAISuggestions = async () => {
    if (!position) return;

    // Check cache first
    const cacheKey = `${AI_SUGGESTIONS_CACHE}_${position.labor_category}`;
    const cached = getCachedData<SOCSuggestion[]>(cacheKey);

    if (cached) {
      console.log('✅ Using cached AI suggestions');
      setAiSuggestions(cached);
      return;
    }

    setIsLoadingAI(true);
    try {
      const response = await apiClient.post('/soc/search-ai', {
        labor_category: position.labor_category,
        description: position.description,
        experience: position.experience,
        location: position.location,
        top_k: 5,
      });

      const suggestions = response.data.suggestions || [];
      setAiSuggestions(suggestions);

      // Cache the results
      setCachedData(cacheKey, suggestions);
    } catch (error) {
      console.error('Failed to fetch AI suggestions:', error);
      setAiSuggestions([]);
    } finally {
      setIsLoadingAI(false);
    }
  };

  // Load initial batch of all occupations with caching
  const loadInitialOccupations = async () => {
    // Check cache first
    const cached = getCachedData<SOCSuggestion[]>(BROWSE_ALL_CACHE);

    if (cached && cached.length > 0) {
      console.log('✅ Using cached browse all occupations');
      setAllOccupations(cached.slice(0, 20)); // First 20
      setCurrentSkip(20);
      setTotalOccupations(cached.length);
      setHasMoreOccupations(cached.length > 20);
      return;
    }

    setIsLoadingAll(true);
    try {
      const response = await apiClient.get('/soc/all', {
        params: { skip: 0, limit: 20 }
      });

      const data = response.data;
      setAllOccupations(data.occupations || []);
      setCurrentSkip(20);
      setTotalOccupations(data.total || 0);
      setHasMoreOccupations(data.has_more || false);

      // Cache first load (we'll incrementally add to cache as user scrolls)
      setCachedData(BROWSE_ALL_CACHE, data.occupations || []);
    } catch (error) {
      console.error('Failed to load occupations:', error);
      setAllOccupations([]);
    } finally {
      setIsLoadingAll(false);
    }
  };

  // Load more occupations (infinite scroll)
  const loadMoreOccupations = useCallback(async () => {
    if (!hasMoreOccupations || isLoadingAll) return;

    setIsLoadingAll(true);
    try {
      const response = await apiClient.get('/soc/all', {
        params: { skip: currentSkip, limit: 20 }
      });

      const data = response.data;
      const newOccupations = data.occupations || [];

      setAllOccupations((prev) => {
        const updated = [...prev, ...newOccupations];

        // Update cache with new data
        const cached = getCachedData<SOCSuggestion[]>(BROWSE_ALL_CACHE) || [];
        setCachedData(BROWSE_ALL_CACHE, [...cached, ...newOccupations]);

        return updated;
      });

      setCurrentSkip((prev) => prev + newOccupations.length);
      setHasMoreOccupations(data.has_more || false);
    } catch (error) {
      console.error('Failed to load more occupations:', error);
    } finally {
      setIsLoadingAll(false);
    }
  }, [currentSkip, hasMoreOccupations, isLoadingAll]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreOccupations && !isLoadingAll && searchQuery === '') {
          loadMoreOccupations();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMoreOccupations, isLoadingAll, searchQuery, loadMoreOccupations]);

  // Debounced search with MongoDB (300ms)
  useEffect(() => {
    // Empty query - show all occupations
    if (searchQuery.trim() === '') {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await apiClient.post('/soc/search', {
          query: searchQuery,
          limit: 50,
        });

        setSearchResults(response.data.suggestions || []);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectSOC = (soc: SOCSuggestion) => {
    setSelectedSOC({ code: soc.soc_code, title: soc.soc_title });
  };

  const handleApply = async () => {
    if (!selectedSOC || !position || !proposalId) return;

    setIsApplying(true);
    try {
      // Call wage refresh endpoint
      const response = await apiClient.post(
        `/proposals/${proposalId}/positions/${position.id}/refresh-wage`,
        {
          soc_code: selectedSOC.code,
          soc_title: selectedSOC.title,
          location: position.location,
          experience: position.experience,
        }
      );

      // Update position with new SOC + wage data
      onUpdate({
        soc_code: selectedSOC.code,
        soc_title: selectedSOC.title,
        ...response.data.wage_data,
      });

      onClose();
    } catch (error: any) {
      console.error('Failed to update SOC:', error);
      alert(error.response?.data?.detail || 'Failed to update SOC code. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  };

  if (!position) return null;

  // Determine which list to show in Browse All section
  const browseAllList = searchQuery.trim() !== '' ? searchResults : allOccupations;
  const showInfiniteScroll = searchQuery.trim() === '' && hasMoreOccupations;

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title="Select BLS Occupation Code"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isApplying}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            variant="primary"
            disabled={!selectedSOC || isApplying}
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              'Apply'
            )}
          </Button>
        </>
      }
    >
      {/* Position Info */}
      <div className="mb-4">
        <div className="text-sm text-muted-foreground">
          Position: <span className="text-foreground font-semibold">{position.labor_category}</span>
        </div>

        {/* Job Description */}
        {position.description && (
          <div className="mt-2 p-2 bg-muted/30 rounded text-xs text-muted-foreground flex items-start gap-2">
            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{position.description}</span>
          </div>
        )}

        {/* Current SOC Code */}
        {position.soc_code && (
          <div className="text-xs text-muted-foreground mt-1">
            Current: {position.soc_code} - {position.soc_title}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-6">
        {/* AI Suggestions Section */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-foreground">AI Suggested Matches</h3>
          </div>

          {isLoadingAI ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Finding best matches...</span>
            </div>
          ) : aiSuggestions.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              No AI suggestions available. Try manual search below.
            </div>
          ) : (
            <div className="space-y-2">
              {aiSuggestions.map((suggestion) => (
                <button
                  key={suggestion.soc_code}
                  onClick={() => handleSelectSOC(suggestion)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedSOC?.code === suggestion.soc_code
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20'
                      : 'border-border hover:border-purple-300 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">{suggestion.soc_code}</span>
                        {suggestion.is_best_match && (
                          <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded">
                            Best Match
                          </span>
                        )}
                        {suggestion.similarity_score && (
                          <span className="text-xs text-muted-foreground">
                            {Math.round(suggestion.similarity_score * 100)}% match
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-foreground">{suggestion.soc_title}</div>
                    </div>
                    {selectedSOC?.code === suggestion.soc_code && (
                      <CheckCircle2 className="w-5 h-5 text-purple-500 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Browse All / Manual Search Section */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Browse All Occupations</h3>
          </div>

          {/* Search Input */}
          <Input
            type="text"
            placeholder="Search by SOC code or job title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-3"
          />

          {/* Results Count */}
          <div className="text-xs text-muted-foreground mb-2">
            {searchQuery.trim() !== '' ? (
              <>Showing {browseAllList.length} search results</>
            ) : (
              <>Showing {allOccupations.length} of {totalOccupations} occupations</>
            )}
          </div>

          {/* Scrollable List with Infinite Scroll */}
          <div className="max-h-80 overflow-y-auto space-y-1">
            {isLoadingAll && allOccupations.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : browseAllList.length > 0 ? (
              <>
                {browseAllList.map((occ) => (
                  <button
                    key={occ.soc_code}
                    onClick={() => handleSelectSOC(occ)}
                    className={`w-full text-left p-2 rounded border transition-colors ${
                      selectedSOC?.code === occ.soc_code
                        ? 'border-primary bg-primary/10'
                        : 'border-transparent hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground">{occ.soc_code}</span>
                        <div className="text-sm text-foreground">{occ.soc_title}</div>
                      </div>
                      {selectedSOC?.code === occ.soc_code && (
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                      )}
                    </div>
                  </button>
                ))}

                {/* Infinite scroll trigger */}
                {showInfiniteScroll && (
                  <div ref={observerTarget} className="py-4 flex justify-center">
                    {isLoadingAll && (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                {isSearching ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : searchQuery.trim() !== '' ? (
                  <>No results found for &quot;{searchQuery}&quot;</>
                ) : (
                  <>No occupations available</>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </Dialog>
  );
};

export default SOCSelectionModal;
