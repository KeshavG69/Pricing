'use client';

import {
  Building2,
  Calendar,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Sparkles,
  Tag,
  Target,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import type { RFPRadarMatch } from '@/types';

interface MatchCardProps {
  match: RFPRadarMatch;
  /** "Price this RFP" — downloads the PWS and hands off to PriceIQ. */
  onPriceClick?: (match: RFPRadarMatch) => void;
  /** True while THIS card's handoff is in flight — shows the spinner. */
  isPricing?: boolean;
  /** True while ANY card's handoff is in flight — disables the button. */
  pricingDisabled?: boolean;
}

// ── Visual helpers ────────────────────────────────────────────────────

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}

/**
 * Deadline urgency styling. No chip fills — just colored text.
 * Red only for genuinely urgent (≤5 days). Past + everything else
 * stays neutral muted so the row doesn't look like a fire drill by
 * default.
 */
function deadlineTextClasses(days: number): string {
  if (days < 0) return 'text-muted-foreground';
  if (days <= 5) return 'text-red-600 dark:text-red-400 font-medium';
  return 'text-foreground';
}

function formatDate(iso?: string | null): string {
  if (!iso) return '?';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── Component ─────────────────────────────────────────────────────────

export default function MatchCard({
  match,
  onPriceClick,
  isPricing = false,
  pricingDisabled = false,
}: MatchCardProps) {
  const days = daysUntil(match.response_deadline);
  // Plain-English deadline label. "X days left" was ambiguous (left of
  // what?) — now it's framed as a response due-date.
  const deadlineLabel = (() => {
    if (days === null) return null;
    if (days < 0) return `Closed ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `Due in ${days} days`;
  })();

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex">
        {/* Rank rail — just the position number. */}
        <div className="flex w-12 shrink-0 flex-col items-center justify-start border-r border-border bg-muted/30 py-5">
          <span className="text-base font-semibold tabular-nums text-muted-foreground">
            #{match.rank}
          </span>
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
          {/* Title + notice type chip */}
          <div className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">
                {match.title}
              </h3>
              {match.notice_type_label && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {match.notice_type_label}
                </span>
              )}
            </div>
            {match.solicitation_number && (
              <p className="text-[11px] text-muted-foreground font-mono">
                {match.solicitation_number}
              </p>
            )}
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
            <div className="flex items-start gap-1.5">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                {match.awarding_top_agency && (
                  <p className="truncate text-muted-foreground">{match.awarding_top_agency}</p>
                )}
                {match.awarding_sub_agency && (
                  <p className="truncate font-medium text-foreground">{match.awarding_sub_agency}</p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-1.5">
              <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                {match.set_aside_code ? (
                  <>
                    <p className="font-medium text-foreground">{match.set_aside_code}</p>
                    {match.set_aside_description && (
                      <p className="truncate text-muted-foreground">{match.set_aside_description}</p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Open competition</p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-1.5">
              <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-muted-foreground">Posted {formatDate(match.posted_date)}</span>
                {match.response_deadline && days !== null && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className={deadlineTextClasses(days)}>
                      {deadlineLabel}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="flex flex-wrap items-baseline gap-x-2">
                {(match.pop_city || match.pop_state) && (
                  <span className="text-foreground">
                    {[match.pop_city, match.pop_state].filter(Boolean).join(', ')}
                  </span>
                )}
                {match.naics_codes.length > 0 && (
                  <span className="text-muted-foreground font-mono">
                    NAICS {match.naics_codes.join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Why this matched */}
          {match.match_reasons.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Target className="h-3 w-3" /> Why this matched
              </p>
              <ul className="space-y-0.5 text-[11px] text-foreground">
                {match.match_reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* PWS attachment */}
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {match.pws.filename}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatBytes(match.pws.size_bytes)}
                  {' · '}
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {match.pws.confidence} confidence
                  </span>
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Pre-picked PWS
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {match.ui_link && (
              <a href={match.ui_link} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on SAM.gov
                </Button>
              </a>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => onPriceClick?.(match)}
              disabled={pricingDisabled}
            >
              {isPricing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Preparing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Price this RFP
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
