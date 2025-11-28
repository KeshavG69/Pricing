import { useEffect, useRef } from 'react';

interface UseInfiniteScrollOptions {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  rootMargin?: string;
  threshold?: number;
}

export const useInfiniteScroll = ({
  onLoadMore,
  hasMore,
  isLoading,
  rootMargin = '200px',
  threshold = 0.1,
}: UseInfiniteScrollOptions) => {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Don't set up observer if no more data or currently loading
    if (!hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry.isIntersecting && hasMore && !isLoading) {
          onLoadMore();
        }
      },
      {
        rootMargin,
        threshold,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [onLoadMore, hasMore, isLoading, rootMargin, threshold]);

  return { sentinelRef };
};
