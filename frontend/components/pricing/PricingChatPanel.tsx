'use client';

import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MessageCircle, X, Send, Loader2, Sparkles, Target, Clock, Maximize2, Trash2, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { useAuthStore } from '@/lib/stores/authStore';
import {
  streamPricingChat,
  streamPricingChatResume,
  listConversations,
  getConversationWithMessages,
  renameConversation,
  trashConversation,
  type ChatConversation,
  type ChatMessageRecord,
} from '@/lib/api/pricingChat';
import MarkdownRenderer from './chat/MarkdownRenderer';
import ThinkingIndicator from './chat/ThinkingIndicator';
import ReasoningSteps, { type ReasoningStep } from './chat/ReasoningSteps';
import ChartArtifact, { parseChartConfig } from './chat/ChartArtifact';
import ArtifactDownloadCard, {
  parseArtifactPayload,
} from './chat/ArtifactDownloadCard';
import ToolStatusPill, { type ToolPillSpec } from './chat/ToolStatusPill';
import ShimmerText from './chat/ShimmerText';
import SearchExaResults from './chat/SearchExaResults';

interface ToolCallEntry {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  args?: Record<string, unknown>;
  result?: unknown;
}

/**
 * Ordered render-block within an assistant message body. The agent streams
 * text deltas and tool calls in chronological order; we capture that order
 * here so artifacts (charts, download cards) appear at the position they
 * actually fired — interleaved with text — instead of bunched at the top.
 *
 * - `text` block: a contiguous run of streamed text deltas (mutated as more
 *   deltas arrive).
 * - `tool` block: a pointer to a ToolCallEntry; renders the artifact (chart /
 *   download card) once the tool completes and parses successfully.
 */
type MessageBlock =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tool'; id: string; toolCallId: string };

/** State saved when the agent emits run.paused (requires_confirmation). */
interface PausedRun {
  run_id: string;
  session_id?: string;
  /** Rationale text extracted from the pending tool's args (if any). */
  rationale?: string;
  /** The tool that needs approval (update_rates | update_positions). */
  tool_name?: string;
  /** Serialized args of the pending tool — shown in the approval card. */
  tool_args?: Record<string, unknown>;
  /** The message ID this pause belongs to — so we anchor the card inline. */
  message_id: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  thinking?: boolean; // true from send-click until first content delta
  reasoning?: ReasoningStep[]; // think/analyze tool calls, accumulated in order
  toolCalls?: ToolCallEntry[]; // python_repl, chart_tool, s3_upload, etc.
  /**
   * Ordered timeline of text + tool blocks that compose the body, captured
   * in the order events arrived from the stream. Used to interleave
   * chart/download artifacts with text in their actual fire order.
   */
  blocks?: MessageBlock[];
  /** Set when the agent paused mid-message for confirmation. */
  pausedRun?: PausedRun;
}

// Tool names the agent uses for reasoning. These render as collapsible
// reasoning steps; all other tool calls render as status pills / artifacts.
const REASONING_TOOL_NAMES = new Set(['think', 'analyze']);

// Tool names whose output renders inline as a body artifact (chart, file
// card, search results). These get a stream-block entry so they appear in
// chronological order with text, AND are hidden from the top timeline so
// the artifact isn't duplicated by a row.
const EXA_TOOL_NAMES = new Set([
  'exa',
  'search_exa',
  'exa_search',
  'web_search',
  'exa_answer',
  'get_contents_exa',
]);

const ARTIFACT_TOOL_NAMES = new Set([
  'chart_tool',
  's3_upload_tool',
  ...EXA_TOOL_NAMES,
]);

// Tool names hidden from the top timeline because their output renders as a
// dedicated body artifact (chart canvas, download card, search results list).
const TIMELINE_HIDDEN_TOOL_NAMES = new Set([
  'chart_tool',
  ...EXA_TOOL_NAMES,
]);

function newSessionId(proposalId: string | null): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return proposalId ? `chat-${proposalId}-${suffix}` : `ephemeral-${suffix}`;
}

/**
 * Format a timestamp into a sidebar-friendly relative label
 * ("just now", "12m", "3h", "Yesterday", "Mar 4"). Mirrors how Linear /
 * Notion show timestamps in their lists.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  if (hr < 48) return 'Yesterday';
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Convert persisted `ChatMessageRecord` rows from the backend back into the
 * panel's `ChatMessage[]` shape so a past chat re-renders identically to
 * when it originally streamed.
 *
 * Two messages per turn: one user, one assistant. The assistant carries
 * the full content + blocks + reasoning + toolCalls captured by
 * MessageTracker.
 */
function hydrateMessagesFromRecords(
  records: ChatMessageRecord[],
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const rec of records) {
    out.push({
      id: `hist-u-${rec.id}`,
      role: 'user',
      content: rec.user_query,
    });

    // Map persisted blocks → MessageBlock with fresh ids
    const blocks: MessageBlock[] = (rec.blocks || []).map((b, idx) => {
      if (b.kind === 'text') {
        return { kind: 'text', id: `hist-blk-${rec.id}-${idx}`, text: b.text };
      }
      return {
        kind: 'tool',
        id: `hist-blk-${rec.id}-${idx}`,
        toolCallId: b.tool_call_id || `hist-tc-${rec.id}-${idx}`,
      };
    });

    // Map tool_calls / reasoning back to the panel's local shape
    const toolCalls: ToolCallEntry[] = (rec.tool_calls || []).map((tc, idx) => ({
      id: tc.id || `hist-tc-${rec.id}-${idx}`,
      name: tc.name,
      status: tc.status,
      args: tc.args as Record<string, unknown> | undefined,
      result: tc.result,
    }));
    const reasoning: ReasoningStep[] = (rec.reasoning_steps || []).map((r, idx) => ({
      id: r.id || `hist-rs-${rec.id}-${idx}`,
      name: r.name,
      args:
        r.args && typeof r.args === 'object' && !Array.isArray(r.args)
          ? (r.args as Record<string, unknown>)
          : undefined,
      result: typeof r.result === 'string' ? r.result : resultToStr(r.result),
      error: r.error,
      running: r.running,
    }));

    // If the turn ended in a still-pending approval card, reconstruct it
    const pausedRun: PausedRun | undefined =
      rec.paused_run_id && rec.confirmed === null
        ? {
            run_id: rec.paused_run_id,
            tool_name: toolCalls.at(-1)?.name,
            tool_args: toolCalls.at(-1)?.args,
            rationale:
              typeof toolCalls.at(-1)?.args?.rationale === 'string'
                ? (toolCalls.at(-1)!.args!.rationale as string)
                : undefined,
            message_id: `hist-a-${rec.id}`,
          }
        : undefined;

    out.push({
      id: `hist-a-${rec.id}`,
      role: 'assistant',
      content: rec.content,
      blocks,
      toolCalls,
      reasoning,
      pausedRun,
      streaming: false,
      thinking: false,
    });
  }
  return out;
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

  // 5. web_search (Exa) — surface the query if we have it
  if (
    call.name === 'exa' ||
    call.name === 'search_exa' ||
    call.name === 'exa_search' ||
    call.name === 'web_search' ||
    call.name === 'exa_answer' ||
    call.name === 'get_contents_exa'
  ) {
    const query = typeof args.query === 'string' ? args.query : '';
    if (query) return verbing ? `Searching: ${query}` : `Searched: ${query}`;
    return verbing ? 'Searching the web' : 'Searched the web';
  }

  // 6. Generic
  const pretty = prettyToolName(call.name);
  return verbing ? `Running ${pretty}` : pretty;
}

/**
 * Render one tool-call timeline row. Compact — never includes the artifact.
 * Charts and download cards are rendered separately, in stream order, by
 * MessageBody (so a chart that fired BEFORE text appears above the text,
 * and a chart that fired AFTER appears below).
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

  // Extract stdout output for python_repl_tool
  let output: string | undefined;
  if (call.name === 'python_repl_tool' && call.status === 'completed' && call.result) {
    const r = call.result as Record<string, unknown>;
    const raw = typeof r.output === 'string' ? r.output.trim() : '';
    if (raw && raw !== '(no output)') output = raw;
  }

  const pill: ToolPillSpec = {
    id: call.id,
    name: call.name,
    status: call.status,
    title,
    output,
  };

  return (
    <ToolStatusPill
      tool={pill}
      isActiveStreamingTool={isActiveStreamingTool}
      showTimelineConnector={showTimelineConnector}
    />
  );
}

/**
 * One artifact block — memoized so the expensive `parseChartConfig` /
 * `parseArtifactPayload` (which use `new Function` to eval JS literals)
 * only run when the tool's result actually changes, not on every parent
 * re-render (e.g. text-delta tick).
 *
 * Without this memo, every text delta would re-parse the chart and pass
 * a new config object to ChartArtifact, forcing chart.js to rebuild the
 * canvas each frame.
 */
const ToolArtifactBlock = memo(function ToolArtifactBlock({
  call,
}: {
  call: ToolCallEntry;
}) {
  const config = useMemo(() => {
    if (call.name !== 'chart_tool' || call.status !== 'completed') return null;
    return parseChartConfig(call.result);
  }, [call.name, call.status, call.result]);

  const artifactPayload = useMemo(() => {
    if (call.name !== 's3_upload_tool' || call.status !== 'completed') return null;
    return parseArtifactPayload(call.result);
  }, [call.name, call.status, call.result]);

  // Exa web-search tool — render results inline as a clickable list of
  // links with favicons (Kroolo's SearchExaToolContent pattern).
  if (EXA_TOOL_NAMES.has(call.name)) {
    const args = call.args || {};
    const query =
      typeof args.query === 'string'
        ? args.query
        : Array.isArray(args.merged_queries)
          ? 'Web search'
          : '';
    return (
      <SearchExaResults
        query={query}
        isRunning={call.status !== 'completed'}
        result={call.result}
      />
    );
  }

  if (config) return <ChartArtifact config={config} />;
  if (artifactPayload) return <ArtifactDownloadCard payload={artifactPayload} />;
  return null;
});

/**
 * Stable wrapper around MessageBody — derives the toolCalls Map via
 * useMemo so a fresh Map isn't built on every text-delta render.
 */
function AssistantBody({ msg }: { msg: ChatMessage }) {
  const toolCallsById = useMemo(
    () => new Map((msg.toolCalls || []).map((c) => [c.id, c])),
    [msg.toolCalls],
  );
  return (
    <MessageBody
      blocks={msg.blocks}
      content={msg.content}
      toolCallsById={toolCallsById}
    />
  );
}

/**
 * Render the body of an assistant message — walks `blocks` in stream order
 * so text and artifacts (charts, download cards) appear interleaved exactly
 * as the agent emitted them. Falls back to a single MarkdownRenderer over
 * `content` if no blocks were captured (legacy / non-streaming path).
 */
function MessageBody({
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
        return <ToolArtifactBlock key={b.id} call={call} />;
      })}
    </>
  );
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
  const resumeAbortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // Ref mirror of messages so event handlers can read current state without
  // stale closures (React state reads inside async generators capture the
  // value at closure creation time, not the current value).
  const messagesRef = useRef<ChatMessage[]>([]);
  // Ref mirror of sessionId — lets handleSend always read the latest session
  // without capturing a stale closure (sessionId can change between the
  // open-chat event firing and the deferred handleSend executing).
  const sessionIdRef = useRef<string>(sessionId);
  // Active paused run waiting for user approval (at most one at a time).
  const [pausedRun, setPausedRun] = useState<PausedRun | null>(null);

  const proposalId = usePricingStore((s) => s.proposalId);
  const wageSource = usePricingStore((s) => s.wageSource);
  const user = useAuthStore((s) => s.user);
  const organizationId = user?.organization_id;
  // For GSA proposals: read gsa_current_year from the first GSA position —
  // it's already computed and stored per-position, so no extra fetch needed.
  const gsaCurrentYear = usePricingStore((s) => {
    if (s.wageSource?.type !== 'gsa') return undefined;
    const firstGSA = s.positions.find((p) => p.wage_source === 'gsa');
    return (firstGSA as unknown as { gsa_current_year?: number })?.gsa_current_year ?? undefined;
  });

  // ─── Chat history state ─────────────────────────────────────────
  // History dropdown (top-right of panel header). Lists past chats for THIS
  // proposal so the user can resume any of them in-place.
  const router = useRouter();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<ChatConversation[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // The conversation_id currently loaded into the panel (null = fresh, no
  // history association). Used so rename / trash know which row to mutate.
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const historyButtonRef = useRef<HTMLButtonElement | null>(null);
  const historyPopoverRef = useRef<HTMLDivElement | null>(null);

  // Keep messagesRef in sync so async event handlers can read current state.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input + start a fresh session every time the panel opens.
  // New session id => fresh agent-side conversation history, no bleed from
  // a previous open.
  //
  // Exception: if the URL has `?chat=<conversation_id>` (e.g. user clicked
  // "Continue in workspace" from the /q page), we skip the reset and let
  // the dedicated effect below hydrate the conversation instead.
  useEffect(() => {
    if (isOpen) {
      const urlChat =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('chat')
          : null;
      if (!urlChat) {
        setSessionId(newSessionId(proposalId));
        setMessages([]);
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, proposalId]);

  // Deep-link: workspace URL params trigger one of two panel auto-actions.
  //   ?chat=<conversation_id>  → open panel + hydrate that past chat
  //   ?new_chat=true           → open panel fresh (from /q's "+ New chat")
  // Runs once per mount; URL is cleaned after consumption so refresh doesn't
  // re-trigger.
  const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);
  useEffect(() => {
    if (deepLinkConsumed) return;
    if (!user?.id || !organizationId) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const urlChat = params.get('chat');
    const urlNewChat = params.get('new_chat');

    if (!urlChat && urlNewChat !== 'true') return;

    setDeepLinkConsumed(true);
    setIsOpen(true);

    const cleanUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('chat');
      url.searchParams.delete('new_chat');
      window.history.replaceState(null, '', url.toString());
    };

    if (urlChat) {
      // Hydrate the past conversation
      void (async () => {
        try {
          const { conversation } = await getConversationWithMessages(
            urlChat,
            user.id,
          );
          await handleLoadConversation(conversation);
          cleanUrl();
        } catch (err) {
          console.warn('[chat-panel] deep-link hydrate failed:', err);
          cleanUrl();
        }
      })();
    } else {
      // Fresh new chat — panel will reset session via the isOpen effect
      cleanUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, organizationId, deepLinkConsumed]);

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

  // External entry point: other components (e.g. PriceToWinCard) can dispatch
  // a `priceiq:open-chat` CustomEvent with `{ prompt: string, autoSend: bool }`
  // to open the chat panel and either populate the input or auto-send.
  useEffect(() => {
    type OpenChatDetail = { prompt?: string; autoSend?: boolean };
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenChatDetail>).detail || {};
      setIsOpen(true);
      if (typeof detail.prompt === 'string' && detail.prompt.trim()) {
        if (detail.autoSend) {
          // Defer the send by one tick so isOpen state has time to apply
          // (sessionId regen + message reset run inside the isOpen effect).
          setTimeout(() => handleSendRef.current?.(detail.prompt as string), 80);
        } else {
          setInput(detail.prompt);
          setTimeout(() => inputRef.current?.focus(), 80);
        }
      }
    };
    window.addEventListener('priceiq:open-chat', onOpen as EventListener);
    return () => window.removeEventListener('priceiq:open-chat', onOpen as EventListener);
  }, []);

  // Ref to the latest handleSend so the open-chat event listener can call it
  // without re-binding (handleSend's identity changes on every input edit).
  const handleSendRef = useRef<((text?: string) => Promise<void>) | null>(null);

  const handleSend = useCallback(async (overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim();
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

    // Flush any pending auto-save before opening the SSE so the backend
    // builds context from fresh MongoDB data, not the 2s-stale snapshot.
    // Silent — the assistant's "thinking" indicator already covers the wait.
    const preState = usePricingStore.getState();
    if (preState.isDirty && preState.proposalId) {
      try {
        await preState.saveProposal();
      } catch (err) {
        console.warn('[pricing-chat] pre-send save failed (continuing):', err);
      }
    }
    if (!user?.id) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMsg.id
            ? { ...msg, content: '⚠️ Sign-in required.', streaming: false, thinking: false }
            : msg,
        ),
      );
      setIsStreaming(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const evt of streamPricingChat(
        {
          query: trimmed,
          session_id: sessionIdRef.current,
          organization_id: organizationId,
          proposal_id: proposalId,
          user_id: user.id,
          role: user.role,
          proposal_type: wageSource?.type,
          gsa_file_id: wageSource?.type === 'gsa' ? wageSource.file_id : undefined,
          gsa_current_year: gsaCurrentYear,
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
            m.map((msg) => {
              if (msg.id !== assistantMsg.id) return msg;
              // Append to the trailing text block in stream order. If the
              // last block is text, extend it; otherwise open a new one.
              const blocks = msg.blocks ? [...msg.blocks] : [];
              const last = blocks[blocks.length - 1];
              if (last && last.kind === 'text') {
                blocks[blocks.length - 1] = {
                  ...last,
                  text: last.text + evt.content,
                };
              } else {
                blocks.push({
                  kind: 'text',
                  id: `txt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  text: evt.content,
                });
              }
              return {
                ...msg,
                content: msg.content + evt.content,
                blocks,
                thinking: false, // first real content → swap out the quotes
              };
            }),
          );
        } else if (evt.type === 'done') {
          setMessages((m) =>
            m.map((msg) => {
              if (msg.id !== assistantMsg.id) return msg;
              // If `done` carries final content but we have no blocks yet
              // (no deltas were sent), seed a single text block. Otherwise
              // leave the existing block stream intact.
              const finalContent = evt.content || msg.content;
              const blocks =
                msg.blocks && msg.blocks.length > 0
                  ? msg.blocks
                  : finalContent
                    ? [
                        {
                          kind: 'text' as const,
                          id: `txt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          text: finalContent,
                        },
                      ]
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
              // Only tool calls that produce a visible body artifact get a
              // block in the stream (so the body interleaves correctly).
              // Code-only / skill tools just live in the timeline at top.
              const nextBlocks: MessageBlock[] | undefined =
                ARTIFACT_TOOL_NAMES.has(toolName)
                  ? [
                      ...(msg.blocks || []),
                      { kind: 'tool', id: `blk-${stepId}`, toolCallId: stepId },
                    ]
                  : msg.blocks;
              return { ...msg, toolCalls: nextCalls, blocks: nextBlocks };
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
        } else if (evt.type === 'run.paused') {
          // Agent hit a requires_confirmation gate. Extract the pending tool
          // info from the last running tool call in this message.
          // Read the last running tool call directly from the captured
          // assistantMsg closure — it's the most recently started tool.
          // We snapshot toolCalls at the time run.paused fires; the
          // mutation tool (update_rates/update_positions) is always the
          // last entry because requires_confirmation pauses before executing.
          const lastToolCall = messagesRef.current
            .find((x) => x.id === assistantMsg.id)
            ?.toolCalls?.filter((c) => c.status === 'running')
            .at(-1);
          const paused: PausedRun = {
            run_id: evt.run_id,
            session_id: evt.session_id,
            tool_name: lastToolCall?.name,
            tool_args: lastToolCall?.args,
            rationale: typeof lastToolCall?.args?.rationale === 'string'
              ? lastToolCall.args.rationale
              : undefined,
            message_id: assistantMsg.id,
          };
          setPausedRun(paused);
          // Stamp the paused run onto the message so the card renders inline.
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantMsg.id
                ? { ...msg, streaming: false, thinking: false, pausedRun: paused }
                : msg,
            ),
          );
          // Stop the stream — user must approve/reject via handleResume.
          break;
        } else if (evt.type === 'run.continued') {
          // Resume confirmed and streaming — clear the paused state.
          setPausedRun(null);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantMsg.id ? { ...msg, pausedRun: undefined } : msg,
            ),
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

  // Keep the latest handleSend reachable from the open-chat event listener.
  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const handleResume = useCallback(async (confirmed: boolean, note?: string) => {
    if (!pausedRun || !organizationId || !proposalId || !user?.id) return;

    const pr = pausedRun;
    setPausedRun(null);
    setIsStreaming(true);

    // Find the paused message and re-open it for streaming continuation.
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
          user_id: user.id,
          role: user.role,
          proposal_type: wageSource?.type,
          gsa_file_id: wageSource?.type === 'gsa' ? wageSource.file_id : undefined,
          gsa_current_year: gsaCurrentYear,
        },
        controller.signal,
      )) {
        if (evt.type === 'run.continued') {
          // Stream is live — nothing to do here.
        } else if (evt.type === 'delta') {
          setMessages((m) =>
            m.map((msg) => {
              if (msg.id !== pr.message_id) return msg;
              const blocks = msg.blocks ? [...msg.blocks] : [];
              const last = blocks[blocks.length - 1];
              if (last && last.kind === 'text') {
                blocks[blocks.length - 1] = { ...last, text: last.text + evt.content };
              } else {
                blocks.push({ kind: 'text', id: `txt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: evt.content });
              }
              return { ...msg, content: msg.content + evt.content, blocks };
            }),
          );
        } else if (evt.type === 'done') {
          setMessages((m) =>
            m.map((msg) => {
              if (msg.id !== pr.message_id) return msg;
              const finalContent = evt.content || msg.content;
              const blocks = msg.blocks && msg.blocks.length > 0
                ? msg.blocks
                : finalContent
                  ? [{ kind: 'text' as const, id: `txt-${Date.now()}`, text: finalContent }]
                  : [];
              return { ...msg, content: finalContent, blocks, streaming: false, thinking: false };
            }),
          );
        } else if (evt.type === 'tool.started') {
          const toolName = evt.tool_name || 'tool';
          const isReasoning = REASONING_TOOL_NAMES.has(toolName);
          setMessages((m) =>
            m.map((msg) => {
              if (msg.id !== pr.message_id) return msg;
              const stepId = evt.tool_call_id || `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              if (isReasoning) {
                return { ...msg, reasoning: [...(msg.reasoning || []), { id: stepId, name: toolName, args: evt.tool_args, running: true }] };
              }
              const nextCalls = [...(msg.toolCalls || []), { id: stepId, name: toolName, status: 'running' as const, args: evt.tool_args }];
              const nextBlocks = ARTIFACT_TOOL_NAMES.has(toolName)
                ? [...(msg.blocks || []), { kind: 'tool' as const, id: `blk-${stepId}`, toolCallId: stepId }]
                : msg.blocks;
              return { ...msg, toolCalls: nextCalls, blocks: nextBlocks };
            }),
          );
        } else if (evt.type === 'tool.completed') {
          const toolName = evt.tool_name || 'tool';
          const isReasoning = REASONING_TOOL_NAMES.has(toolName);
          setMessages((m) =>
            m.map((msg) => {
              if (msg.id !== pr.message_id) return msg;
              if (isReasoning) {
                const steps = msg.reasoning || [];
                const idx = evt.tool_call_id ? steps.findIndex((s) => s.id === evt.tool_call_id) : steps.length - 1;
                const next = idx >= 0
                  ? steps.map((s, i) => i === idx ? { ...s, args: evt.tool_args ?? s.args, result: resultToStr(evt.result), error: evt.error, running: false } : s)
                  : [...steps, { id: evt.tool_call_id || `step-${Date.now()}`, name: toolName, args: evt.tool_args, result: resultToStr(evt.result), running: false }];
                return { ...msg, reasoning: next };
              }
              const calls = msg.toolCalls || [];
              const idx = evt.tool_call_id ? calls.findIndex((c) => c.id === evt.tool_call_id) : -1;
              const updated: ToolCallEntry = { id: evt.tool_call_id || `call-${Date.now()}`, name: toolName, status: evt.error ? 'error' : 'completed', args: idx >= 0 ? { ...(calls[idx].args || {}), ...(evt.tool_args || {}) } : evt.tool_args, result: evt.result };
              return { ...msg, toolCalls: idx >= 0 ? calls.map((c, i) => i === idx ? { ...c, ...updated } : c) : [...calls, updated] };
            }),
          );
        } else if (evt.type === 'run.paused') {
          // Re-paused (chained confirmations) — re-show the card.
          const paused: PausedRun = { run_id: evt.run_id, session_id: evt.session_id, message_id: pr.message_id };
          setPausedRun(paused);
          setMessages((m) => m.map((msg) => msg.id === pr.message_id ? { ...msg, streaming: false, pausedRun: paused } : msg));
          break;
        } else if (evt.type === 'error') {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === pr.message_id
                ? { ...msg, content: msg.content + `\n\n⚠️ ${evt.error}`, streaming: false }
                : msg,
            ),
          );
        }
      }
    } finally {
      setMessages((m) =>
        m.map((msg) => msg.id === pr.message_id ? { ...msg, streaming: false } : msg),
      );
      setIsStreaming(false);
      resumeAbortRef.current = null;
    }
  }, [pausedRun, organizationId, proposalId, user, wageSource, gsaCurrentYear]);

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
    setActiveConversationId(null);
  };

  // ─── History dropdown handlers ─────────────────────────────────

  /** Fetch the most recent chats for the current proposal + user. */
  const refreshHistory = useCallback(async () => {
    if (!user?.id || !organizationId) return;
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      const items = await listConversations({
        user_id: user.id,
        organization_id: organizationId,
        proposal_id: proposalId ?? undefined,
        status: 'active',
        limit: 20,
      });
      setHistoryItems(items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setHistoryError(msg);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [user?.id, organizationId, proposalId]);

  /** Refresh history every time the dropdown opens (cheap, ~50ms). */
  useEffect(() => {
    if (isHistoryOpen) {
      void refreshHistory();
    }
  }, [isHistoryOpen, refreshHistory]);

  /** Close the dropdown when clicking outside it. */
  useEffect(() => {
    if (!isHistoryOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        historyButtonRef.current?.contains(target) ||
        historyPopoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsHistoryOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isHistoryOpen]);

  /**
   * Load a past conversation into the panel. Aborts any in-flight stream,
   * fetches the messages, hydrates them, and switches the local session_id
   * to the conversation's session_id so any new messages append to the same
   * agno thread.
   */
  const handleLoadConversation = useCallback(
    async (conv: ChatConversation) => {
      if (!user?.id) return;
      if (abortRef.current) abortRef.current.abort();
      setIsHistoryOpen(false);
      setIsStreaming(true); // brief loading state
      setHistoryError(null);
      try {
        const { messages: records } = await getConversationWithMessages(
          conv.id,
          user.id,
        );
        const hydrated = hydrateMessagesFromRecords(records);
        setMessages(hydrated);
        setSessionId(conv.session_id);
        setActiveConversationId(conv.id);
        // If the most recent assistant turn ended with an unresolved pause,
        // restore the paused-run state so the approval card re-renders.
        const lastAssistant = [...hydrated]
          .reverse()
          .find((m) => m.role === 'assistant');
        if (lastAssistant?.pausedRun) {
          setPausedRun(lastAssistant.pausedRun);
        } else {
          setPausedRun(null);
        }
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 50);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setHistoryError(`Failed to load chat: ${msg}`);
      } finally {
        setIsStreaming(false);
      }
    },
    [user?.id],
  );

  /** Inline rename — uses window.prompt for v1; can swap to inline editor later. */
  const handleRenameConversation = useCallback(
    async (conv: ChatConversation) => {
      if (!user?.id) return;
      const next = window.prompt('Rename chat:', conv.chat_name);
      if (!next || !next.trim() || next.trim() === conv.chat_name) return;
      try {
        const updated = await renameConversation(conv.id, user.id, next.trim());
        setHistoryItems((items) =>
          items.map((it) => (it.id === conv.id ? { ...it, chat_name: updated.chat_name } : it)),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setHistoryError(`Rename failed: ${msg}`);
      }
    },
    [user?.id],
  );

  /** Soft-delete — drops from sidebar; if it's the currently-loaded chat, also starts fresh. */
  const handleTrashConversation = useCallback(
    async (conv: ChatConversation) => {
      if (!user?.id) return;
      if (!window.confirm(`Delete "${conv.chat_name}"?`)) return;
      try {
        await trashConversation(conv.id, user.id);
        setHistoryItems((items) => items.filter((it) => it.id !== conv.id));
        if (activeConversationId === conv.id) {
          handleNewSession();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setHistoryError(`Delete failed: ${msg}`);
      }
    },
    [user?.id, activeConversationId],
  );

  /** Open the dedicated /q page, carrying the current session for continuity. */
  const handleExpandToFullscreen = useCallback(() => {
    const params = new URLSearchParams();
    if (activeConversationId) {
      params.set('conversation', activeConversationId);
    } else if (sessionIdRef.current) {
      params.set('session', sessionIdRef.current);
    }
    if (proposalId) params.set('proposal_id', proposalId);
    const qs = params.toString();
    router.push(qs ? `/q?${qs}` : '/q');
  }, [router, activeConversationId, proposalId]);

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
              <div className="relative flex items-center gap-1">
                <button
                  ref={historyButtonRef}
                  onClick={() => setIsHistoryOpen((v) => !v)}
                  className={`rounded-md p-1.5 ${
                    isHistoryOpen
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  aria-label="Chat history"
                  title="Past conversations"
                >
                  <Clock className="h-4 w-4" />
                </button>
                <button
                  onClick={handleNewSession}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Start new conversation"
                >
                  New chat
                </button>
                <button
                  onClick={handleExpandToFullscreen}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Open in fullscreen"
                  title="Open in fullscreen"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* History dropdown popover */}
                {isHistoryOpen && (
                  <div
                    ref={historyPopoverRef}
                    className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
                  >
                    <div className="border-b border-border px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {proposalId ? 'Chats about this proposal' : 'Recent chats'}
                        </span>
                        <button
                          onClick={() => {
                            setIsHistoryOpen(false);
                            handleExpandToFullscreen();
                          }}
                          className="text-[11px] text-blue-600 hover:underline"
                        >
                          View all
                        </button>
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      {isHistoryLoading ? (
                        <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading…
                        </div>
                      ) : historyError ? (
                        <div className="px-3 py-4 text-xs text-red-600">
                          {historyError}
                        </div>
                      ) : historyItems.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                          No past chats yet.
                          <div className="mt-1 text-[11px]">
                            Send your first message to start one.
                          </div>
                        </div>
                      ) : (
                        <ul className="py-1">
                          {historyItems.map((conv) => {
                            const isActive = activeConversationId === conv.id;
                            return (
                              <li key={conv.id}>
                                <div
                                  className={`group flex w-full items-start gap-2 px-3 py-2 ${
                                    isActive
                                      ? 'bg-muted/70'
                                      : 'hover:bg-muted/50'
                                  }`}
                                >
                                  <button
                                    onClick={() => void handleLoadConversation(conv)}
                                    className="flex-1 text-left"
                                  >
                                    <div className="truncate text-sm font-medium text-foreground">
                                      {conv.chat_name}
                                    </div>
                                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                      <span>{relativeTime(conv.updated_at)}</span>
                                      <span>·</span>
                                      <span>{conv.message_count} msg{conv.message_count === 1 ? '' : 's'}</span>
                                    </div>
                                    {conv.last_message_preview && (
                                      <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/80">
                                        {conv.last_message_preview}
                                      </div>
                                    )}
                                  </button>
                                  <div className="flex flex-col items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleRenameConversation(conv);
                                      }}
                                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                      title="Rename"
                                      aria-label="Rename chat"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleTrashConversation(conv);
                                      }}
                                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600"
                                      title="Delete"
                                      aria-label="Delete chat"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4"
            >
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
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
                  <EmptyStateQuickActions
                    onAskPriceToWin={() => {
                      const ev = new CustomEvent('priceiq:open-chat', {
                        detail: {
                          prompt: buildPriceToWinPrompt(),
                          autoSend: hasPriceToWinSet(),
                        },
                      });
                      window.dispatchEvent(ev);
                    }}
                  />
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
                        className={
                          // User messages stay as a right-aligned chat bubble
                          // (limited width). Assistant responses span the full
                          // panel width so charts, tables, and code can use
                          // all the available space (Kroolo pattern).
                          msg.role === 'user'
                            ? 'max-w-[85%] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white'
                            : 'w-full text-sm text-foreground'
                        }
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
                              // Hide tools whose output is already shown as a
                              // body artifact (chart_tool, exa search) — a
                              // duplicate row in the timeline is just noise.
                              const calls = msg.toolCalls.filter(
                                (c) => !TIMELINE_HIDDEN_TOOL_NAMES.has(c.name),
                              );
                              const lastRunningIdx = (() => {
                                for (let i = calls.length - 1; i >= 0; i--) {
                                  if (calls[i].status === 'running') return i;
                                }
                                return -1;
                              })();
                              const allComplete = lastRunningIdx === -1;
                              const showThinkingTrailer =
                                msg.streaming && !msg.content && allComplete;
                              if (calls.length === 0 && !showThinkingTrailer) {
                                return null;
                              }
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
                                <AssistantBody msg={msg} />
                                {msg.streaming && msg.content && (
                                  <Loader2 className="ml-1 inline h-3 w-3 animate-spin opacity-60" />
                                )}
                                {msg.pausedRun && (
                                  <ToolApprovalCard
                                    paused={msg.pausedRun}
                                    onApprove={() => handleResume(true)}
                                    onReject={() => handleResume(false)}
                                    isResuming={isStreaming && !pausedRun}
                                  />
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
            <div className="w-full border-t border-border bg-background px-4 py-3">
              <div className="flex w-full items-end gap-2">
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
                  // min-w-0 + w-full overrides the textarea's implicit min-width
                  // (browser default is ~cols×em) so flex-1 can actually grow
                  // and shrink with the resizable panel.
                  className="min-w-0 w-full flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  style={{
                    maxHeight: '120px',
                    minHeight: '38px',
                  }}
                />
                <button
                  onClick={() => handleSend()}
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

// ─── Helpers shared across the panel ────────────────────────────────────

const formatCurrency = (n: number) =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;

const formatCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return formatCurrency(n);
};

/**
 * Read live store snapshot to decide whether the user has already set a PtW
 * target. Used by the empty-state quick action to choose between auto-send
 * (target set) and prompt-population (no target yet).
 */
function hasPriceToWinSet(): boolean {
  const s = usePricingStore.getState();
  return typeof s.priceToWin === 'number' && s.priceToWin > 0;
}

/**
 * Build the prompt the chat agent receives when the user clicks "Analyze
 * for price-to-win" from the empty state. If a target is already set,
 * frame the gap explicitly. Otherwise leave a prompt for the user to fill in.
 */
function buildPriceToWinPrompt(): string {
  const s = usePricingStore.getState();
  const totals = s.aggregates;
  // Use the same fee-inclusive grand total the OverviewTab shows.
  const current =
    (totals?.totalFBLR ?? 0) +
    (totals?.totalOT ?? 0);
  const target = typeof s.priceToWin === 'number' ? s.priceToWin : null;

  if (target && current > 0) {
    const gap = current - target;
    const gapPct = (gap / current) * 100;
    if (gap > 0) {
      return (
        `Our price-to-win target is ${formatCurrency(target)}, but the proposal currently lands at ${formatCompact(current)} — ` +
        `a ${formatCompact(gap)} gap (${gapPct.toFixed(1)}%). Run a full PtW analysis: identify the top 5–7 levers to close ` +
        `the gap, with $$ impact and risk for each.`
      );
    }
    return (
      `Our price-to-win target is ${formatCurrency(target)} and we're at ${formatCompact(current)} — ` +
      `already ${formatCompact(-gap)} under target. Walk through how we could improve margin given the ` +
      `current proposal structure.`
    );
  }
  return `My price-to-win target is $___. Analyze the proposal and tell me how to close the gap.`;
}

// ─── Tool Approval Card ──────────────────────────────────────────────────────

function formatToolLabel(name?: string): string {
  if (!name) return 'Pending change';
  if (name === 'update_rates') return 'Update rates';
  if (name === 'update_positions') return 'Update positions';
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ToolApprovalCard({
  paused,
  onApprove,
  onReject,
  isResuming,
}: {
  paused: PausedRun;
  onApprove: () => void;
  onReject: () => void;
  isResuming: boolean;
}) {
  const args = paused.tool_args || {};
  const rationale = paused.rationale || (typeof args.rationale === 'string' ? args.rationale : '');

  return (
    <div className="my-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 text-base">
          ✦
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {formatToolLabel(paused.tool_name)} — approval required
          </p>
          {rationale && (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{rationale}</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onApprove}
          disabled={isResuming}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {isResuming ? 'Applying…' : 'Approve'}
        </button>
        <button
          onClick={onReject}
          disabled={isResuming}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

interface EmptyStateQuickActionsProps {
  onAskPriceToWin: () => void;
}

const EmptyStateQuickActions = ({ onAskPriceToWin }: EmptyStateQuickActionsProps) => (
  <div className="w-full max-w-sm">
    <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      Quick actions
    </div>
    <button
      type="button"
      onClick={onAskPriceToWin}
      className="group flex w-full items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 py-2.5 text-left text-sm text-foreground transition-[transform,background-color] duration-160 ease-out hover:bg-muted active:scale-[0.97]"
    >
      <Target className="h-4 w-4 shrink-0 text-blue-600" />
      <span className="flex-1 truncate">Analyze for price-to-win</span>
      <span className="text-muted-foreground transition-transform duration-200 ease-out group-hover:translate-x-0.5">
        →
      </span>
    </button>
  </div>
);
