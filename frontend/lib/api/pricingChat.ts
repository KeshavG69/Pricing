/**
 * Streaming client for /api/pricing-chat/ask.
 *
 * Posts the serialized proposal context + user query, consumes the SSE
 * response, and yields message deltas to the caller.
 */

export interface PricingChatRequest {
  query: string;
  proposal_context: string;
  session_id: string;
  organization_id: string;
  proposal_id?: string;
  user_id?: string;
  role?: string;
  proposal_type?: 'bls' | 'gsa';
  gsa_file_id?: string;
  gsa_current_year?: number;
}

export interface PricingChatResumeRequest {
  run_id: string;
  session_id: string;
  proposal_context: string;
  organization_id: string;
  confirmed: boolean;
  confirmation_note?: string;
  proposal_id?: string;
  user_id?: string;
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
  | { type: 'run.continued'; run_id: string }
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
        // Ignored: run.started / run.completed / usage / compression.* / agent.event
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
