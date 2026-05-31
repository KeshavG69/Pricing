/**
 * Streaming client for /api/pricing-chat/ask.
 *
 * The backend builds the proposal-state context server-side from MongoDB
 * (see backend/utils/proposal_context_builder.py). Callers only need to send
 * `proposal_id` + identity; no large JSON payload over the wire.
 *
 * IMPORTANT: callers should flush any pending auto-save before invoking
 * `streamPricingChat` so the agent reads fresh data, not stale-by-2s data.
 */

export interface PricingChatRequest {
  query: string;
  session_id: string;
  organization_id: string;
  // proposal_id + user_id are required server-side — typed as required here
  // so the TS compiler catches missing values at the call site.
  proposal_id: string;
  user_id: string;
  role?: string;
  proposal_type?: 'bls' | 'gsa';
  gsa_file_id?: string;
  gsa_current_year?: number;
}

export interface PricingChatResumeRequest {
  run_id: string;
  session_id: string;
  organization_id: string;
  confirmed: boolean;
  confirmation_note?: string;
  proposal_id: string;
  user_id: string;
  role?: string;
  proposal_type?: 'bls' | 'gsa';
  gsa_file_id?: string;
  gsa_current_year?: number;
}

export type PricingChatEvent =
  | { type: 'analysis' }
  | { type: 'delta'; content: string }
  | { type: 'done'; content?: string }
  | { type: 'error'; error: string }
  | { type: 'run.started'; run_id: string }
  | { type: 'run.continued'; run_id: string }
  | { type: 'run.cancelled'; run_id?: string }
  | {
      type: 'run.paused';
      run_id: string;
      session_id?: string;
      requirements?: unknown[];
    }
  | {
      type: 'tool.started';
      tool_name: string;
      tool_args?: Record<string, unknown>;
      tool_call_id?: string;
    }
  | {
      type: 'tool.completed';
      tool_name: string;
      tool_args?: Record<string, unknown>;
      result?: unknown;
      error?: unknown;
      tool_call_id?: string;
    };

export interface PricingChatCancelRequest {
  run_id: string;
  session_id: string;
  organization_id: string;
  proposal_id: string;
  user_id: string;
  role?: string;
}

/**
 * Cancel an in-flight pricing-agent run. Fire-and-forget pattern is fine —
 * the SSE stream from /ask will emit a `run.cancelled` event on success, OR
 * the client-side AbortController will close the connection a beat later.
 * Returns the backend's `{cancelled, run_id}` ack; callers can ignore it.
 */
export async function cancelPricingRun(
  req: PricingChatCancelRequest,
): Promise<{ cancelled: boolean; run_id: string }> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const res = await fetch(`${apiBase}/api/pricing-chat/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    // No AbortSignal — we want the cancel request itself to land even if
    // the caller is racing to abort the streaming fetch.
  });
  if (!res.ok) {
    return { cancelled: false, run_id: req.run_id };
  }
  try {
    return await res.json();
  } catch {
    return { cancelled: false, run_id: req.run_id };
  }
}

export async function* streamPricingChat(
  req: PricingChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<PricingChatEvent> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const res = await fetch(`${apiBase}/api/pricing-chat/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {
      /* ignore */
    }
    yield { type: 'error', error: detail };
    return;
  }

  if (!res.body) {
    yield { type: 'error', error: 'No response body' };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Parse SSE frames (separated by blank line)
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const parsed = parseSSEFrame(frame);
        if (!parsed) continue;

        const data = parsed.data || {};
        const content = typeof data.content === 'string' ? data.content : undefined;
        const errText = typeof data.error === 'string' ? data.error : undefined;
        const toolName = typeof data.tool_name === 'string' ? data.tool_name : '';
        const toolCallId = typeof data.tool_call_id === 'string' ? data.tool_call_id : undefined;
        const toolArgs =
          data.tool_args && typeof data.tool_args === 'object' && !Array.isArray(data.tool_args)
            ? (data.tool_args as Record<string, unknown>)
            : undefined;

        if (parsed.event === 'analysis') {
          yield { type: 'analysis' };
        } else if (parsed.event === 'message.delta' && content) {
          yield { type: 'delta', content };
        } else if (parsed.event === 'message.completed') {
          yield { type: 'done', content };
        } else if (parsed.event === 'run.started') {
          // Surface the run_id so the panel can capture it for /cancel.
          yield {
            type: 'run.started',
            run_id: typeof data.run_id === 'string' ? data.run_id : '',
          };
        } else if (parsed.event === 'run.cancelled') {
          // Backend confirmed cancellation via agno's RunEvent.run_cancelled.
          yield {
            type: 'run.cancelled',
            run_id: typeof data.run_id === 'string' ? data.run_id : undefined,
          };
        } else if (parsed.event === 'run.paused') {
          yield {
            type: 'run.paused',
            run_id: typeof data.run_id === 'string' ? data.run_id : '',
            session_id: typeof data.session_id === 'string' ? data.session_id : undefined,
            requirements: Array.isArray(data.requirements) ? data.requirements : undefined,
          };
        } else if (parsed.event === 'run.continued') {
          yield {
            type: 'run.continued',
            run_id: typeof data.run_id === 'string' ? data.run_id : '',
          };
        } else if (parsed.event === 'tool.started') {
          yield {
            type: 'tool.started',
            tool_name: toolName,
            tool_args: toolArgs,
            tool_call_id: toolCallId,
          };
        } else if (parsed.event === 'tool.completed') {
          yield {
            type: 'tool.completed',
            tool_name: toolName,
            tool_args: toolArgs,
            result: data.result,
            error: data.error,
            tool_call_id: toolCallId,
          };
        } else if (parsed.event === 'error') {
          yield { type: 'error', error: errText || 'Unknown error' };
        }
        // Ignored: run.completed / usage / compression.* / agent.event
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // User-aborted cancellation is normal; swallow it
    if (msg.includes('abort')) return;
    yield { type: 'error', error: msg };
  } finally {
    reader.releaseLock();
  }
}

export async function* streamPricingChatResume(
  req: PricingChatResumeRequest,
  signal?: AbortSignal,
): AsyncGenerator<PricingChatEvent> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const res = await fetch(`${apiBase}/api/pricing-chat/resume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch { /* ignore */ }
    yield { type: 'error', error: detail };
    return;
  }

  if (!res.body) {
    yield { type: 'error', error: 'No response body' };
    return;
  }

  // Reuse the same SSE parsing loop as streamPricingChat
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const parsed = parseSSEFrame(frame);
        if (!parsed) continue;
        const data = parsed.data || {};
        const content = typeof data.content === 'string' ? data.content : undefined;
        const errText = typeof data.error === 'string' ? data.error : undefined;
        const toolName = typeof data.tool_name === 'string' ? data.tool_name : '';
        const toolCallId = typeof data.tool_call_id === 'string' ? data.tool_call_id : undefined;
        const toolArgs =
          data.tool_args && typeof data.tool_args === 'object' && !Array.isArray(data.tool_args)
            ? (data.tool_args as Record<string, unknown>)
            : undefined;

        if (parsed.event === 'run.continued') {
          yield { type: 'run.continued', run_id: typeof data.run_id === 'string' ? data.run_id : '' };
        } else if (parsed.event === 'run.cancelled') {
          yield {
            type: 'run.cancelled',
            run_id: typeof data.run_id === 'string' ? data.run_id : undefined,
          };
        } else if (parsed.event === 'message.delta' && content) {
          yield { type: 'delta', content };
        } else if (parsed.event === 'message.completed') {
          yield { type: 'done', content };
        } else if (parsed.event === 'run.paused') {
          yield {
            type: 'run.paused',
            run_id: typeof data.run_id === 'string' ? data.run_id : '',
            session_id: typeof data.session_id === 'string' ? data.session_id : undefined,
            requirements: Array.isArray(data.requirements) ? data.requirements : undefined,
          };
        } else if (parsed.event === 'tool.started') {
          yield { type: 'tool.started', tool_name: toolName, tool_args: toolArgs, tool_call_id: toolCallId };
        } else if (parsed.event === 'tool.completed') {
          yield { type: 'tool.completed', tool_name: toolName, tool_args: toolArgs, result: data.result, error: data.error, tool_call_id: toolCallId };
        } else if (parsed.event === 'error') {
          yield { type: 'error', error: errText || 'Unknown error' };
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort')) return;
    yield { type: 'error', error: msg };
  } finally {
    reader.releaseLock();
  }
}

function parseSSEFrame(
  frame: string,
): { event?: string; data?: Record<string, unknown> } | null {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) return { event };
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return { event, data: { raw: dataLines.join('\n') } };
  }
}

// ─── Chat history (non-streaming CRUD) ──────────────────────────────
//
// Backend lives in routers/pricing_chat.py under /api/pricing-chat/conversations.
// Two collections (chat_conversations + chat_messages) — see backend docs.
// Uses the shared axios client so auth headers / token refresh / org cookies
// are handled by the existing interceptors.

import { apiClient } from './client';

/** A row in the sidebar's "past chats" list (already hydrated with counts). */
export interface ChatConversation {
  id: string;
  session_id: string;
  chat_name: string;
  user_id: string;
  organization_id: string;
  proposal_id: string;
  proposal_name: string | null;
  status: 'active' | 'deleted';
  created_at: string;
  updated_at: string;
  /** Total messages (turns) in this conversation. */
  message_count: number;
  /** First ~120 chars of the last assistant reply, for sidebar preview. */
  last_message_preview: string | null;
}

/**
 * A persisted message turn. The shape mirrors what the panel renders so
 * re-loading a past chat lights up the UI without translation.
 */
export interface ChatMessageRecord {
  id: string;
  conversation_id: string;
  user_query: string;
  content: string;
  blocks: Array<
    | { kind: 'text'; text: string }
    | { kind: 'tool'; tool_call_id?: string }
  >;
  tool_calls: Array<{
    id?: string;
    name: string;
    args?: Record<string, unknown>;
    result?: unknown;
    status: 'running' | 'completed' | 'error';
    error?: unknown;
  }>;
  reasoning_steps: Array<{
    id?: string;
    name: string;
    args?: unknown;
    result?: unknown;
    error?: unknown;
    running: boolean;
  }>;
  paused_run_id: string | null;
  confirmed: boolean | null;
  streaming_error: boolean;
  is_liked: boolean;
  is_disliked: boolean;
  is_flagged: boolean;
  created_at: string;
}

export interface ListConversationsParams {
  user_id: string;
  organization_id: string;
  /** Filter to chats about one proposal (omit for all). */
  proposal_id?: string;
  /** "active" = inbox (default), "deleted" = trash. */
  status?: 'active' | 'deleted';
  limit?: number;
  offset?: number;
}

/**
 * List conversations for the sidebar feed.
 * Sorted by `updated_at` descending — most recently used first.
 */
export async function listConversations(
  params: ListConversationsParams,
): Promise<ChatConversation[]> {
  const { data } = await apiClient.get<{
    conversations: ChatConversation[];
    total: number;
  }>('/pricing-chat/conversations', { params });
  return data.conversations;
}

/**
 * Load one conversation + every message in chronological order.
 * Use this to hydrate the panel when the user clicks a past chat.
 */
export async function getConversationWithMessages(
  conversationId: string,
  userId: string,
): Promise<{ conversation: ChatConversation; messages: ChatMessageRecord[] }> {
  const { data } = await apiClient.get<{
    conversation: ChatConversation;
    messages: ChatMessageRecord[];
  }>(`/pricing-chat/conversations/${conversationId}`, {
    params: { user_id: userId },
  });
  return data;
}

/** Rename the sidebar title for a conversation. Owner-only. */
export async function renameConversation(
  conversationId: string,
  userId: string,
  chatName: string,
): Promise<ChatConversation> {
  const { data } = await apiClient.patch<{ conversation: ChatConversation }>(
    `/pricing-chat/conversations/${conversationId}`,
    { user_id: userId, chat_name: chatName },
  );
  return data.conversation;
}

/**
 * Soft-delete (move to trash). Conversation stays in Mongo but the default
 * sidebar (`status=active`) filters it out.
 */
export async function trashConversation(
  conversationId: string,
  userId: string,
): Promise<void> {
  await apiClient.patch(
    `/pricing-chat/conversations/${conversationId}/trash`,
    { user_id: userId },
  );
}

/**
 * Ask the backend to generate (or regenerate) a short LLM title for a
 * conversation. Mirrors Kroolo's /generate-title pattern.
 *
 * The backend auto-fires this on the conversation's first persisted
 * message, so explicit calls are only needed for manual "Regenerate title"
 * actions in the UI. Respects `title_is_custom` unless `force` is true.
 */
export async function generateConversationTitle(
  conversationId: string,
  userId: string,
  force = false,
): Promise<{ conversation: ChatConversation; generated_title: string }> {
  const { data } = await apiClient.post<{
    conversation: ChatConversation;
    generated_title: string;
  }>(`/pricing-chat/conversations/${conversationId}/generate-title`, {
    user_id: userId,
    force,
  });
  return data;
}
