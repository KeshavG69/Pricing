/**
 * Convert persisted `ChatMessageRecord` rows from the backend back into the
 * panel's `ChatMessage[]` shape so a past chat re-renders identically to
 * when it originally streamed.
 *
 * Used by both PricingChatPanel (when user opens a past chat from the
 * history dropdown) and ChatColumn (when /q loads a conversation).
 */

import type { ChatMessageRecord } from '@/lib/api/pricingChat';
import type { ReasoningStep } from '@/components/pricing/chat/ReasoningSteps';
import type {
  ChatMessage,
  MessageBlock,
  PausedRun,
  ToolCallEntry,
} from './types';

/** Stringify tool.completed `result` (may be string, object, or anything else). */
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
 * Two messages per turn (one user, one assistant). Assistant carries the
 * full content + blocks + reasoning + toolCalls captured by MessageTracker.
 * If the turn ended in an unresolved approval gate, the paused-run state is
 * reconstructed so the approval card re-renders.
 */
export function hydrateMessagesFromRecords(
  records: ChatMessageRecord[],
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const rec of records) {
    out.push({
      id: `hist-u-${rec.id}`,
      role: 'user',
      content: rec.user_query,
    });

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

export { resultToStr };
