'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Loader2, Sparkles } from 'lucide-react';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { serializeProposalContext } from '@/lib/chat/proposalContext';
import { streamPricingChat } from '@/lib/api/pricingChat';
import MarkdownRenderer from './chat/MarkdownRenderer';
import ThinkingIndicator from './chat/ThinkingIndicator';
import ReasoningSteps, { type ReasoningStep } from './chat/ReasoningSteps';
import ChartArtifact, { parseChartConfig } from './chat/ChartArtifact';
import ArtifactDownloadCard, {
  parseArtifactPayload,
  type ArtifactPayload,
} from './chat/ArtifactDownloadCard';
import ToolStatusPill, { type ToolPillSpec } from './chat/ToolStatusPill';
import ShimmerText from './chat/ShimmerText';

interface ToolCallEntry {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  args?: Record<string, unknown>;
  result?: unknown;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  thinking?: boolean; // true from send-click until first content delta
  reasoning?: ReasoningStep[]; // think/analyze tool calls, accumulated in order
  toolCalls?: ToolCallEntry[]; // python_repl, chart_tool, s3_upload, etc.
}

// Tool names the agent uses for reasoning. These render as collapsible
// reasoning steps; all other tool calls render as status pills / artifacts.
const REASONING_TOOL_NAMES = new Set(['think', 'analyze']);

function newSessionId(proposalId: string | null): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return proposalId ? `chat-${proposalId}-${suffix}` : `ephemeral-${suffix}`;
}

// Stringify tool.completed `result` (may be string, object, or anything else).
function resultToStr(r: unknown): string | undefined {
  if (r == null) return undefined;
  if (typeof r === 'string') return r;
  try {
    return JSON.stringify(r, null, 2);
  } catch {
    return String(r);
  }
}

/**
 * Resolve the human-readable title for a tool call.
 *
 * Priority (matches Kroolo's pattern):
 *   1. tool_args.description — agent's own past-tense summary
 *      (e.g. "Computed avg FBLR for on-site positions")
 *   2. Skill-aware: get_skill_instructions → "Reading PDF skill"
 *   3. s3_upload_tool with parsed payload → "Uploaded {filename}"
 *   4. Pretty-printed tool name fallback
 */
function prettyToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const SKILL_FORMAT_LABELS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  doc: 'Word',
  pptx: 'PowerPoint',
  ppt: 'PowerPoint',
  xlsx: 'Excel',
  xls: 'Excel',
  csv: 'CSV',
};

function resolveToolCallTitle(call: ToolCallEntry): string {
  const args = call.args || {};
  const verbing = call.status === 'running';

  // 1. Skill-aware: get_skill_instructions / get_skill_dependencies
  if (call.name === 'get_skill_instructions' || call.name === 'get_skill_dependencies') {
    const skillName =
      typeof args.skill_name === 'string' ? args.skill_name.trim().toLowerCase() : '';
    const label = SKILL_FORMAT_LABELS[skillName] || (skillName ? prettyToolName(skillName) : 'skill');
    return verbing ? `Reading ${label} skill` : `Read ${label} skill`;
  }

  // 2. Agent-supplied description
  const desc = typeof args.description === 'string' ? args.description.trim() : '';
  if (desc) return desc;

  // 3. s3_upload_tool — derive from filename if we can parse the result
  if (call.name === 's3_upload_tool') {
    const payload = parseArtifactPayload(call.result);
    if (payload) return verbing ? `Uploading ${payload.filename}` : `Uploaded ${payload.filename}`;
    const filenameArg = typeof args.filename === 'string' ? args.filename : '';
    if (filenameArg) return verbing ? `Uploading ${filenameArg}` : `Uploaded ${filenameArg}`;
    return verbing ? 'Uploading file' : 'Uploaded file';
  }

  // 4. python_repl_tool / chart_tool — neutral fallback
  if (call.name === 'python_repl_tool') return verbing ? 'Running code' : 'Ran code';
  if (call.name === 'chart_tool') return verbing ? 'Building chart' : 'Built chart';

  // 5. Generic
  const pretty = prettyToolName(call.name);
  return verbing ? `Running ${pretty}` : pretty;
}

/**
 * Render one non-reasoning tool call.
 *
 * - chart_tool (completed) → pill + ChartArtifact
 * - s3_upload_tool (completed) → pill + ArtifactDownloadCard
 * - everything else → pill only
 *
 * While running OR if parsing fails, falls back to a status pill.
 */
function ToolCallRender({
  call,
  isActiveStreamingTool,
  showTimelineConnector,
}: {
  call: ToolCallEntry;
  isActiveStreamingTool: boolean;
  showTimelineConnector: boolean;
}) {
  const title = resolveToolCallTitle(call);
  const pill: ToolPillSpec = {
    id: call.id,
    name: call.name,
    status: call.status,
    title,
  };

  const row = (
    <ToolStatusPill
      tool={pill}
      isActiveStreamingTool={isActiveStreamingTool}
      showTimelineConnector={showTimelineConnector}
    />
  );

  if (call.status !== 'completed') {
    return row;
  }

  if (call.name === 'chart_tool') {
    const cfg = parseChartConfig(call.result);
    if (cfg) {
      return (
        <>
          {row}
          <ChartArtifact config={cfg} />
        </>
      );
    }
    return row;
  }

  if (call.name === 's3_upload_tool') {
    const payload: ArtifactPayload | null = parseArtifactPayload(call.result);
    if (payload) {
      return (
        <>
          {row}
          <ArtifactDownloadCard payload={payload} />
        </>
      );
    }
    return row;
  }

  return row;
}

export default function PricingChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  // Session ID: regenerated every time the panel opens and on "New chat"
  // so each chat opens as a fresh conversation with no history bleed.
  const [sessionId, setSessionId] = useState<string>(() => newSessionId(null));

  // Resizable panel width — persisted across page loads. Bounded to a
  // sensible range so the user can't shrink it below usable or push it
  // wider than ~70% of the viewport.
  const PANEL_MIN_PX = 360;
  const PANEL_MAX_FRAC = 0.7;
  const PANEL_DEFAULT_PX = 448; // 28rem — matches the previous max-w-md
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return PANEL_DEFAULT_PX;
    const stored = window.localStorage.getItem('priceiq:chat-panel-width');
    const n = stored ? Number(stored) : NaN;
    return Number.isFinite(n) && n >= PANEL_MIN_PX ? n : PANEL_DEFAULT_PX;
  });
  const [isResizing, setIsResizing] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const proposalId = usePricingStore((s) => s.proposalId);
  const organizationId = useAuthStore((s) => s.user?.organization_id);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input + start a fresh session every time the panel opens.
  // New session id => fresh agent-side conversation history, no bleed from
  // a previous open.
  useEffect(() => {
    if (isOpen) {
      setSessionId(newSessionId(proposalId));
      setMessages([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, proposalId]);

  // Cancel any in-flight stream when panel closes or component unmounts
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // When the panel is open, push the main page content left by the panel
  // width so nothing hides underneath. Tracks the live (resizable) width
  // and disables the smooth transition while dragging so the page follows
  // the cursor exactly. Cleaned up on close/unmount.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const prevPadding = body.style.paddingRight;
    const prevTransition = body.style.transition;

    if (isOpen) {
      body.style.transition = isResizing ? 'none' : 'padding-right 200ms ease-out';
      body.style.paddingRight = `${panelWidth}px`;
    } else {
      body.style.transition = 'padding-right 200ms ease-out';
      body.style.paddingRight = '';
    }
    return () => {
      body.style.paddingRight = prevPadding;
      body.style.transition = prevTransition;
    };
  }, [isOpen, panelWidth, isResizing]);

  // Persist the user-chosen panel width across page loads.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('priceiq:chat-panel-width', String(panelWidth));
  }, [panelWidth]);

  // Drag-to-resize: pointermove updates panelWidth from the cursor X relative
  // to the right edge. Bounded between PANEL_MIN_PX and 70% of viewport.
  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: PointerEvent) => {
      const next = window.innerWidth - e.clientX;
      const max = Math.floor(window.innerWidth * PANEL_MAX_FRAC);
      const clamped = Math.min(max, Math.max(PANEL_MIN_PX, next));
      setPanelWidth(clamped);
    };
    const onUp = () => setIsResizing(false);

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isResizing]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    if (!proposalId) {
      setMessages((m) => [
        ...m,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Open a proposal first — the assistant needs a proposal to answer questions about.',
        },
      ]);
      return;
    }
    if (!organizationId) {
      setMessages((m) => [
        ...m,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'You need to be signed in to use the assistant.',
        },
      ]);
      return;
    }

    // Snapshot store state and serialize the full proposal context
    const state = usePricingStore.getState();
    const proposalContext = serializeProposalContext({
      proposalId: state.proposalId,
      proposalName: state.proposalName,
      solicitationNumber: state.solicitationNumber,
      primeContractorName: state.primeContractorName,
      dcaaContact: state.dcaaContact,
      totalYears: state.totalYears,
      baseYears: state.baseYears,
      optionYears: state.optionYears,
      monthsPerYear: state.monthsPerYear,
      extensions: state.extensions,
      surge: state.surge,
      positions: state.positions,
      subcontractors: state.subcontractors,
      travel: state.travel,
      odcs: state.odcs,
      rates: state.rates,
      escalationRates: state.escalationRates,
      positionsAdvanced: state.positionsAdvanced,
      aggregates: state.aggregates,
      advancedMode: state.advancedMode,
      subcontractorConfigured: state.subcontractorConfigured,
      activeTab: state.activeTab,
    });

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    const assistantMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      streaming: true,
      thinking: true, // show rotating quotes until first content delta
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
          proposal_context: proposalContext,
          session_id: sessionId,
          organization_id: organizationId,
        },
        controller.signal,
      )) {
        if (evt.type === 'analysis') {
          // Backend acknowledged the request — rotating quotes keep going.
          // (thinking is already true from send-click; no-op here, but logged
          // for observability when debugging streams.)
          continue;
        } else if (evt.type === 'delta') {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantMsg.id
                ? {
                    ...msg,
                    content: msg.content + evt.content,
                    thinking: false, // first real content → swap out the quotes
                  }
                : msg,
            ),
          );
        } else if (evt.type === 'done') {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantMsg.id
                ? {
                    ...msg,
                    content: evt.content || msg.content,
                    streaming: false,
                    thinking: false,
                  }
                : msg,
            ),
          );
        } else if (evt.type === 'tool.started') {
          // Route by tool name:
          //   think/analyze  -> reasoning steps (collapsible thoughts)
          //   everything else -> toolCalls list (pills, charts, artifacts)
          const toolName = evt.tool_name || 'tool';
          const isReasoning = REASONING_TOOL_NAMES.has(toolName);
          setMessages((m) =>
            m.map((msg) => {
              if (msg.id !== assistantMsg.id) return msg;
              const stepId =
                evt.tool_call_id ||
                `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              if (isReasoning) {
                const nextSteps: ReasoningStep[] = [
                  ...(msg.reasoning || []),
                  {
                    id: stepId,
                    name: toolName,
                    args: evt.tool_args,
                    running: true,
                  },
                ];
                return { ...msg, reasoning: nextSteps };
              }
              const nextCalls: ToolCallEntry[] = [
                ...(msg.toolCalls || []),
                { id: stepId, name: toolName, status: 'running', args: evt.tool_args },
              ];
              return { ...msg, toolCalls: nextCalls };
            }),
          );
        } else if (evt.type === 'tool.completed') {
          const toolName = evt.tool_name || 'tool';
          const isReasoning = REASONING_TOOL_NAMES.has(toolName);
          setMessages((m) =>
            m.map((msg) => {
              if (msg.id !== assistantMsg.id) return msg;
              if (isReasoning) {
                const steps = msg.reasoning || [];
                const idx = (() => {
                  if (evt.tool_call_id) {
                    const i = steps.findIndex((s) => s.id === evt.tool_call_id);
                    if (i >= 0) return i;
                  }
                  for (let i = steps.length - 1; i >= 0; i--)
                    if (steps[i].running) return i;
                  return -1;
                })();
                let next: ReasoningStep[];
                if (idx >= 0) {
                  next = steps.map((s, i) =>
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
                } else {
                  next = [
                    ...steps,
                    {
                      id:
                        evt.tool_call_id ||
                        `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      name: toolName,
                      args: evt.tool_args,
                      result: resultToStr(evt.result),
                      error: evt.error,
                      running: false,
                    },
                  ];
                }
                return { ...msg, reasoning: next };
              }

              // Non-reasoning tool — update the toolCalls entry by id (or
              // append if we missed the started event).
              const calls = msg.toolCalls || [];
              const idx = evt.tool_call_id
                ? calls.findIndex((c) => c.id === evt.tool_call_id)
                : -1;
              const status: ToolCallEntry['status'] = evt.error ? 'error' : 'completed';
              // Merge args: keep prior args from started, augment with completed.
              const mergedArgs =
                idx >= 0
                  ? { ...(calls[idx].args || {}), ...(evt.tool_args || {}) }
                  : evt.tool_args;
              const updated: ToolCallEntry = {
                id:
                  evt.tool_call_id ||
                  `call-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
        } else if (evt.type === 'error') {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantMsg.id
                ? {
                    ...msg,
                    content: `⚠️ ${evt.error}`,
                    streaming: false,
                    thinking: false,
                  }
                : msg,
            ),
          );
        }
      }
    } finally {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMsg.id ? { ...msg, streaming: false } : msg,
        ),
      );
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, proposalId, organizationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewSession = () => {
    if (abortRef.current) abortRef.current.abort();
    setSessionId(newSessionId(proposalId));
    setMessages([]);
    setIsStreaming(false);
  };

  return (
    <>
      {/* Floating trigger */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-blue-600 py-3 pl-3 pr-5 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 hover:shadow-xl"
          aria-label="Open Q — Pricing Assistant"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-[13px] font-bold leading-none">
            Q
          </span>
          Ask Q
        </button>
      )}

      {/* Side panel — no backdrop; user can freely interact with the rest of the app */}
      {isOpen && (
        <>
          <aside
            className="fixed bottom-0 right-0 top-0 z-50 flex flex-col border-l border-border bg-background shadow-2xl"
            style={{ width: `${panelWidth}px` }}
          >
            {/* Resize handle on the left edge — drag to make the panel wider */}
            <div
              role="separator"
              aria-label="Resize chat panel"
              aria-orientation="vertical"
              onPointerDown={(e) => {
                e.preventDefault();
                setIsResizing(true);
              }}
              onDoubleClick={() => setPanelWidth(PANEL_DEFAULT_PX)}
              className={`group absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-ew-resize select-none ${
                isResizing ? '' : ''
              }`}
            >
              <div
                className={`mx-auto h-full w-px transition-colors ${
                  isResizing
                    ? 'bg-blue-500'
                    : 'bg-transparent group-hover:bg-blue-500/50'
                }`}
              />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
                  <span className="font-bold text-sm tracking-tight">Q</span>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Q
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      · Pricing Assistant
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Ask anything about this proposal
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleNewSession}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Start new conversation"
                >
                  New chat
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4"
            >
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
                    <span className="text-xl font-bold tracking-tight">Q</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Ask Q about this proposal
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                      <li>"How many off-site positions and what's their total cost?"</li>
                      <li>"What's the FBLR for [Labor Category] in year 1?"</li>
                      <li>"How much are we spending with each subcontractor?"</li>
                      <li>"What's the grand total breakdown by year?"</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          // User messages stay as plain text (no markdown parsing)
                          <div className="whitespace-pre-wrap break-words">
                            {msg.content}
                          </div>
                        ) : (
                          // Assistant: reasoning (if any) above the content.
                          // Reasoning is shown in LIVE mode while no answer content
                          // has streamed yet; once the answer starts, it auto-
                          // collapses into a compact chip below (well, above) the
                          // answer so the user can still re-open it.
                          <div className="break-words">
                            {msg.reasoning && msg.reasoning.length > 0 && (
                              <ReasoningSteps
                                steps={msg.reasoning}
                                isStreaming={!msg.content}
                              />
                            )}
                            {/* Tool-call timeline (Kroolo-style):
                                - Vertical 1px line connecting consecutive rows
                                - The most recent running tool gets a shimmering title
                                - When all tools are done but no text yet, append a
                                  "Thinking" shimmer row so the user sees that we're
                                  waiting for the next tool call or the answer text. */}
                            {msg.toolCalls && msg.toolCalls.length > 0 && (() => {
                              const calls = msg.toolCalls;
                              const lastRunningIdx = (() => {
                                for (let i = calls.length - 1; i >= 0; i--) {
                                  if (calls[i].status === 'running') return i;
                                }
                                return -1;
                              })();
                              const allComplete = lastRunningIdx === -1;
                              const showThinkingTrailer =
                                msg.streaming && !msg.content && allComplete;
                              return (
                                <div className="my-2 rounded-xl border border-border bg-background/40 px-4 py-2 backdrop-blur-sm">
                                  {calls.map((tc, i) => {
                                    const isActive = Boolean(
                                      msg.streaming && i === lastRunningIdx,
                                    );
                                    const hasNextRow = Boolean(
                                      i < calls.length - 1 || showThinkingTrailer,
                                    );
                                    return (
                                      <ToolCallRender
                                        key={tc.id}
                                        call={tc}
                                        isActiveStreamingTool={isActive}
                                        showTimelineConnector={hasNextRow}
                                      />
                                    );
                                  })}
                                  {showThinkingTrailer && (
                                    <div className="relative flex items-start gap-3 py-1.5">
                                      <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                      </div>
                                      <div className="min-w-0 flex-1 pt-[2px]">
                                        <ShimmerText
                                          text="Thinking…"
                                          className="text-[13px] text-foreground"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            {/*
                              Show the rotating thinking indicator only before the
                              first reasoning step OR tool call arrives. Once any
                              tool activity exists, those views carry the
                              "something is happening" signal.
                            */}
                            {msg.thinking &&
                            !msg.content &&
                            (!msg.reasoning || msg.reasoning.length === 0) &&
                            (!msg.toolCalls || msg.toolCalls.length === 0) ? (
                              <ThinkingIndicator />
                            ) : (
                              <>
                                {msg.content ? (
                                  <MarkdownRenderer>{msg.content}</MarkdownRenderer>
                                ) : null}
                                {msg.streaming && msg.content && (
                                  <Loader2 className="ml-1 inline h-3 w-3 animate-spin opacity-60" />
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border bg-background px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    proposalId
                      ? 'Ask anything about this proposal…'
                      : 'Open a proposal first'
                  }
                  disabled={!proposalId || isStreaming}
                  rows={1}
                  className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  style={{
                    maxHeight: '120px',
                    minHeight: '38px',
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming || !proposalId}
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600"
                  aria-label="Send message"
                >
                  {isStreaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Q reads your current proposal state. Numbers match what you see on screen.
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
