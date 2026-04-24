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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  thinking?: boolean; // true from send-click until first content delta
  reasoning?: ReasoningStep[]; // think/analyze tool calls, accumulated in order
}

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

export default function PricingChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  // Session ID: regenerated every time the panel opens and on "New chat"
  // so each chat opens as a fresh conversation with no history bleed.
  const [sessionId, setSessionId] = useState<string>(() => newSessionId(null));
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

  // When the panel is open, push the main page content left by the panel width
  // so nothing hides underneath. Uses document.body padding + transition for a
  // smooth shift. Cleaned up on close/unmount.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const panelWidth = '28rem'; // matches Tailwind's max-w-md
    const prevPadding = body.style.paddingRight;
    const prevTransition = body.style.transition;

    if (isOpen) {
      body.style.transition = 'padding-right 200ms ease-out';
      body.style.paddingRight = panelWidth;
    } else {
      body.style.transition = 'padding-right 200ms ease-out';
      body.style.paddingRight = '';
    }
    return () => {
      body.style.paddingRight = prevPadding;
      body.style.transition = prevTransition;
    };
  }, [isOpen]);

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
          // Append a new reasoning step (or no-op if we don't care about this tool).
          // For now we accumulate ALL tool calls the agent makes, not just
          // think/analyze — the UI only labels known ones, others show raw.
          setMessages((m) =>
            m.map((msg) => {
              if (msg.id !== assistantMsg.id) return msg;
              const stepId = evt.tool_call_id || `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const nextSteps: ReasoningStep[] = [
                ...(msg.reasoning || []),
                {
                  id: stepId,
                  name: evt.tool_name || 'tool',
                  args: evt.tool_args,
                  running: true,
                },
              ];
              return { ...msg, reasoning: nextSteps };
            }),
          );
        } else if (evt.type === 'tool.completed') {
          setMessages((m) =>
            m.map((msg) => {
              if (msg.id !== assistantMsg.id) return msg;
              const steps = msg.reasoning || [];
              // Find matching running step by tool_call_id, else the last running one
              const idx = (() => {
                if (evt.tool_call_id) {
                  const i = steps.findIndex((s) => s.id === evt.tool_call_id);
                  if (i >= 0) return i;
                }
                // fallback: the last still-running step
                for (let i = steps.length - 1; i >= 0; i--) if (steps[i].running) return i;
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
                // No matching started event seen; synthesize the step from completed.
                next = [
                  ...steps,
                  {
                    id: evt.tool_call_id || `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    name: evt.tool_name || 'tool',
                    args: evt.tool_args,
                    result: resultToStr(evt.result),
                    error: evt.error,
                    running: false,
                  },
                ];
              }
              return { ...msg, reasoning: next };
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
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 hover:shadow-xl"
          aria-label="Open pricing assistant"
        >
          <Sparkles className="h-4 w-4" />
          Ask about this proposal
        </button>
      )}

      {/* Side panel — no backdrop; user can freely interact with the rest of the app */}
      {isOpen && (
        <>
          <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Pricing Assistant
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
                  <div className="rounded-full bg-blue-50 p-3">
                    <MessageCircle className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Try asking…
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
                            {/*
                              Show the rotating thinking indicator only before the
                              first reasoning step arrives. Once reasoning steps
                              exist, the ReasoningSteps live view carries the
                              "something is happening" signal.
                            */}
                            {msg.thinking &&
                            !msg.content &&
                            (!msg.reasoning || msg.reasoning.length === 0) ? (
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
                The assistant reads your current proposal state. Numbers match what you see on screen.
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
