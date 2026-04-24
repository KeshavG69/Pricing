'use client';

/**
 * Reasoning panel — modeled after the shadcn/assistant-ui "Thought for Xs"
 * pattern that became standard across Claude/ChatGPT/Perplexity in 2026.
 *
 * Behavior:
 *   - Auto-expands the moment the first reasoning step arrives.
 *   - Header shows "Thinking" with a shimmer sweep while streaming.
 *   - Body renders each step's thought as flowing prose (no "1. Step" scaffolding).
 *   - Typewriter buffers the thought text so it feels streamed even though
 *     the backend delivers it in one shot.
 *   - Once the answer starts streaming, header flips to "Thought for Xs"
 *     and panel auto-collapses. User can re-open via header click.
 *   - Soft vertical rule on the left + muted color makes it read like
 *     internal monologue, not a "proper" chat reply.
 *
 * Props: steps (accumulated from tool.started/tool.completed events) +
 * isStreaming (true while no answer content has arrived yet).
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { useTypewriter } from './useTypewriter';

export interface ReasoningStep {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  result?: string;
  running: boolean;
  error?: unknown;
}

interface Props {
  steps: ReasoningStep[];
  isStreaming: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function titleOf(step: ReasoningStep): string | null {
  const t = step.args?.title;
  return typeof t === 'string' && t.trim() ? t : null;
}

function thoughtOf(step: ReasoningStep): string | null {
  if (!step.args) return null;
  for (const field of ['thought', 'thoughts', 'reasoning', 'analysis']) {
    const v = step.args[field];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function actionOf(step: ReasoningStep): string | null {
  const a = step.args?.action;
  return typeof a === 'string' && a.trim() ? a : null;
}

// Concatenate title/thought/action of a step into flowing prose.
// Rendered through MarkdownRenderer so lists/bold/etc work naturally.
function stepToProse(step: ReasoningStep): string {
  const title = titleOf(step);
  const thought = thoughtOf(step);
  const action = actionOf(step);
  const parts: string[] = [];
  if (title) parts.push(`**${title}**`);
  if (thought) parts.push(thought);
  if (action) parts.push(`*Next:* ${action}`);
  return parts.join('\n\n');
}

// ─── Elapsed-time hook ─────────────────────────────────────────────────────
function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (active) {
      if (startRef.current == null) startRef.current = Date.now();
      const id = setInterval(() => {
        if (startRef.current != null) {
          setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
        }
      }, 200);
      return () => clearInterval(id);
    } else if (startRef.current != null) {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }
  }, [active]);
  return Math.max(elapsed, 0);
}

// ─── Shimmer label — text with an animated gradient sweep ──────────────────
function ShimmerLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-block bg-clip-text text-transparent"
      style={{
        backgroundImage:
          'linear-gradient(110deg, rgb(71 85 105) 20%, rgb(100 116 139) 40%, rgb(30 41 59) 50%, rgb(100 116 139) 60%, rgb(71 85 105) 80%)',
        backgroundSize: '200% 100%',
        animation: 'reasoning-shimmer 2s linear infinite',
      }}
    >
      {children}
      <style jsx>{`
        @keyframes reasoning-shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </span>
  );
}

// ─── Body — flowing reasoning text ──────────────────────────────────────────
function StreamingBody({
  steps,
  isStreaming,
}: {
  steps: ReasoningStep[];
  isStreaming: boolean;
}) {
  // Concatenate every step's prose into one blob separated by soft dividers.
  // Each step's "target" stream is everything up to and including that step.
  const fullTarget = steps.map(stepToProse).join('\n\n---\n\n');
  // Typewriter active only while live-streaming. Once settled, show full text.
  const typed = useTypewriter(isStreaming ? fullTarget : fullTarget, {
    charsPerTick: 6,
    tickMs: 14,
  });
  const display = isStreaming ? typed : fullTarget;

  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }
    }, 120);
    return () => clearInterval(id);
  }, [isStreaming]);

  return (
    <div className="relative">
      <div
        ref={bodyRef}
        className="prose-chat relative max-h-56 overflow-y-auto pl-4 pr-2 py-2 text-[12px] leading-relaxed text-muted-foreground"
        style={{
          borderLeft: '2px solid rgb(226 232 240)', // slate-200 rail
        }}
      >
        <MarkdownRenderer>{display}</MarkdownRenderer>
        {isStreaming && typed.length < fullTarget.length && (
          <span className="inline-block h-3 w-[2px] translate-y-[2px] bg-slate-400/80 animate-pulse" />
        )}
      </div>
      {/* Gradient fade at the bottom while streaming — hides the scroll cutoff */}
      {isStreaming && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-6"
          style={{
            background:
              'linear-gradient(to top, rgb(248 250 252) 10%, transparent)',
          }}
          aria-hidden
        />
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export default function ReasoningSteps({ steps, isStreaming }: Props) {
  // Auto-open on first step; auto-collapse when streaming ends — but respect
  // user's manual override if they toggled it.
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const autoOpen = isStreaming;
  const open = userOverride ?? autoOpen;

  // Elapsed time (freezes when isStreaming flips to false)
  const elapsed = useElapsed(isStreaming);

  if (steps.length === 0) return null;

  const anyRunning = steps.some((s) => s.running);
  const label = isStreaming || anyRunning ? 'Thinking' : `Thought for ${elapsed || 1}s`;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setUserOverride(!open)}
        className="group flex w-full items-center gap-1.5 text-left text-xs text-slate-600 hover:text-slate-900"
        aria-expanded={open}
      >
        {isStreaming ? (
          <ShimmerLabel>{label}</ShimmerLabel>
        ) : (
          <span className="font-medium">{label}</span>
        )}
        <ChevronDown
          className={`h-3 w-3 opacity-50 transition-transform group-hover:opacity-100 ${
            open ? 'rotate-0' : '-rotate-90'
          }`}
        />
      </button>

      {/* Content — mounts always but height animates. We use CSS grid-rows
          trick (0fr → 1fr) for a smooth expand/collapse without measuring. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-1.5">
            <StreamingBody steps={steps} isStreaming={isStreaming} />
          </div>
        </div>
      </div>
    </div>
  );
}
