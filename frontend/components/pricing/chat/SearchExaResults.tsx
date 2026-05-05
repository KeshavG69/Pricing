'use client';

/**
 * Renders Exa web-search results as a clickable list of links with favicons.
 * Copied verbatim from Kroolo's enterprise-search-frontend
 * (SearchExaToolContent.tsx) and adapted to PriceIQ's styling tokens.
 */

import { memo, useMemo, useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';

type ExaResult = {
  url: string;
  title?: string;
  published_date?: string;
  author?: string;
  text?: string;
};

/**
 * Parse Exa tool results from any of the shapes agno may serialize them as.
 * Returns a flat array of ExaResult objects.
 */
export function parseExaResults(result: unknown): ExaResult[] {
  if (result == null) return [];

  // String form — try strict JSON, then JS-literal eval (for Python repr)
  if (typeof result === 'string') {
    const text = result.trim();
    if (!text) return [];
    try {
      return parseExaResults(JSON.parse(text));
    } catch {
      /* fall through */
    }
    try {
      const jsLiteral = text
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null');
      const fn = new Function('return ' + jsLiteral);
      return parseExaResults(fn());
    } catch {
      return [];
    }
  }

  if (typeof result !== 'object') return [];

  // Direct array of result objects
  if (Array.isArray(result)) {
    return result.filter(
      (item): item is ExaResult =>
        !!item && typeof item === 'object' && typeof (item as ExaResult).url === 'string',
    );
  }

  // Wrapper object — common shapes:
  // { results: [...] }, { data: [...] }, { output: "..." }, { content: ... }
  const obj = result as Record<string, unknown>;
  for (const key of ['results', 'data', 'output', 'content', 'value']) {
    if (key in obj) {
      const found = parseExaResults(obj[key]);
      if (found.length > 0) return found;
    }
  }
  return [];
}

const getDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const FaviconImg = memo(({ domain }: { domain: string }) => {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-border text-[10px] font-medium uppercase text-muted-foreground">
        {domain.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt=""
      className="h-5 w-5 flex-shrink-0 rounded"
      onError={() => setErrored(true)}
    />
  );
});
FaviconImg.displayName = 'FaviconImg';

interface SearchExaResultsProps {
  /** The query string (from tool_args.query) */
  query: string;
  /** True while the tool is still running and we have no results yet */
  isRunning: boolean;
  /** Raw tool result (from call.result) */
  result: unknown;
}

const SearchExaResults = memo(
  ({ query, isRunning, result }: SearchExaResultsProps) => {
    const results = useMemo(() => parseExaResults(result), [result]);

    if (isRunning && results.length === 0) {
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="truncate">Searching the web for &ldquo;{query}&rdquo;…</span>
        </div>
      );
    }

    if (results.length === 0) {
      return null;
    }

    return (
      <div className="my-2 overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Globe className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <span className="truncate text-[12px] font-medium text-foreground">
              {query || 'Web search'}
            </span>
          </div>
          <span className="flex-shrink-0 text-[11px] text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="max-h-60 overflow-auto">
          {results.map((item, index) => {
            const domain = getDomain(item.url);
            return (
              <a
                key={`${item.url}-${index}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border-b border-border px-3 py-2 transition-colors last:border-b-0 hover:bg-muted"
              >
                <FaviconImg domain={domain} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                  {item.title || item.url}
                </span>
                <span className="max-w-[40%] flex-shrink-0 truncate text-[11px] text-muted-foreground">
                  {domain}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    );
  },
);

SearchExaResults.displayName = 'SearchExaResults';

export default SearchExaResults;
