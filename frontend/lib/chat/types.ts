/**
 * Shared chat-render types used by both PricingChatPanel (workspace floating
 * panel) and ChatColumn (the /q fullscreen page).
 *
 * Separating these into their own module avoids cross-component imports
 * between the panel and the page just to share a few interface shapes.
 */

import type { ReasoningStep } from '@/components/pricing/chat/ReasoningSteps';

export interface ToolCallEntry {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  args?: Record<string, unknown>;
  result?: unknown;
}

/**
 * Ordered render-block within an assistant message body. Mirrors the panel's
 * stream-order capture so charts/files end up between text exactly where
 * they fired.
 */
export type MessageBlock =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tool'; id: string; toolCallId: string };

/** State saved when the agent emits run.paused (requires_confirmation). */
export interface PausedRun {
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  thinking?: boolean;
  reasoning?: ReasoningStep[];
  toolCalls?: ToolCallEntry[];
  blocks?: MessageBlock[];
  pausedRun?: PausedRun;
}

/** Tool names that render as reasoning steps, not tool pills. */
export const REASONING_TOOL_NAMES = new Set(['think', 'analyze']);

export const EXA_TOOL_NAMES = new Set([
  'exa',
  'search_exa',
  'exa_search',
  'web_search',
  'exa_answer',
  'get_contents_exa',
]);

/** Tool names whose output renders as an inline body artifact. */
export const ARTIFACT_TOOL_NAMES = new Set([
  'chart_tool',
  's3_upload_tool',
  ...EXA_TOOL_NAMES,
]);
