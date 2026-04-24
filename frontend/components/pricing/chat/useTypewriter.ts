'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reveal a string character-by-character (or N chars per tick) for a
 * typewriter effect. If `target` changes to a longer version (e.g. the
 * backend appended more content), the typewriter keeps catching up.
 *
 * If `target` changes to something that isn't a prefix extension of the
 * already-shown text, the hook resets and starts typing the new target
 * from scratch.
 *
 * Runs at ~200 chars/sec by default (3 chars every 15ms) — fast enough
 * to feel live without looking robotic.
 */
export function useTypewriter(
  target: string,
  opts: { charsPerTick?: number; tickMs?: number } = {},
): string {
  const { charsPerTick = 3, tickMs = 15 } = opts;
  const [shown, setShown] = useState<string>('');
  const targetRef = useRef<string>(target);

  // Update the typing target each time `target` changes. If the new target
  // no longer begins with what we've already shown, reset.
  useEffect(() => {
    targetRef.current = target;
    setShown((prev) => (target.startsWith(prev) ? prev : ''));
  }, [target]);

  // Tick interval — advances `shown` toward `targetRef.current`.
  useEffect(() => {
    const id = setInterval(() => {
      setShown((prev) => {
        const t = targetRef.current;
        if (prev.length >= t.length) return prev;
        const nextLen = Math.min(prev.length + charsPerTick, t.length);
        return t.slice(0, nextLen);
      });
    }, tickMs);
    return () => clearInterval(id);
  }, [charsPerTick, tickMs]);

  // Safety clamp in case `target` shrank between renders
  return shown.length > target.length ? target : shown;
}
