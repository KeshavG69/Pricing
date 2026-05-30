'use client';

/**
 * Price-to-Win card — sits on the Overview tab, lets the user set a target
 * price and triggers a Q chat analysis to close the gap.
 *
 * Three visible states:
 *   A) No target set     → CTA to set one (popover input)
 *   B) Target set, gap   → red/amber gap badge + "Analyze gap with Q"
 *   C) Target set, under → emerald margin badge + "Improve margin with Q"
 *
 * Animation choices follow Emil's framework:
 *   - Card itself doesn't animate in (low frequency seen, but always present)
 *   - Buttons scale(0.97) on :active (instant feedback)
 *   - Popover scales 0.95→1 with custom ease-out (origin-aware)
 *   - Number changes use tabular-nums (no jarring width shifts)
 */

import { useEffect, useRef, useState } from 'react';
import { Target, ArrowRight, X, Pencil, Sparkles, Loader2, AlertCircle, Check } from 'lucide-react';
import Card, { CardContent } from '@/components/ui/Card';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { proposalsApi } from '@/lib/api/proposals';
import type { PTWConfidence } from '@/types';

const formatMoney = (n: number) =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;

const formatCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return formatMoney(n);
};

/**
 * Parse a free-form dollar string into a numeric value. Accepts:
 *   "10M", "10m", "27.5M"           → 10_000_000 / 27_500_000
 *   "10MM", "10mm"                  → 10_000_000  (finance shorthand)
 *   "500K", "500k"                  → 500_000
 *   "1B", "1b"                      → 1_000_000_000
 *   "$27,000,000"                   → 27_000_000
 *   "10000000"                      → 10_000_000  (plain)
 * Returns null on empty / invalid input.
 */
function parseShorthandMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s_]/g, '').toLowerCase();
  if (!cleaned) return null;

  // Match optional sign, number, optional suffix (k/m/mm/b/bn)
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)(k|mm|m|bn|b|t)?$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;

  const suffix = match[2];
  let multiplier = 1;
  if (suffix === 'k') multiplier = 1_000;
  else if (suffix === 'm' || suffix === 'mm') multiplier = 1_000_000;
  else if (suffix === 'b' || suffix === 'bn') multiplier = 1_000_000_000;
  else if (suffix === 't') multiplier = 1_000_000_000_000;

  return value * multiplier;
}

interface PriceToWinCardProps {
  /** Current grand total (fee-inclusive) from OverviewTab's costMetrics. */
  currentTotal: number;
}

/**
 * Dispatches the open-chat custom event that PricingChatPanel listens for.
 * Builds the prompt from the live store snapshot at click time so the
 * agent always sees the latest figures.
 */
function dispatchAnalyze(currentTotal: number, target: number) {
  const gap = currentTotal - target;
  const gapPct = currentTotal > 0 ? (gap / currentTotal) * 100 : 0;
  const prompt =
    gap > 0
      ? `Our price-to-win target is ${formatMoney(target)}, but the proposal currently lands at ${formatCompact(currentTotal)} — ` +
        `a ${formatCompact(gap)} gap (${gapPct.toFixed(1)}%). Run a full PtW analysis: identify the top 5–7 levers to ` +
        `close the gap, with $$ impact and risk for each.`
      : `Our price-to-win target is ${formatMoney(target)} and we're at ${formatCompact(currentTotal)} — ` +
        `already ${formatCompact(-gap)} under target. Walk through how we could improve margin given the ` +
        `current proposal structure.`;

  window.dispatchEvent(
    new CustomEvent('priceiq:open-chat', { detail: { prompt, autoSend: true } }),
  );
}

// Confidence → visual styling. Keeps the inline rationale chip honest about
// how much weight to give the suggestion.
const CONFIDENCE_STYLES: Record<PTWConfidence, { dot: string; label: string }> = {
  high:   { dot: 'bg-emerald-500', label: 'high confidence' },
  medium: { dot: 'bg-amber-500',   label: 'medium confidence' },
  low:    { dot: 'bg-red-500',     label: 'low confidence' },
};

export default function PriceToWinCard({ currentTotal }: PriceToWinCardProps) {
  const priceToWin = usePricingStore((s) => s.priceToWin);
  const setPriceToWin = usePricingStore((s) => s.setPriceToWin);
  const proposalId = usePricingStore((s) => s.proposalId);
  const ptwSuggestion = usePricingStore((s) => s.ptwSuggestion);
  const ptwSuggestionLoading = usePricingStore((s) => s.ptwSuggestionLoading);
  const ptwSuggestionError = usePricingStore((s) => s.ptwSuggestionError);
  const fetchPTWSuggestion = usePricingStore((s) => s.fetchPTWSuggestion);
  const clearPTWSuggestion = usePricingStore((s) => s.clearPTWSuggestion);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Focus the input when opening the popover.
  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [editing]);

  // Close popover on outside-click / Escape.
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [editing]);

  const startEditing = () => {
    setDraft(priceToWin != null ? String(priceToWin) : '');
    setEditing(true);
  };

  const commit = async () => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      // empty → clear the target
      await setPriceToWin(null);
      setEditing(false);
      return;
    }
    const num = parseShorthandMoney(trimmed);
    if (num != null && num > 0) {
      await setPriceToWin(num);
    }
    setEditing(false);
  };

  const clearTarget = async () => {
    await setPriceToWin(null);
    setEditing(false);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    }
  };

  // ── Disable when no proposal is loaded ──────────────────────────────
  if (!proposalId) return null;

  // Suggestion sub-state (reused in both State A and State B/C below).
  const suggestion = ptwSuggestion?.reconciliation ?? null;

  // Renders the success suggestion panel — extracted so both empty and
  // target-set states can show the same rich block when a suggestion exists.
  const renderSuggestionPanel = () => (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Suggested
            </span>
            <span className="text-base font-semibold text-foreground tabular-nums">
              {formatCompact(suggestion!.suggested_ptw)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              ({formatCompact(suggestion!.low)}–{formatCompact(suggestion!.high)})
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${CONFIDENCE_STYLES[suggestion!.confidence].dot}`} />
              {CONFIDENCE_STYLES[suggestion!.confidence].label}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground leading-snug">
            {suggestion!.rationale}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={async () => {
              await setPriceToWin(suggestion!.suggested_ptw);
              clearPTWSuggestion();
            }}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-[transform,background-color] duration-160 ease-out hover:bg-blue-700 active:scale-[0.97]"
          >
            <Check className="h-3 w-3" />
            {priceToWin == null ? 'Use this' : 'Replace target'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(String(Math.round(suggestion!.suggested_ptw)));
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors duration-100 hover:bg-muted"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={clearPTWSuggestion}
            aria-label="Dismiss suggestion"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderErrorPanel = () => {
    // If the error is the "missing NAICS/agency" path, show an inline form so
    // the user can fill them in without leaving the card. Older proposals
    // (uploaded before the parser changes) hit this every time.
    const isMissingMetadata =
      !!ptwSuggestionError && /missing required field/i.test(ptwSuggestionError);

    if (isMissingMetadata) {
      return (
        <MissingMetadataForm
          onSaved={() => {
            // Save succeeded — auto-retry the suggestion so the user doesn't
            // have to click Retry themselves.
            clearPTWSuggestion();
            void fetchPTWSuggestion();
          }}
          onDismiss={clearPTWSuggestion}
        />
      );
    }

    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="leading-snug">{ptwSuggestionError}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchPTWSuggestion()}
              className="rounded-md border border-amber-300 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors duration-100 hover:bg-muted dark:border-amber-800"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => {
                clearPTWSuggestion();
                if (priceToWin == null) startEditing();
              }}
              className="rounded-md px-2 py-0.5 text-[11px] text-amber-700 transition-colors duration-100 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── State A: no target set ──────────────────────────────────────────
  if (priceToWin == null) {
    return (
      <Card className="relative overflow-visible">
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40">
                <Target className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Price-to-Win</p>
                <p className="text-xs text-muted-foreground">
                  Set a target price and Q will analyze the gap, lever by lever.
                </p>
              </div>
            </div>

            {/* Action buttons — only when no suggestion / loading / error in progress. */}
            {!ptwSuggestionLoading && !suggestion && !ptwSuggestionError && (
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void fetchPTWSuggestion()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-[transform,background-color] duration-160 ease-out hover:bg-blue-700 active:scale-[0.97]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Suggest
                </button>
                <button
                  type="button"
                  onClick={startEditing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground transition-[transform,background-color] duration-160 ease-out hover:bg-muted active:scale-[0.97]"
                >
                  Set manually
                </button>
                {editing && (
                  <SetTargetPopover
                    ref={popoverRef}
                    draft={draft}
                    onChange={setDraft}
                    onCommit={commit}
                    onCancel={() => setEditing(false)}
                    onKeyDown={onInputKeyDown}
                    inputRef={inputRef}
                  />
                )}
              </div>
            )}

            {ptwSuggestionLoading && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3.5 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing comparable awards…
              </div>
            )}
          </div>

          {suggestion && !ptwSuggestionLoading && renderSuggestionPanel()}
          {ptwSuggestionError && !ptwSuggestionLoading && !suggestion && renderErrorPanel()}

          {/* Popover for when "Edit" was clicked from inside the suggestion panel. */}
          {editing && suggestion && (
            <div className="relative">
              <SetTargetPopover
                ref={popoverRef}
                draft={draft}
                onChange={setDraft}
                onCommit={commit}
                onCancel={() => setEditing(false)}
                onKeyDown={onInputKeyDown}
                inputRef={inputRef}
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── State B/C: target set ───────────────────────────────────────────
  const gap = currentTotal - priceToWin;
  const gapPct = currentTotal > 0 ? (gap / currentTotal) * 100 : 0;
  const isOver = gap > 0;

  return (
    <Card className="relative overflow-visible">
      <CardContent className="flex flex-col gap-3 pt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: identity + numbers */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              isOver
                ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
            }`}
          >
            <Target className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Price-to-Win</p>
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
                aria-label="Edit target"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              {/* Re-suggest from data — always reachable even after target is set. */}
              {!ptwSuggestionLoading && !suggestion && (
                <button
                  type="button"
                  onClick={() => void fetchPTWSuggestion()}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
                  aria-label="Compare to data-driven suggestion"
                  title="Compare to data-driven suggestion"
                >
                  <Sparkles className="h-3 w-3" /> Suggest
                </button>
              )}
              {ptwSuggestionLoading && (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <div>
                <span className="text-xs text-muted-foreground">Target</span>{' '}
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {formatMoney(priceToWin)}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">
                  {isOver ? 'Gap' : 'Margin'}
                </span>{' '}
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    isOver
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {isOver ? '−' : '+'}
                  {formatMoney(Math.abs(gap))}
                  <span className="ml-1 text-xs font-normal opacity-80">
                    ({isOver ? '−' : '+'}
                    {Math.abs(gapPct).toFixed(1)}%)
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: primary CTA */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => dispatchAnalyze(currentTotal, priceToWin)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-[transform,background-color] duration-160 ease-out hover:bg-blue-700 active:scale-[0.97]"
          >
            {isOver ? 'Analyze gap with Q' : 'Improve margin with Q'}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          {editing && (
            <SetTargetPopover
              ref={popoverRef}
              draft={draft}
              onChange={setDraft}
              onCommit={commit}
              onCancel={() => setEditing(false)}
              onClear={clearTarget}
              onKeyDown={onInputKeyDown}
              inputRef={inputRef}
            />
          )}
        </div>
      </div>
      {/* Same suggestion / error panels as State A — lets users compare their
          manual target against the data-driven number after the fact. */}
      {suggestion && !ptwSuggestionLoading && renderSuggestionPanel()}
      {ptwSuggestionError && !ptwSuggestionLoading && !suggestion && renderErrorPanel()}
      </CardContent>
    </Card>
  );
}

// ─── Popover for the target input ──────────────────────────────────────

interface SetTargetPopoverProps {
  ref: React.Ref<HTMLDivElement>;
  draft: string;
  onChange: (v: string) => void;
  onCommit: () => void | Promise<void>;
  onCancel: () => void;
  onClear?: () => void | Promise<void>;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef: React.Ref<HTMLInputElement>;
}

function SetTargetPopover({
  ref,
  draft,
  onChange,
  onCommit,
  onCancel,
  onClear,
  onKeyDown,
  inputRef,
}: SetTargetPopoverProps) {
  // Live-preview the parsed value as the user types so they can see
  // "10M" → "$10,000,000.00" and trust their shorthand was understood.
  const trimmed = draft.trim();
  const previewNum = trimmed ? parseShorthandMoney(trimmed) : null;
  const isInvalid = trimmed.length > 0 && (previewNum == null || previewNum <= 0);

  return (
    <div
      ref={ref}
      // origin-bottom-right keeps the popover anchored to its trigger button
      className="popover-enter absolute right-0 top-full z-30 mt-2 w-64 origin-top-right rounded-lg border border-border bg-background p-3 shadow-lg"
      role="dialog"
      aria-label="Set price-to-win target"
    >
      <style>{`
        @keyframes priceiq-pop-enter {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        .popover-enter {
          animation: priceiq-pop-enter 180ms cubic-bezier(0.23, 1, 0.32, 1);
        }
      `}</style>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Target price
      </label>
      <div
        className={`flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 transition-colors duration-150 ${
          isInvalid
            ? 'border-amber-500 focus-within:ring-1 focus-within:ring-amber-500'
            : 'border-input focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500'
        }`}
      >
        <span className="text-sm text-muted-foreground">$</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="27M"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground tabular-nums outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      {/* Helper / preview row — height stays stable so the popover doesn't jump. */}
      <div className="mt-1.5 flex min-h-[14px] items-center justify-between text-[10px]">
        <span className="text-muted-foreground">
          Use shorthand:&nbsp;
          <span className="font-medium text-foreground">10M</span>,{' '}
          <span className="font-medium text-foreground">500K</span>,{' '}
          <span className="font-medium text-foreground">1.5B</span>
        </span>
        {previewNum != null && previewNum > 0 ? (
          <span className="font-medium text-blue-600 tabular-nums">
            = {formatMoney(previewNum)}
          </span>
        ) : isInvalid ? (
          <span className="font-medium text-amber-600">Invalid</span>
        ) : (
          <span />
        )}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Press Enter to save · Esc to cancel
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onCommit()}
            disabled={isInvalid}
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-[transform,background-color] duration-160 ease-out hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline NAICS/agency form for the error panel ─────────────────────

interface MissingMetadataFormProps {
  /** Called after a successful PATCH — caller should clear error and re-fetch. */
  onSaved: () => void;
  onDismiss: () => void;
}

function MissingMetadataForm({ onSaved, onDismiss }: MissingMetadataFormProps) {
  const proposalId = usePricingStore((s) => s.proposalId);

  const [naics, setNaics] = useState('');
  const [agency, setAgency] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const naicsValid = /^\d{6}$/.test(naics.trim());
  const agencyValid = agency.trim().length >= 3;
  const canSave = naicsValid && agencyValid && !!proposalId && !saving;

  const handleSave = async () => {
    if (!canSave || !proposalId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await proposalsApi.update(proposalId, {
        naics_code: naics.trim(),
        agency: agency.trim(),
      });
      onSaved();
    } catch (err: any) {
      setSaveError(err?.response?.data?.detail || err?.message || 'Failed to save.');
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
        <p className="text-xs text-amber-900 dark:text-amber-200 leading-snug">
          This proposal needs a NAICS code and awarding agency to find comparable past awards.
        </p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            NAICS code
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={naics}
            onChange={(e) => setNaics(e.target.value)}
            placeholder="541330"
            maxLength={6}
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground tabular-nums outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-muted-foreground/60"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            6 digits. e.g. 541330 (Engineering), 541512 (IT/Software), 541611 (Mgmt Consulting)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Awarding agency
          </label>
          <input
            type="text"
            value={agency}
            onChange={(e) => setAgency(e.target.value)}
            placeholder="Department of the Navy"
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-muted-foreground/60"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Department-level, e.g. Department of the Army, Office of Personnel Management
          </p>
        </div>
      </div>
      {saveError && (
        <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{saveError}</p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          disabled={saving}
          className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-[transform,background-color] duration-160 ease-out hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
        >
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check className="h-3 w-3" />
              Save &amp; Retry
            </>
          )}
        </button>
      </div>
    </div>
  );
}
