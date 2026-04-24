'use client';

import { useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Loader2,
  X as XIcon,
} from 'lucide-react';
import { ParserEvent } from '@/lib/api/proposals';

interface ParserEventFeedProps {
  events: ParserEvent[];
  status: 'processing' | 'completed' | 'error';
  /** Unused in timeline layout; kept for API back-compat with upload page. */
  progress?: number;
  /** Optional status string from /status; used as header narration when no
   *  tool is currently running (e.g. during the brief gap before run.started). */
  fallbackMessage?: string;
}

/**
 * Inline narrated timeline of the intelligent parser's work.
 *
 * Design: one thin left rail, colored dot per step, sans prose narration,
 * monospace detail for tool args, reasoning hidden behind a "Thought for Ns"
 * pill. No cards, no progress bar — the header shows current action + elapsed.
 */
export const ParserEventFeed = ({
  events,
  status,
  fallbackMessage,
}: ParserEventFeedProps) => {
  const rows = useMemo(() => buildRows(events), [events]);

  const currentRow = rows.find((r) => r.state === 'running');
  const lastRow = rows[rows.length - 1];

  const headerText =
    status === 'completed'
      ? lastRow?.pastTense || 'Analysis complete'
      : status === 'error'
      ? 'Something went wrong'
      : currentRow?.narration ||
        lastRow?.narration ||
        fallbackMessage ||
        'Analyzing document';

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Header: live narration + elapsed, no progress bar. */}
      <div className="flex items-center gap-2 mb-5 text-sm text-muted-foreground">
        {status === 'processing' && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        )}
        {status === 'completed' && (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        )}
        {status === 'error' && <XIcon className="h-3.5 w-3.5 text-red-500" />}
        <span className="text-foreground truncate">{headerText}</span>
      </div>

      {rows.length === 0 ? (
        <div className="pl-6 text-sm text-muted-foreground">
          {status === 'processing'
            ? 'Waiting for the agent to start…'
            : 'No steps recorded.'}
        </div>
      ) : (
        <ol className="relative border-l border-border pl-6 space-y-4">
          {rows.map((row, i) => (
            <TimelineRow key={row.key} row={row} defaultOpen={row.state === 'running' && i === rows.length - 1} />
          ))}
        </ol>
      )}
    </div>
  );
};

export default ParserEventFeed;

// ─── Row model ────────────────────────────────────────────────────────────

type RowState = 'running' | 'done' | 'error';

interface Row {
  key: string;
  state: RowState;
  /** Line 1, sans, prose. Present-progressive while running, past when done. */
  narration: string;
  /** Copy we swap to when the run completes (for the header). */
  pastTense?: string;
  /** Line 2, optional. Monospace for queries/paths, sans otherwise. */
  detail?: { text: string; mono: boolean };
  /** Expandable reasoning body. */
  reasoning?: { title: string; body: string; confidence?: number | null };
  /** Expandable generic result (search results, etc.). */
  result?: unknown;
  error?: string | null;
}

function buildRows(events: ParserEvent[]): Row[] {
  const rows: Row[] = [];
  const byId = new Map<string, number>();

  for (const ev of events) {
    const { event, payload } = ev;

    if (event === 'run.error') {
      rows.push({
        key: `err-${ev.seq}`,
        state: 'error',
        narration: 'Agent hit an error',
        error: payload.error ?? null,
      });
      continue;
    }

    // run.started / run.completed are reflected in the header — skip timeline rows.
    if (event === 'run.started' || event === 'run.completed') continue;

    // Phase events (e.g. wage lookup) — pair started→completed by `key`.
    if (event === 'phase.started' || event === 'phase.completed') {
      const key = payload.key || `phase-${ev.seq}`;
      const rowId = `phase:${key}`;
      const row: Row = {
        key: rowId,
        state: event === 'phase.started' ? 'running' : 'done',
        narration: payload.title || (event === 'phase.started' ? 'Working…' : 'Done'),
      };
      const idx = byId.get(rowId);
      if (idx !== undefined) {
        rows[idx] = { ...rows[idx], ...row, key: rows[idx].key };
      } else {
        rows.push(row);
        byId.set(rowId, rows.length - 1);
      }
      continue;
    }

    const toolName = payload.tool_name || '';
    const toolId = payload.tool_call_id || `noid-${ev.seq}`;
    const row = toolRow(toolName, payload, event === 'tool.started' ? 'running' : 'done');

    const existingIdx = byId.get(toolId);
    if (existingIdx !== undefined) {
      // Upgrade running row → done row (preserves position in timeline)
      rows[existingIdx] = { ...rows[existingIdx], ...row, key: rows[existingIdx].key };
      continue;
    }

    rows.push(row);
    byId.set(toolId, rows.length - 1);
  }

  return rows;
}

function toolRow(
  toolName: string,
  payload: ParserEvent['payload'],
  state: RowState,
): Row {
  const args = payload.args ?? {};

  // Reasoning tools ─── full body hidden behind a "Thought for…" pill.
  if (toolName === 'analyze' || toolName === 'think') {
    const stepTitle =
      (typeof args.title === 'string' && args.title) ||
      (state === 'running' ? 'Reasoning about the contract' : 'Reasoned about the contract');
    const thought = typeof args.thought === 'string' ? args.thought : '';
    return {
      key: `tool-${payload.tool_call_id}`,
      state,
      narration: stepTitle,
      pastTense: stepTitle,
      reasoning: thought
        ? {
            title: stepTitle,
            body: thought,
            confidence:
              typeof args.confidence === 'number' ? args.confidence : null,
          }
        : undefined,
    };
  }

  // Web search ─── query on a dimmed mono line.
  if (
    toolName === 'search_exa' ||
    toolName === 'exa_search' ||
    toolName === 'search_and_contents'
  ) {
    const query = typeof args.query === 'string' ? args.query : '';
    return {
      key: `tool-${payload.tool_call_id}`,
      state,
      narration: state === 'running' ? 'Searching the web' : 'Searched the web',
      pastTense: 'Searched the web',
      detail: query ? { text: query, mono: true } : undefined,
      result: state === 'done' ? payload.result : undefined,
    };
  }

  // Generic tool fallback.
  const label = toolName || 'Tool';
  return {
    key: `tool-${payload.tool_call_id}`,
    state,
    narration: state === 'running' ? `Running ${label}` : `Ran ${label}`,
    pastTense: `Ran ${label}`,
    result: state === 'done' ? payload.result : undefined,
  };
}

// ─── Presentational row ───────────────────────────────────────────────────

const TimelineRow = ({ row, defaultOpen }: { row: Row; defaultOpen: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  const expandable = !!(row.reasoning || hasContent(row.result) || row.error);

  const narrationClasses =
    row.state === 'running'
      ? 'text-foreground'
      : row.state === 'error'
      ? 'text-red-700'
      : 'text-muted-foreground';

  return (
    <li className="relative">
      {/* Dot */}
      <span className="absolute -left-[31px] top-0.5 flex h-4 w-4 items-center justify-center bg-background">
        {row.state === 'running' && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        )}
        {row.state === 'done' && (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        )}
        {row.state === 'error' && (
          <XIcon className="h-3.5 w-3.5 text-red-500" />
        )}
      </span>

      {/* Narration */}
      <p
        className={`text-sm leading-snug transition-colors duration-300 ${narrationClasses}`}
      >
        {row.narration}
      </p>

      {/* Detail (query / path / args) */}
      {row.detail && (
        <p
          className={`mt-0.5 text-xs text-muted-foreground/90 truncate ${
            row.detail.mono ? 'font-mono' : ''
          }`}
        >
          {row.detail.mono ? (
            <>&ldquo;{row.detail.text}&rdquo;</>
          ) : (
            row.detail.text
          )}
        </p>
      )}

      {/* Inline error */}
      {row.error && !open && (
        <p className="mt-1 text-xs text-red-600 line-clamp-2">{row.error}</p>
      )}

      {/* Expand control */}
      {expandable && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform duration-200 ${
              open ? 'rotate-90' : ''
            }`}
          />
          {row.reasoning
            ? open
              ? 'Hide reasoning'
              : 'Show reasoning'
            : open
            ? 'Hide details'
            : 'Show details'}
          {row.reasoning?.confidence != null && (
            <span className="ml-1 tabular-nums text-muted-foreground/70">
              · {(row.reasoning.confidence * 100).toFixed(0)}%
            </span>
          )}
        </button>
      )}

      {/* Expanded body */}
      {expandable && open && (
        <div className="mt-2 border-l-2 border-border/60 pl-3 space-y-3">
          {row.reasoning && (
            <p className="text-xs leading-relaxed text-muted-foreground italic whitespace-pre-wrap">
              {row.reasoning.body}
            </p>
          )}
          {row.result !== undefined &&
            row.result !== null &&
            row.result !== '' && <ResultBlock value={row.result} />}
          {row.error && (
            <p className="text-xs text-red-700 whitespace-pre-wrap">
              {row.error}
            </p>
          )}
        </div>
      )}
    </li>
  );
};

const ResultBlock = ({ value }: { value: unknown }) => {
  if (typeof value === 'string') {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
        {value}
      </p>
    );
  }
  return (
    <pre className="text-[11px] leading-relaxed font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1.5 max-h-48 overflow-auto">
      {safeStringify(value)}
    </pre>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function hasContent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
