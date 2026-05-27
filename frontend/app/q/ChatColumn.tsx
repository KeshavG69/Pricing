'use client';

/**
 * ChatColumn — full chat experience embedded inline in /q.
 *
 * Streaming behavior mirrors PricingChatPanel exactly (deltas, tool calls,
 * reasoning, paused-run approval); the chrome is built fresh for the /q
 * surface — generous spacing, refined typography, soft user-message
 * bubbles, an elevated input dock, and a calmer approval card.
 *
 * Design rules applied:
 *   - Custom strong ease-out (`cubic-bezier(0.23,1,0.32,1)`) on every UI
 *     transition; never plain `ease` or `ease-in`.
 *   - `active:scale-[0.97]` on every pressable button.
 *   - Input dock has a focus ring + subtle elevation, send button presses.
 *   - Messages fade-up on entry (`msgIn` keyframe, motion-safe gated).
 *   - Approval card uses primary/muted, not amber — approval is not an
 *     error state.
 */

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Send, Loader2, Check, X as XIcon, Sparkles } from 'lucide-react';
import {
  streamPricingChat,
  streamPricingChatResume,
  type ChatMessageRecord,
} from '@/lib/api/pricingChat';
import {
  ARTIFACT_TOOL_NAMES,
  EXA_TOOL_NAMES,
  REASONING_TOOL_NAMES,
  type ChatMessage,
  type MessageBlock,
  type PausedRun,
  type ToolCallEntry,
} from '@/lib/chat/types';
import { hydrateMessagesFromRecords, resultToStr } from '@/lib/chat/hydrate';
import MarkdownRenderer from '@/components/pricing/chat/MarkdownRenderer';
import ChartArtifact, {
  parseChartConfig,
} from '@/components/pricing/chat/ChartArtifact';
import ArtifactDownloadCard, {
  parseArtifactPayload,
} from '@/components/pricing/chat/ArtifactDownloadCard';
import SearchExaResults from '@/components/pricing/chat/SearchExaResults';
import ReasoningSteps, {
  type ReasoningStep,
} from '@/components/pricing/chat/ReasoningSteps';

// ─── Props ──────────────────────────────────────────────────────

export interface ChatColumnProps {
  userId: string;
  organizationId: string;
  proposalId: string;
  role?: string;
  proposalType?: 'bls' | 'gsa';
  gsaFileId?: string;
  gsaCurrentYear?: number;
  sessionId: string;
  initialMessages: ChatMessageRecord[];
  proposalName?: string;
  /**
   * Fires once after the first user-assistant turn of a previously-empty
   * chat finishes streaming. Useful for sidebar refreshes so the new
   * conversation row (and its LLM-generated title) show up.
   */
  onFirstTurnComplete?: () => void;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Component ──────────────────────────────────────────────────

export default function ChatColumn({
  userId,
  organizationId,
  proposalId,
  role,
  proposalType,
  gsaFileId,
  gsaCurrentYear,
  sessionId,
  initialMessages,
  proposalName,
  onFirstTurnComplete,
}: ChatColumnProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [pausedRun, setPausedRun] = useState<PausedRun | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const resumeAbortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const sessionIdRef = useRef<string>(sessionId);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Hydrate on chat switch
  useEffect(() => {
    const hydrated = hydrateMessagesFromRecords(initialMessages);
    setMessages(hydrated);
    const lastAssistant = [...hydrated].reverse().find((m) => m.role === 'assistant');
    setPausedRun(lastAssistant?.pausedRun ?? null);
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      inputRef.current?.focus();
    }, 40);
    abortRef.current?.abort();
    resumeAbortRef.current?.abort();
    setIsStreaming(false);
  }, [initialMessages]);

  // Auto-scroll on every message update while streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea (simple, single-line→multi-line up to 6 rows)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // ─── Send ─────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || pausedRun) return;

    // Snapshot — was this the first turn of an empty conversation?
    // Used after the stream ends to fire onFirstTurnComplete so /q can
    // refresh its sidebar and pick up the new conversation + LLM title.
    const isFirstTurn = messagesRef.current.length === 0;

    const userMsg: ChatMessage = {
      id: newId('u'),
      role: 'user',
      content: trimmed,
    };
    const assistantMsg: ChatMessage = {
      id: newId('a'),
      role: 'assistant',
      content: '',
      streaming: true,
      thinking: true,
    };
    setMessages((m) => [...m, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const evt of streamPricingChat(
        {
          query: trimmed,
          session_id: sessionIdRef.current,
          organization_id: organizationId,
          proposal_id: proposalId,
          user_id: userId,
          role,
          proposal_type: proposalType,
          gsa_file_id: gsaFileId,
          gsa_current_year: gsaCurrentYear,
        },
        controller.signal,
      )) {
        applyEventToMessage(evt, assistantMsg.id, setMessages, setPausedRun);
        if (evt.type === 'run.paused') break;
      }
    } finally {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMsg.id ? { ...msg, streaming: false, thinking: false } : msg,
        ),
      );
      setIsStreaming(false);
      abortRef.current = null;

      // First turn done — let the parent (e.g. /q sidebar) refresh.
      // Fired AFTER state is clean so refreshes see the final messages.
      if (isFirstTurn && onFirstTurnComplete) {
        // Slight delay gives the backend's persist + title-gen background
        // tasks time to complete before the parent refetches. Empirically
        // ~2-2.5s for Haiku; we use 2.5s as a safe ceiling.
        setTimeout(() => onFirstTurnComplete(), 2500);
      }
    }
  }, [
    input,
    isStreaming,
    pausedRun,
    organizationId,
    proposalId,
    userId,
    role,
    proposalType,
    gsaFileId,
    gsaCurrentYear,
    onFirstTurnComplete,
  ]);

  // ─── Resume after approval ────────────────────────────────

  const handleResume = useCallback(
    async (confirmed: boolean, note?: string) => {
      if (!pausedRun) return;
      const pr = pausedRun;
      setPausedRun(null);
      setIsStreaming(true);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === pr.message_id
            ? { ...msg, streaming: true, thinking: false, pausedRun: undefined }
            : msg,
        ),
      );

      const controller = new AbortController();
      resumeAbortRef.current = controller;
      try {
        for await (const evt of streamPricingChatResume(
          {
            run_id: pr.run_id,
            session_id: sessionIdRef.current,
            organization_id: organizationId,
            confirmed,
            confirmation_note: note,
            proposal_id: proposalId,
            user_id: userId,
            role,
            proposal_type: proposalType,
            gsa_file_id: gsaFileId,
            gsa_current_year: gsaCurrentYear,
          },
          controller.signal,
        )) {
          applyEventToMessage(evt, pr.message_id, setMessages, setPausedRun);
          if (evt.type === 'run.paused') break;
        }
      } finally {
        setMessages((m) =>
          m.map((msg) => (msg.id === pr.message_id ? { ...msg, streaming: false } : msg)),
        );
        setIsStreaming(false);
        resumeAbortRef.current = null;
      }
    },
    [
      pausedRun,
      organizationId,
      proposalId,
      userId,
      role,
      proposalType,
      gsaFileId,
      gsaCurrentYear,
    ],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const onSuggestionClick = useCallback((text: string) => {
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Scrolling messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 pb-8 pt-6">
          {messages.length === 0 ? (
            <EmptyState proposalName={proposalName} onPick={onSuggestionClick} />
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) => (
                <MessageRow
                  key={m.id}
                  msg={m}
                  index={i}
                  onApprove={() => handleResume(true)}
                  onReject={() => handleResume(false)}
                  isResumeRunning={isStreaming && pausedRun?.message_id === m.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input dock */}
      <div className="shrink-0 border-t border-border/60 bg-background px-4 pb-5 pt-3">
        <div className="mx-auto max-w-3xl">
          <div
            className={`group/input relative flex items-end gap-2 rounded-2xl border border-border/70 bg-background px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-within:border-border focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.10),0_1px_2px_rgba(0,0,0,0.05)] ${
              !!pausedRun ? 'opacity-60' : ''
            }`}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                pausedRun
                  ? 'Approve or reject the action above to continue'
                  : 'Ask anything about this proposal'
              }
              disabled={isStreaming || !!pausedRun}
              rows={1}
              className="max-h-40 flex-1 resize-none border-0 bg-transparent py-1.5 pl-1.5 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0 disabled:opacity-70"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isStreaming || !!pausedRun}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm transition-[transform,background-color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-primary/90 active:scale-[0.92] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
              aria-label="Send message"
            >
              {isStreaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
              ) : (
                <Send className="h-3.5 w-3.5" strokeWidth={2.25} />
              )}
            </button>
          </div>
          <div className="mt-1.5 px-1 text-[10.5px] text-muted-foreground/60">
            Press <kbd className="rounded bg-muted px-1 py-px font-medium">↵</kbd> to
            send, <kbd className="rounded bg-muted px-1 py-px font-medium">⇧↵</kbd> for
            a new line.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────

const SUGGESTIONS = [
  "What's the grand total broken down by year?",
  'How can I close the PtW gap?',
  'Which positions cost the most over the contract period?',
  'Compare prime vs subcontractor labor cost.',
];

function EmptyState({
  proposalName,
  onPick,
}: {
  proposalName?: string;
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-center pt-16 text-center motion-safe:animate-[scaleIn_360ms_cubic-bezier(0.23,1,0.32,1)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_8px_24px_-8px_rgba(37,99,235,0.45)]">
        <span className="text-lg font-bold tracking-tight">Q</span>
      </div>
      <h3 className="mt-5 text-base font-semibold tracking-tight text-foreground">
        {proposalName ? `Ask Q about “${proposalName}”` : 'Ask Q about this proposal'}
      </h3>
      <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
        Q reads the live proposal state and can compute, compare, visualise, or
        apply changes (with your approval).
      </p>

      <div className="mt-6 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            style={{ animationDelay: `${i * 50}ms` }}
            className="group rounded-lg border border-border/60 bg-background px-3 py-2.5 text-left text-[12.5px] leading-snug text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-border hover:bg-muted/40 hover:text-foreground active:scale-[0.98] motion-safe:animate-[chatRowIn_420ms_cubic-bezier(0.23,1,0.32,1)_backwards]"
          >
            <Sparkles className="mb-1.5 inline h-3 w-3 text-primary/70 transition-colors duration-150 group-hover:text-primary" />
            <div>{s}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Per-message render ────────────────────────────────────────

interface MessageRowProps {
  msg: ChatMessage;
  index: number;
  onApprove: () => void;
  onReject: () => void;
  isResumeRunning: boolean;
}

const MessageRow = memo(function MessageRow({
  msg,
  onApprove,
  onReject,
  isResumeRunning,
}: MessageRowProps) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end motion-safe:animate-[msgIn_280ms_cubic-bezier(0.23,1,0.32,1)]">
        <div className="max-w-[78%] whitespace-pre-wrap rounded-2xl bg-primary/[0.09] px-3.5 py-2 text-[14px] leading-relaxed text-foreground">
          {msg.content}
        </div>
      </div>
    );
  }

  const toolCallsById = new Map((msg.toolCalls || []).map((c) => [c.id, c]));
  const nonArtifactTools = (msg.toolCalls || []).filter((c) => !ARTIFACT_TOOL_NAMES.has(c.name));

  return (
    <div className="flex gap-3 motion-safe:animate-[msgIn_320ms_cubic-bezier(0.23,1,0.32,1)]">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary text-[11px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(37,99,235,0.4)]">
        Q
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {/* Reasoning steps */}
        {msg.reasoning && msg.reasoning.length > 0 && (
          <ReasoningSteps
            steps={msg.reasoning as ReasoningStep[]}
            isStreaming={!!msg.streaming && !msg.content}
          />
        )}

        {/* Non-artifact tool pills */}
        {nonArtifactTools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {nonArtifactTools.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {c.status === 'running' ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" strokeWidth={2.5} />
                ) : c.status === 'error' ? (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-500" />
                ) : (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                )}
                <span className="font-mono">{c.name}</span>
              </span>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="text-[14px] leading-relaxed text-foreground">
          <Body blocks={msg.blocks} content={msg.content} toolCallsById={toolCallsById} />
        </div>

        {/* Thinking indicator (no content yet) */}
        {msg.thinking && !msg.content && (
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="inline-flex gap-0.5">
              <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground/60" />
            </span>
            <span>Thinking</span>
          </div>
        )}

        {/* Approval card */}
        {msg.pausedRun && (
          <ApprovalCard
            paused={msg.pausedRun}
            onApprove={onApprove}
            onReject={onReject}
            isResuming={isResumeRunning}
          />
        )}
      </div>
    </div>
  );
});

// ─── Body block walker ─────────────────────────────────────────

function Body({
  blocks,
  content,
  toolCallsById,
}: {
  blocks?: MessageBlock[];
  content: string;
  toolCallsById: Map<string, ToolCallEntry>;
}) {
  if (!blocks || blocks.length === 0) {
    return content ? <MarkdownRenderer>{content}</MarkdownRenderer> : null;
  }
  return (
    <>
      {blocks.map((b) => {
        if (b.kind === 'text') {
          if (!b.text) return null;
          return (
            <div key={b.id}>
              <MarkdownRenderer>{b.text}</MarkdownRenderer>
            </div>
          );
        }
        const call = toolCallsById.get(b.toolCallId);
        if (!call || call.status !== 'completed') return null;
        return <Artifact key={b.id} call={call} />;
      })}
    </>
  );
}

function Artifact({ call }: { call: ToolCallEntry }) {
  if (EXA_TOOL_NAMES.has(call.name)) {
    const args = (call.args || {}) as Record<string, unknown>;
    const query =
      typeof args.query === 'string'
        ? args.query
        : Array.isArray(args.merged_queries)
          ? 'Web search'
          : '';
    return <SearchExaResults query={query} isRunning={false} result={call.result} />;
  }
  if (call.name === 'chart_tool') {
    const config = parseChartConfig(call.result);
    if (config) return <ChartArtifact config={config} />;
  }
  if (call.name === 's3_upload_tool') {
    const payload = parseArtifactPayload(call.result);
    if (payload) return <ArtifactDownloadCard payload={payload} />;
  }
  return null;
}

// ─── Approval card ─────────────────────────────────────────────

interface ApprovalCardProps {
  paused: PausedRun;
  onApprove: () => void;
  onReject: () => void;
  isResuming: boolean;
}

function ApprovalCard({ paused, onApprove, onReject, isResuming }: ApprovalCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/30 motion-safe:animate-[scaleIn_280ms_cubic-bezier(0.23,1,0.32,1)]">
      <div className="border-b border-border/60 bg-background px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-3 w-3" />
          </span>
          Approval required
          <span className="font-mono text-[11px] text-muted-foreground/80">
            · {paused.tool_name || 'pending action'}
          </span>
        </div>
        {paused.rationale && (
          <div className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {paused.rationale}
          </div>
        )}
      </div>

      {paused.tool_args && (
        <details className="border-b border-border/60 bg-background/40 px-3.5 py-2 text-[11px] text-muted-foreground/80 [&[open]>summary>svg]:rotate-90">
          <summary className="flex cursor-pointer items-center gap-1.5 select-none">
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className="transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
            >
              <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            View arguments
          </summary>
          <pre className="mt-1.5 max-h-44 overflow-auto rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed text-foreground">
            {JSON.stringify(paused.tool_args, null, 2)}
          </pre>
        </details>
      )}

      <div className="flex items-center justify-end gap-2 px-3.5 py-2.5">
        <button
          onClick={onReject}
          disabled={isResuming}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:opacity-50"
        >
          <XIcon className="h-3 w-3" />
          Reject
        </button>
        <button
          onClick={onApprove}
          disabled={isResuming}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[12.5px] font-medium text-white shadow-sm transition-[transform,background-color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50"
        >
          {isResuming ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" strokeWidth={2.5} />
          )}
          Approve
        </button>
      </div>
    </div>
  );
}

// ─── Event → message state machine ─────────────────────────────

function applyEventToMessage(
  evt: Awaited<ReturnType<typeof streamPricingChat>> extends AsyncGenerator<infer E>
    ? E
    : never,
  assistantMsgId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setPausedRun: React.Dispatch<React.SetStateAction<PausedRun | null>>,
): void {
  if (evt.type === 'analysis') return;

  if (evt.type === 'delta') {
    setMessages((m) =>
      m.map((msg) => {
        if (msg.id !== assistantMsgId) return msg;
        const blocks = msg.blocks ? [...msg.blocks] : [];
        const last = blocks[blocks.length - 1];
        if (last && last.kind === 'text') {
          blocks[blocks.length - 1] = { ...last, text: last.text + evt.content };
        } else {
          blocks.push({ kind: 'text', id: newId('blk'), text: evt.content });
        }
        return {
          ...msg,
          content: msg.content + evt.content,
          blocks,
          thinking: false,
        };
      }),
    );
    return;
  }

  if (evt.type === 'done') {
    setMessages((m) =>
      m.map((msg) => {
        if (msg.id !== assistantMsgId) return msg;
        const finalContent = evt.content || msg.content;
        const blocks =
          msg.blocks && msg.blocks.length > 0
            ? msg.blocks
            : finalContent
              ? [{ kind: 'text' as const, id: newId('blk'), text: finalContent }]
              : [];
        return {
          ...msg,
          content: finalContent,
          blocks,
          streaming: false,
          thinking: false,
        };
      }),
    );
    return;
  }

  if (evt.type === 'tool.started') {
    const toolName = evt.tool_name || 'tool';
    const isReasoning = REASONING_TOOL_NAMES.has(toolName);
    setMessages((m) =>
      m.map((msg) => {
        if (msg.id !== assistantMsgId) return msg;
        const stepId = evt.tool_call_id || newId('step');
        if (isReasoning) {
          const nextSteps: ReasoningStep[] = [
            ...(msg.reasoning || []),
            { id: stepId, name: toolName, args: evt.tool_args, running: true },
          ];
          return { ...msg, reasoning: nextSteps };
        }
        const nextCalls: ToolCallEntry[] = [
          ...(msg.toolCalls || []),
          { id: stepId, name: toolName, status: 'running', args: evt.tool_args },
        ];
        const nextBlocks: MessageBlock[] | undefined = ARTIFACT_TOOL_NAMES.has(toolName)
          ? [
              ...(msg.blocks || []),
              { kind: 'tool', id: newId('blk'), toolCallId: stepId },
            ]
          : msg.blocks;
        return { ...msg, toolCalls: nextCalls, blocks: nextBlocks };
      }),
    );
    return;
  }

  if (evt.type === 'tool.completed') {
    const toolName = evt.tool_name || 'tool';
    const isReasoning = REASONING_TOOL_NAMES.has(toolName);
    setMessages((m) =>
      m.map((msg) => {
        if (msg.id !== assistantMsgId) return msg;
        if (isReasoning) {
          const steps = msg.reasoning || [];
          const idx = evt.tool_call_id
            ? steps.findIndex((s) => s.id === evt.tool_call_id)
            : steps.findIndex((s) => s.running);
          if (idx >= 0) {
            const next = steps.map((s, i) =>
              i === idx
                ? {
                    ...s,
                    args: evt.tool_args ?? s.args,
                    result: resultToStr(evt.result),
                    error: evt.error,
                    running: false,
                  }
                : s,
            );
            return { ...msg, reasoning: next };
          }
          return {
            ...msg,
            reasoning: [
              ...steps,
              {
                id: evt.tool_call_id || newId('step'),
                name: toolName,
                args: evt.tool_args,
                result: resultToStr(evt.result),
                error: evt.error,
                running: false,
              },
            ],
          };
        }
        const calls = msg.toolCalls || [];
        const idx = evt.tool_call_id ? calls.findIndex((c) => c.id === evt.tool_call_id) : -1;
        const status: ToolCallEntry['status'] = evt.error ? 'error' : 'completed';
        const mergedArgs =
          idx >= 0
            ? { ...(calls[idx].args || {}), ...(evt.tool_args || {}) }
            : evt.tool_args;
        const updated: ToolCallEntry = {
          id: evt.tool_call_id || newId('call'),
          name: toolName,
          status,
          args: mergedArgs,
          result: evt.result,
        };
        const nextCalls =
          idx >= 0
            ? calls.map((c, i) => (i === idx ? { ...c, ...updated } : c))
            : [...calls, updated];
        return { ...msg, toolCalls: nextCalls };
      }),
    );
    return;
  }

  if (evt.type === 'run.paused') {
    setMessages((m) => {
      const msg = m.find((x) => x.id === assistantMsgId);
      const lastRunningCall = msg?.toolCalls?.filter((c) => c.status === 'running').at(-1);
      const paused: PausedRun = {
        run_id: evt.run_id,
        session_id: evt.session_id,
        tool_name: lastRunningCall?.name,
        tool_args: lastRunningCall?.args,
        rationale:
          typeof lastRunningCall?.args?.rationale === 'string'
            ? (lastRunningCall.args.rationale as string)
            : undefined,
        message_id: assistantMsgId,
      };
      setPausedRun(paused);
      return m.map((mm) =>
        mm.id === assistantMsgId
          ? { ...mm, streaming: false, thinking: false, pausedRun: paused }
          : mm,
      );
    });
    return;
  }

  if (evt.type === 'run.continued') {
    setPausedRun(null);
    setMessages((m) =>
      m.map((msg) => (msg.id === assistantMsgId ? { ...msg, pausedRun: undefined } : msg)),
    );
    return;
  }

  if (evt.type === 'error') {
    setMessages((m) =>
      m.map((msg) =>
        msg.id === assistantMsgId
          ? {
              ...msg,
              content: msg.content + `\n\n⚠ ${evt.error}`,
              streaming: false,
              thinking: false,
            }
          : msg,
      ),
    );
    return;
  }
}
