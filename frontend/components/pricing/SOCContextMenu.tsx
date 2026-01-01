'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SpreadsheetPosition, AdvancedPosition, SOCSuggestion } from '@/types';
import { Sparkles, Loader2, List } from 'lucide-react';
import apiClient from '@/lib/api/client';

// Shared cache with SOCSelectionModal - same key format
const CACHE_PREFIX = 'soc_cache_';
const AI_SUGGESTIONS_CACHE = 'ai_suggestions';
const CACHE_DURATION = 25 * 60 * 1000; // 25 minutes (matches user's preference)

interface CacheEntry {
  data: SOCSuggestion[];
  timestamp: number;
}

function getCacheKey(laborCategory: string): string {
  // Use same key format as SOCSelectionModal for shared cache
  return `${CACHE_PREFIX}${AI_SUGGESTIONS_CACHE}_${laborCategory}`;
}

function getCachedSuggestions(key: string): SOCSuggestion[] | null {
  try {
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;

    const entry: CacheEntry = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is still valid
    if (now - entry.timestamp > CACHE_DURATION) {
      sessionStorage.removeItem(key);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

function setCachedSuggestions(key: string, data: SOCSuggestion[]): void {
  try {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore storage errors
  }
}

interface SOCContextMenuProps {
  x: number;
  y: number;
  position: SpreadsheetPosition | AdvancedPosition;
  onClose: () => void;
  onApply: (socCode: string, socTitle: string) => void | Promise<void>;
  onOpenModal: () => void; // To open the full SOCSelectionModal
}

export const SOCContextMenu = ({
  x,
  y,
  position,
  onClose,
  onApply,
  onOpenModal,
}: SOCContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [aiSuggestions, setAiSuggestions] = useState<SOCSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState<string | null>(null); // Track which SOC is being applied

  // Fetch AI suggestions on mount (with caching)
  useEffect(() => {
    const fetchSuggestions = async () => {
      const cacheKey = getCacheKey(position.labor_category);

      // Check cache first
      const cached = getCachedSuggestions(cacheKey);
      if (cached) {
        setAiSuggestions(cached);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await apiClient.post('/soc/search-ai', {
          labor_category: position.labor_category,
          description: position.description || '',
          experience: position.experience || 0,
          location: position.location || '',
          top_k: 5,
        });

        const suggestions = response.data.suggestions || [];
        setAiSuggestions(suggestions);

        // Cache the results
        setCachedSuggestions(cacheKey, suggestions);
      } catch (error) {
        console.error('Failed to fetch AI suggestions:', error);
        setAiSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [position.labor_category, position.description, position.experience, position.location]);

  // Handle SOC selection
  const handleSelectSOC = async (soc: SOCSuggestion) => {
    setIsApplying(soc.soc_code);
    try {
      await onApply(soc.soc_code, soc.soc_title);
      onClose();
    } catch (error) {
      setIsApplying(null);
    }
  };

  // Position calculation to keep menu in viewport
  const getPosition = () => {
    if (!menuRef.current) return { x, y };

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 10;
    }
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 10;
    }

    return { x: Math.max(10, adjustedX), y: Math.max(10, adjustedY) };
  };

  const menuPosition = menuRef.current ? getPosition() : { x, y };

  // Close handlers
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-[340px] rounded-lg border border-border bg-popover shadow-xl text-popover-foreground"
      style={{
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`,
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-purple-50 dark:bg-purple-950/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">
            AI Suggested SOC Codes
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Click to apply or browse all options
        </div>
      </div>

      {/* Content */}
      <div className="py-1 max-h-[300px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Finding matches...</span>
          </div>
        ) : aiSuggestions.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            No AI suggestions available.
            <br />
            <button
              onClick={() => {
                onOpenModal();
                onClose();
              }}
              className="text-primary hover:underline mt-2 inline-block"
            >
              Browse all occupations
            </button>
          </div>
        ) : (
          <>
            {aiSuggestions.map((suggestion, index) => {
              const isCurrent = position.soc_code === suggestion.soc_code;
              const isApplyingThis = isApplying === suggestion.soc_code;
              return (
                <button
                  key={suggestion.soc_code}
                  onClick={() => handleSelectSOC(suggestion)}
                  disabled={isApplying !== null}
                  className={`w-full px-3 py-2.5 text-left transition-colors ${
                    isApplyingThis
                      ? 'bg-purple-200 dark:bg-purple-950/60'
                      : isCurrent
                      ? 'bg-purple-100 dark:bg-purple-950/40'
                      : 'hover:bg-muted'
                  } ${isApplying !== null && !isApplyingThis ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-600 dark:text-purple-300 text-xs font-bold">
                      {isApplyingThis ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-muted-foreground mb-0.5">
                        {suggestion.soc_code}
                      </div>
                      <div className="text-sm text-foreground line-clamp-2">
                        {suggestion.soc_title}
                      </div>
                      {isApplyingThis ? (
                        <div className="text-[10px] text-purple-600 dark:text-purple-400 mt-1">
                          Applying...
                        </div>
                      ) : isCurrent ? (
                        <div className="text-[10px] text-purple-600 dark:text-purple-400 mt-1">
                          ✓ Currently selected
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2 bg-muted/30">
        <button
          onClick={() => {
            onOpenModal();
            onClose();
          }}
          className="w-full text-sm text-primary hover:bg-primary/10 py-2 rounded flex items-center justify-center gap-2 transition-colors"
        >
          <List className="w-4 h-4" />
          Browse All Occupations
        </button>
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(menu, document.body) : null;
};

export default SOCContextMenu;
