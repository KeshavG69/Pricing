'use client';

import { useMemo } from 'react';

interface CalendarStripProps {
  /** YYYY-MM-DD — currently focused day. */
  selectedDate: string;
  /** YYYY-MM-DD entries that have saved matches — drives the dot indicator. */
  availableDates: string[];
  /** Number of past days (incl. today) to show. Defaults to 7. */
  windowDays?: number;
  /** Called with YYYY-MM-DD when the user picks a day. */
  onSelect: (date: string) => void;
}

/**
 * Format a Date as a YYYY-MM-DD string in the *local* timezone.
 *
 * Using ISO-string slicing on a UTC date would silently roll over the
 * day for users west of UTC — e.g. a Californian opening the radar at
 * 9 PM PST would see "tomorrow" highlighted as today. We pull the
 * local Y/M/D components instead so the calendar matches the user's
 * wall clock.
 */
function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string back into a Date *at local midnight*. */
function fromLocalIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Local-time weekday label. No timeZone option → uses the browser's tz.
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
});

export default function CalendarStrip({
  selectedDate,
  availableDates,
  windowDays = 7,
  onSelect,
}: CalendarStripProps) {
  const todayIso = useMemo(() => toLocalIso(new Date()), []);
  const available = useMemo(() => new Set(availableDates), [availableDates]);

  const days = useMemo(() => {
    const out: { iso: string; date: Date }[] = [];
    const today = new Date();
    for (let i = windowDays - 1; i >= 0; i--) {
      // Walk back from today using local Y/M/D — JS Date math is local-aware,
      // so subtracting from getDate() handles DST transitions correctly.
      const d = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - i,
      );
      out.push({ iso: toLocalIso(d), date: d });
    }
    return out;
  }, [windowDays]);

  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
      {days.map(({ iso, date }) => {
        const isSelected = iso === selectedDate;
        const isToday = iso === todayIso;
        const hasMatches = available.has(iso);

        return (
          <button
            key={iso}
            type="button"
            onClick={() => onSelect(iso)}
            className={[
              'group relative flex min-w-[64px] shrink-0 flex-col items-center rounded-lg border px-2.5 py-2 text-center transition-all duration-150',
              isSelected
                ? 'border-primary bg-primary/10 text-primary shadow-sm font-semibold'
                : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/40',
            ].join(' ')}
            aria-pressed={isSelected}
            aria-label={`View matches for ${iso}${hasMatches ? ' (matches available)' : ''}`}
          >
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {WEEKDAY_FORMATTER.format(date)}
            </span>
            <span className="mt-0.5 text-base font-semibold tabular-nums">
              {date.getDate()}
            </span>
            {/* Indicator row */}
            <span className="mt-1 flex h-1.5 items-center gap-1">
              {isToday && (
                <span className="rounded-full bg-amber-500 px-1 text-[8px] font-bold uppercase text-white">
                  Today
                </span>
              )}
              {hasMatches && !isToday && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-primary"
                  title="Matches available"
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// fromLocalIso is exported only for tests/external use if needed.
export { fromLocalIso, toLocalIso };
