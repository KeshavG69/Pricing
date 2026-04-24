'use client';

/**
 * ThinkingIndicator — rotates through a pool of PriceIQ-themed status quotes
 * while the agent is working. Inspired by Claude Code's rotating status words.
 *
 * Shown in place of the streaming assistant bubble from the moment the backend
 * emits the `analysis` SSE event, until the first real content delta arrives.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

// Mix of short gerunds, whimsical one-liners, and insider govt-contracting
// jokes. Rotated with a fade so the status cycles like Claude Code's does.
const QUOTES: string[] = [
  'Pondering',
  'Crunching',
  'Cogitating',
  'Doing the math',
  'Reading the fine print',
  'Interrogating the fringe',
  'Wrangling wrap rates',
  'Consulting the FAR',
  'Convincing G&A to play nice',
  'Lining up the dollars',
  'Appeasing the auditors',
  'Stacking indirects',
  'Asking OH politely',
  'Channeling DCAA energy',
  'Cascading like it\u2019s 1999',
  'Chasing subtotals down a hallway',
  'Squinting at line items',
  'Weighing the burden',
  'Whispering to the FBLR',
  'Rolling up the years',
  'Reconciling with myself',
  'Untangling passthroughs',
  'Escalating gracefully',
  'Arguing with the spreadsheet',
  'Auditing my own work',
];

const ROTATE_MS = 2000;

function pickRandom(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

export default function ThinkingIndicator() {
  // Random starting quote
  const initial = useMemo(() => pickRandom(), []);
  const [quote, setQuote] = useState<string>(initial);
  const [fading, setFading] = useState<boolean>(false);

  useEffect(() => {
    const iv = setInterval(() => {
      // fade out, swap, fade in
      setFading(true);
      const to = setTimeout(() => {
        setQuote((prev) => {
          // Avoid picking the same quote twice in a row
          let next = pickRandom();
          if (QUOTES.length > 1) {
            while (next === prev) next = pickRandom();
          }
          return next;
        });
        setFading(false);
      }, 180);
      return () => clearTimeout(to);
    }, ROTATE_MS);

    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
      <span
        className={`italic transition-opacity duration-200 ease-in-out ${
          fading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {quote}…
      </span>
    </div>
  );
}
