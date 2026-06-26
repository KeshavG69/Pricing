'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Loader2,
  Radar,
  RefreshCcw,
  Settings,
  Sparkles,
} from 'lucide-react';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import CalendarStrip from '@/components/rfp-radar/CalendarStrip';
import MatchCard from '@/components/rfp-radar/MatchCard';
import { useCapabilityBuilderStore } from '@/lib/stores/capabilityBuilderStore';
import type { RFPRadarMatch } from '@/types';

/**
 * Render a YYYY-MM-DD string as "Monday, June 10" in the browser's local
 * timezone. The bare Date(y, m-1, d) ctor builds a local-midnight Date,
 * so toLocaleDateString with no `timeZone` option formats it in the
 * user's tz — what their wall clock would say.
 */
function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** YYYY-MM-DD for "today" in the user's local timezone. */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Manual "Run scan now" is temporarily disabled. The endpoint ran a 217 MB
 * SAM.gov download + parse synchronously inside the web process; under
 * repeated clicks it exhausted the container's threads/memory and broke
 * unrelated requests (e.g. document upload → "can't start new thread"). The
 * daily Celery beat scan still runs automatically every morning. Flip this
 * back to `true` once the scan is offloaded to a background worker task.
 */
const SCAN_NOW_ENABLED = false;

export default function RFPRadarPage() {
  const router = useRouter();
  const profile = useCapabilityBuilderStore((s) => s.profile);
  const profileLoading = useCapabilityBuilderStore((s) => s.profileLoading);
  const profileError = useCapabilityBuilderStore((s) => s.profileError);
  const matches = useCapabilityBuilderStore((s) => s.matches);
  const matchesLoading = useCapabilityBuilderStore((s) => s.matchesLoading);
  const matchesError = useCapabilityBuilderStore((s) => s.matchesError);
  const availableDates = useCapabilityBuilderStore((s) => s.availableDates);
  const viewingDate = useCapabilityBuilderStore((s) => s.viewingDate);
  const scanning = useCapabilityBuilderStore((s) => s.scanning);
  const scanError = useCapabilityBuilderStore((s) => s.scanError);
  const pricingNoticeId = useCapabilityBuilderStore((s) => s.pricingNoticeId);
  const priceError = useCapabilityBuilderStore((s) => s.priceError);

  const loadInitial = useCapabilityBuilderStore((s) => s.loadInitial);
  const loadMatches = useCapabilityBuilderStore((s) => s.loadMatches);
  const setViewingDate = useCapabilityBuilderStore((s) => s.setViewingDate);
  const runScanNow = useCapabilityBuilderStore((s) => s.runScanNow);
  const priceMatch = useCapabilityBuilderStore((s) => s.priceMatch);

  // Initial load — runs the network only on first visit or after an org
  // switch. On subsequent navigations the store is already hydrated, so this
  // is a no-op and the cached profile/matches render instantly (no reload).
  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  /**
   * "Price this RFP" handoff: download the pre-picked PWS through the
   * backend, push it through the standard proposals upload API, then land
   * on the proposal page — the same live parser-event experience as a
   * manual upload.
   */
  const handlePriceClick = async (m: RFPRadarMatch) => {
    try {
      const proposalId = await priceMatch(m);
      router.push(`/proposals/${proposalId}`);
    } catch {
      // priceError is set in the store and rendered below the calendar.
    }
  };

  // ── State 0: profile still loading ────────────────────────────────
  if (profileLoading && profile === null) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── State 1: no profile yet → onboarding CTA ──────────────────────
  if (!profileLoading && profile === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Radar className="h-7 w-7" />
          </div>
          <h1 className="mb-2 text-2xl font-semibold text-foreground">
            Welcome to RFP Radar
          </h1>
          <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
            Tell us your company name and we&apos;ll build your profile from your
            actual federal contract history. Then every morning at 6am ET, we&apos;ll
            scan SAM.gov for opportunities that match.
          </p>
          <Link href="/dashboard/settings/organization?tab=rfp-radar">
            <Button variant="primary">
              <Sparkles className="h-4 w-4 mr-2" />
              Build my profile
            </Button>
          </Link>
          {profileError && (
            <p className="mt-4 text-xs text-red-600 dark:text-red-400">
              {profileError}
            </p>
          )}
        </Card>
      </div>
    );
  }

  // ── State 2+ : profile exists ────────────────────────────────────
  const isToday = viewingDate === todayIso();
  const noMatchesForDate = !matchesLoading && matches.length === 0 && !matchesError;
  const hasEverScanned = availableDates.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Radar className="h-3.5 w-3.5" />
            RFP RADAR · {profile?.company_name}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            {isToday ? "Today's matches" : formatLongDate(viewingDate)}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {matchesLoading
              ? 'Loading…'
              : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} for ${viewingDate}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/settings/organization?tab=rfp-radar">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Profile
            </Button>
          </Link>
          {SCAN_NOW_ENABLED && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void runScanNow()}
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scanning…
                </>
              ) : (
                <>
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Run scan now
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Calendar strip */}
      <div className="mb-6">
        <CalendarStrip
          selectedDate={viewingDate}
          availableDates={availableDates}
          onSelect={setViewingDate}
        />
      </div>

      {/* Scan error */}
      {scanError && (
        <Card className="mb-4 border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex items-start gap-2 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <p className="text-xs text-amber-900 dark:text-amber-200">{scanError}</p>
          </div>
        </Card>
      )}

      {/* Price-handoff error */}
      {priceError && (
        <Card className="mb-4 border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex items-start gap-2 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <p className="text-xs text-amber-900 dark:text-amber-200">{priceError}</p>
          </div>
        </Card>
      )}

      {/* Matches loading */}
      {matchesLoading && matches.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse bg-muted/30" />
          ))}
        </div>
      )}

      {/* Matches list */}
      {!matchesLoading && matches.length > 0 && (
        <div className="space-y-3">
          {matches.map((m) => (
            <MatchCard
              key={m.id || m.notice_id}
              match={m}
              onPriceClick={handlePriceClick}
              isPricing={pricingNoticeId === m.notice_id}
              pricingDisabled={pricingNoticeId !== null}
            />
          ))}
        </div>
      )}

      {/* Empty: never scanned */}
      {noMatchesForDate && !hasEverScanned && (
        <Card className="border-dashed p-8 text-center">
          <Radar className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            No scans yet
          </h3>
          <p className="mx-auto mb-4 max-w-md text-xs text-muted-foreground">
            {SCAN_NOW_ENABLED
              ? 'We run a fresh scan every morning at 6am ET. You can also trigger one now — takes about 30–60 seconds.'
              : 'We run a fresh scan every morning at 6am ET. Your first matches will appear here after the next scan.'}
          </p>
          {SCAN_NOW_ENABLED && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void runScanNow()}
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scanning… (30–60s)
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Run my first scan
                </>
              )}
            </Button>
          )}
        </Card>
      )}

      {/* Empty: this day specifically (had scans before) */}
      {noMatchesForDate && hasEverScanned && (
        <Card className="border-dashed p-8 text-center">
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            No matches for {viewingDate}
          </h3>
          <p className="mx-auto max-w-md text-xs text-muted-foreground">
            {isToday
              ? "Today's scan may not have run yet, or no opportunities passed the quality filter today."
              : 'No scan was run that day, or no opportunities passed the quality filter.'}
          </p>
          {SCAN_NOW_ENABLED && isToday && (
            <div className="mt-4">
              <Button
                variant="primary"
                size="sm"
                onClick={() => void runScanNow()}
                disabled={scanning}
              >
                {scanning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scanning…
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Run scan now
                  </>
                )}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Matches error */}
      {matchesError && (
        <Card className="border-red-200 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-950/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-300" />
            <div className="flex-1">
              <p className="text-sm text-red-900 dark:text-red-200">
                {matchesError}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadMatches()}
                className="mt-2"
              >
                Retry
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
