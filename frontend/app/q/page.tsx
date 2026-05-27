'use client';

/**
 * /q — Q chat workspace.
 *
 * Layout: thin top bar + sidebar (proposals → chats) + main chat area.
 *
 * Past chats and new chats both live here — clicking "+ New chat" picks
 * a proposal and spawns a fresh ChatColumn; clicking a sidebar row hydrates
 * a past chat. No routing required; backend treats it identically to the
 * floating panel in the workspace.
 *
 * Design notes:
 *   - Custom easing curves throughout (`cubic-bezier(0.23,1,0.32,1)`),
 *     never the default `ease`/`ease-in-out`
 *   - Origin-aware popovers (scale from trigger, not centre)
 *   - Press feedback (scale 0.97) on every button
 *   - Stagger entry on sidebar lists, gated behind motion-safe
 *   - Quiet chrome — content leads, layout recedes
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  Loader2,
  MessageSquare,
  Search,
  Pencil,
  Trash2,
  Plus,
  ExternalLink,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';
import { useAuthStore } from '@/lib/stores/authStore';
import {
  listConversations,
  getConversationWithMessages,
  renameConversation,
  trashConversation,
  type ChatConversation,
  type ChatMessageRecord,
} from '@/lib/api/pricingChat';
import { proposalsApi } from '@/lib/api/proposals';
import type { Proposal } from '@/types';
import ChatColumn from './ChatColumn';

// ─── Helpers ──────────────────────────────────────────────────────

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
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Group conversations by proposal_name for the sidebar. Order by recency.
 */
function groupByProposal(
  items: ChatConversation[],
): Array<{ proposal_id: string | null; proposal_name: string; chats: ChatConversation[] }> {
  const map = new Map<string, ChatConversation[]>();
  for (const c of items) {
    const key = c.proposal_id || '__none__';
    const list = map.get(key) || [];
    list.push(c);
    map.set(key, list);
  }
  const groups = Array.from(map.entries()).map(([key, chats]) => ({
    proposal_id: key === '__none__' ? null : key,
    proposal_name: chats[0]?.proposal_name || 'Other',
    chats: chats.slice().sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    ),
  }));
  groups.sort((a, b) => {
    const aLatest = new Date(a.chats[0]?.updated_at || 0).getTime();
    const bLatest = new Date(b.chats[0]?.updated_at || 0).getTime();
    return bLatest - aLatest;
  });
  return groups;
}

// ─── Page ─────────────────────────────────────────────────────────

export default function QHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const organizationId = user?.organization_id;

  // Sidebar state
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // New-chat popover state
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [proposalList, setProposalList] = useState<Proposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [proposalSearch, setProposalSearch] = useState('');
  const newChatButtonRef = useRef<HTMLButtonElement | null>(null);
  const newChatPopoverRef = useRef<HTMLDivElement | null>(null);

  // Selected conversation
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get('conversation') || null,
  );
  const [selectedConv, setSelectedConv] = useState<ChatConversation | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<ChatMessageRecord[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [activeProposal, setActiveProposal] = useState<Proposal | null>(null);

  // Fresh-chat mode (picked a proposal but no conversation yet)
  const [freshChat, setFreshChat] = useState<{
    sessionId: string;
    proposalId: string;
    proposalName: string;
    proposal: Proposal;
  } | null>(null);

  // ── Load conversation list ──────────────────────────────────
  const refreshList = useCallback(async () => {
    if (!user?.id || !organizationId) return;
    setListLoading(true);
    setListError(null);
    try {
      const items = await listConversations({
        user_id: user.id,
        organization_id: organizationId,
        status: 'active',
        limit: 200,
      });
      setConversations(items);
      const urlConv = searchParams.get('conversation');
      if (urlConv && !selectedConv) {
        const match = items.find((c) => c.id === urlConv);
        if (match) setSelectedId(match.id);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setListLoading(false);
    }
  }, [user?.id, organizationId, searchParams, selectedConv]);

  useEffect(() => {
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, organizationId]);

  // ── Lazy-load proposal list for the picker ─────────────────
  const loadProposals = useCallback(async () => {
    setProposalsLoading(true);
    setProposalsError(null);
    try {
      const res = await proposalsApi.list(0, 50, 'date', 'desc');
      const list = Array.isArray(res) ? res : res.proposals;
      setProposalList(list);
    } catch (err) {
      setProposalsError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposalsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isNewChatOpen && proposalList.length === 0 && !proposalsLoading) {
      void loadProposals();
    }
  }, [isNewChatOpen, proposalList.length, proposalsLoading, loadProposals]);

  // Close popover on outside click
  useEffect(() => {
    if (!isNewChatOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        newChatButtonRef.current?.contains(t) ||
        newChatPopoverRef.current?.contains(t)
      ) return;
      setIsNewChatOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isNewChatOpen]);

  // Close popover on Escape
  useEffect(() => {
    if (!isNewChatOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsNewChatOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isNewChatOpen]);

  // ── Load messages + proposal metadata for selected chat ─────
  useEffect(() => {
    if (!selectedId || !user?.id) {
      setSelectedConv(null);
      setSelectedMessages([]);
      setActiveProposal(null);
      return;
    }
    setMsgLoading(true);
    setMsgError(null);
    void (async () => {
      try {
        const { conversation, messages } = await getConversationWithMessages(
          selectedId,
          user.id,
        );
        setSelectedConv(conversation);
        setSelectedMessages(messages);
        try {
          const prop = await proposalsApi.get(conversation.proposal_id);
          setActiveProposal(prop);
        } catch {
          setActiveProposal(null);
        }
      } catch (err) {
        setMsgError(err instanceof Error ? err.message : String(err));
      } finally {
        setMsgLoading(false);
      }
    })();
  }, [selectedId, user?.id]);

  // Filtered chats (search across name + proposal + preview)
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.chat_name.toLowerCase().includes(q) ||
        (c.proposal_name?.toLowerCase() || '').includes(q) ||
        (c.last_message_preview?.toLowerCase() || '').includes(q),
    );
  }, [conversations, searchQuery]);
  const groups = useMemo(() => groupByProposal(filtered), [filtered]);

  // Filtered proposals (picker)
  const filteredProposals = useMemo(() => {
    if (!proposalSearch.trim()) return proposalList;
    const q = proposalSearch.toLowerCase();
    return proposalList.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.solicitation_number?.toLowerCase().includes(q),
    );
  }, [proposalList, proposalSearch]);

  // ── Actions ─────────────────────────────────────────────────
  const handleSelect = (conv: ChatConversation) => {
    setSelectedId(conv.id);
    const url = new URL(window.location.href);
    url.searchParams.set('conversation', conv.id);
    window.history.replaceState(null, '', url.toString());
  };

  const handleRename = async (conv: ChatConversation) => {
    if (!user?.id) return;
    const next = window.prompt('Rename chat:', conv.chat_name);
    if (!next || !next.trim() || next.trim() === conv.chat_name) return;
    try {
      const updated = await renameConversation(conv.id, user.id, next.trim());
      setConversations((items) =>
        items.map((it) => (it.id === conv.id ? { ...it, chat_name: updated.chat_name } : it)),
      );
      if (selectedConv?.id === conv.id) {
        setSelectedConv({ ...selectedConv, chat_name: updated.chat_name });
      }
    } catch (err) {
      window.alert(`Rename failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleTrash = async (conv: ChatConversation) => {
    if (!user?.id) return;
    if (!window.confirm(`Delete "${conv.chat_name}"?`)) return;
    try {
      await trashConversation(conv.id, user.id);
      setConversations((items) => items.filter((it) => it.id !== conv.id));
      if (selectedId === conv.id) {
        setSelectedId(null);
        setSelectedConv(null);
        setSelectedMessages([]);
      }
    } catch (err) {
      window.alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const startNewChatForProposal = useCallback(
    async (proposalId: string) => {
      setIsNewChatOpen(false);
      setSelectedId(null);
      setSelectedConv(null);
      setSelectedMessages([]);
      setActiveProposal(null);
      const url = new URL(window.location.href);
      url.searchParams.delete('conversation');
      window.history.replaceState(null, '', url.toString());
      try {
        const prop = await proposalsApi.get(proposalId);
        setFreshChat({
          sessionId: `chat-${proposalId}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          proposalId,
          proposalName: prop.name || 'Untitled',
          proposal: prop,
        });
      } catch (err) {
        window.alert(
          `Couldn${'’'}t open proposal: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedId) setFreshChat(null);
  }, [selectedId]);

  // ── Render ──────────────────────────────────────────────────
  if (!user?.id) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Sign in to view your Q chat history.
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* ── Top bar: clean & quiet ───────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-5">
        <Link
          href="/dashboard"
          className="group flex items-center gap-2.5 outline-none"
          aria-label="Back to dashboard"
        >
          <Image
            src="/logo.svg"
            alt="PriceIQ"
            width={28}
            height={28}
            priority
            className="transition-transform duration-200 group-hover:scale-105"
          />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            PriceIQ
          </span>
          <span className="ml-1 text-sm text-muted-foreground/80">/ Chat</span>
        </Link>

        {selectedConv?.proposal_id && (
          <button
            onClick={() => router.push(`/proposals/${selectedConv.proposal_id}`)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted hover:text-foreground active:scale-[0.97]"
          >
            Open in workspace
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ───────────────────────────────────────── */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-border/60 bg-background">
          {/* Top: New chat + search */}
          <div className="space-y-2 p-3">
            <div className="relative">
              <button
                ref={newChatButtonRef}
                onClick={() => setIsNewChatOpen((v) => !v)}
                className="group flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-[transform,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-border hover:bg-muted/60 active:scale-[0.98]"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors duration-150 group-hover:bg-primary/15">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
                New chat
                <kbd className="ml-auto hidden text-[10px] font-medium text-muted-foreground/70 lg:inline">
                  ⌘N
                </kbd>
              </button>

              {/* Proposal picker popover — origin-aware, scale+fade entry */}
              {isNewChatOpen && (
                <ProposalPicker
                  ref={newChatPopoverRef}
                  search={proposalSearch}
                  onSearchChange={setProposalSearch}
                  loading={proposalsLoading}
                  error={proposalsError}
                  proposals={filteredProposals}
                  onPick={(id) => void startNewChatForProposal(id)}
                />
              )}
            </div>

            {/* Search past chats */}
            <div className="group relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70 transition-colors duration-150 group-focus-within:text-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats"
                className="w-full rounded-lg border border-border/60 bg-background py-2 pl-8 pr-2.5 text-sm placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus:border-border focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>

          {/* Grouped list */}
          <div className="flex-1 overflow-y-auto px-1 pb-3">
            {listLoading ? (
              <SidebarShimmer />
            ) : listError ? (
              <div className="mx-3 mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                {listError}
              </div>
            ) : groups.length === 0 ? (
              <SidebarEmpty isSearching={!!searchQuery.trim()} />
            ) : (
              <div className="space-y-5 pt-1">
                {groups.map((g, gi) => (
                  <ProposalGroup
                    key={g.proposal_id || g.proposal_name}
                    proposalId={g.proposal_id}
                    proposalName={g.proposal_name}
                    chats={g.chats}
                    selectedId={selectedId}
                    groupIndex={gi}
                    onSelect={handleSelect}
                    onRename={handleRename}
                    onTrash={handleTrash}
                    onNewChat={(pid) => void startNewChatForProposal(pid)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ── Main chat area ──────────────────────────────────── */}
        <main className="flex flex-1 flex-col overflow-hidden bg-background">
          {!selectedId && !freshChat ? (
            <EmptyMain onStart={() => setIsNewChatOpen(true)} />
          ) : msgLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              Loading chat
            </div>
          ) : msgError ? (
            <div className="flex flex-1 items-center justify-center text-sm text-red-600">
              {msgError}
            </div>
          ) : freshChat ? (
            <>
              <ChatTitleBar
                title="New chat"
                proposalName={freshChat.proposalName}
                updatedAt={null}
                messageCount={0}
              />
              <div className="flex-1 overflow-hidden">
                <ChatColumn
                  userId={user.id}
                  organizationId={organizationId!}
                  proposalId={freshChat.proposalId}
                  role={user.role}
                  proposalType={freshChat.proposal.wage_source?.type}
                  gsaFileId={
                    freshChat.proposal.wage_source?.type === 'gsa'
                      ? freshChat.proposal.wage_source.file_id
                      : undefined
                  }
                  gsaCurrentYear={extractGsaCurrentYear(freshChat.proposal)}
                  sessionId={freshChat.sessionId}
                  initialMessages={[]}
                  proposalName={freshChat.proposalName}
                  onFirstTurnComplete={async () => {
                    // Backend just persisted the first turn + (likely)
                    // upgraded the title via LLM. Refresh the sidebar so
                    // the new conversation row + title appears, then auto-
                    // select it (so the user is no longer in "fresh" mode).
                    if (!user?.id || !organizationId) return;
                    try {
                      const items = await listConversations({
                        user_id: user.id,
                        organization_id: organizationId,
                        status: 'active',
                        limit: 200,
                      });
                      setConversations(items);
                      const match = items.find(
                        (c) => c.session_id === freshChat.sessionId,
                      );
                      if (match) {
                        setFreshChat(null);
                        setSelectedId(match.id);
                      }
                    } catch (err) {
                      console.warn('[/q] post-first-turn refresh failed:', err);
                    }
                  }}
                />
              </div>
            </>
          ) : selectedConv && activeProposal ? (
            <>
              <ChatTitleBar
                title={selectedConv.chat_name}
                proposalName={selectedConv.proposal_name}
                updatedAt={selectedConv.updated_at}
                messageCount={selectedMessages.length}
              />
              <div className="flex-1 overflow-hidden">
                <ChatColumn
                  userId={user.id}
                  organizationId={organizationId!}
                  proposalId={selectedConv.proposal_id}
                  role={user.role}
                  proposalType={activeProposal.wage_source?.type}
                  gsaFileId={
                    activeProposal.wage_source?.type === 'gsa'
                      ? activeProposal.wage_source.file_id
                      : undefined
                  }
                  gsaCurrentYear={extractGsaCurrentYear(activeProposal)}
                  sessionId={selectedConv.session_id}
                  initialMessages={selectedMessages}
                  proposalName={selectedConv.proposal_name || undefined}
                />
              </div>
            </>
          ) : selectedConv ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Couldn&apos;t load proposal metadata. Try again later.
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

// ─── Sidebar: proposal-grouped list ─────────────────────────────

interface ProposalGroupProps {
  proposalId: string | null;
  proposalName: string;
  chats: ChatConversation[];
  selectedId: string | null;
  groupIndex: number;
  onSelect: (c: ChatConversation) => void;
  onRename: (c: ChatConversation) => void;
  onTrash: (c: ChatConversation) => void;
  onNewChat: (proposalId: string) => void;
}

function ProposalGroup({
  proposalId,
  proposalName,
  chats,
  selectedId,
  groupIndex,
  onSelect,
  onRename,
  onTrash,
  onNewChat,
}: ProposalGroupProps) {
  return (
    <div>
      <div className="group/header flex items-center justify-between px-4 pb-1.5 text-[11px] font-medium text-muted-foreground/80">
        <span className="truncate">{proposalName}</span>
        {proposalId && (
          <button
            onClick={() => onNewChat(proposalId)}
            className="rounded-md p-1 opacity-0 transition-[opacity,background-color] duration-150 hover:bg-muted hover:text-foreground group-hover/header:opacity-100"
            title={`New chat about ${proposalName}`}
            aria-label={`New chat about ${proposalName}`}
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
      </div>
      <ul className="space-y-0.5">
        {chats.map((c, i) => (
          <ChatRow
            key={c.id}
            conv={c}
            isActive={selectedId === c.id}
            onSelect={onSelect}
            onRename={onRename}
            onTrash={onTrash}
            staggerIndex={groupIndex * 4 + i}
          />
        ))}
      </ul>
    </div>
  );
}

// ─── Sidebar row ─────────────────────────────────────────────────

interface ChatRowProps {
  conv: ChatConversation;
  isActive: boolean;
  onSelect: (c: ChatConversation) => void;
  onRename: (c: ChatConversation) => void;
  onTrash: (c: ChatConversation) => void;
  staggerIndex: number;
}

function ChatRow({ conv, isActive, onSelect, onRename, onTrash, staggerIndex }: ChatRowProps) {
  const delay = Math.min(staggerIndex, 14) * 28; // cap stagger so 50+ items don't crawl in
  return (
    <li
      className="motion-safe:animate-[chatRowIn_360ms_cubic-bezier(0.23,1,0.32,1)_backwards]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={`group relative mx-2 flex items-start gap-2 rounded-lg px-3 py-2 transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          isActive
            ? 'bg-muted'
            : 'hover:bg-muted/50'
        }`}
      >
        {/* Selection bar */}
        <span
          aria-hidden
          className={`absolute left-0 top-2 h-[calc(100%-1rem)] w-[2px] rounded-r-full bg-primary transition-opacity duration-150 ${
            isActive ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <button onClick={() => onSelect(conv)} className="flex-1 min-w-0 text-left">
          <div className="truncate text-[13px] font-medium leading-tight text-foreground">
            {conv.chat_name}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/80">
            <span>{relativeTime(conv.updated_at)}</span>
            <span aria-hidden>·</span>
            <span>
              {conv.message_count} msg{conv.message_count === 1 ? '' : 's'}
            </span>
          </div>
          {conv.last_message_preview && (
            <div className="mt-1 line-clamp-1 text-[11px] text-muted-foreground/70">
              {conv.last_message_preview}
            </div>
          )}
        </button>
        <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              void onRename(conv);
            }}
            className="rounded-md p-1 text-muted-foreground transition-[transform,background-color,color] duration-150 hover:bg-background hover:text-foreground active:scale-[0.92]"
            title="Rename"
            aria-label="Rename chat"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              void onTrash(conv);
            }}
            className="rounded-md p-1 text-muted-foreground transition-[transform,background-color,color] duration-150 hover:bg-background hover:text-red-600 active:scale-[0.92]"
            title="Delete"
            aria-label="Delete chat"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </li>
  );
}

// ─── Proposal picker popover ────────────────────────────────────

interface PickerProps {
  search: string;
  onSearchChange: (v: string) => void;
  loading: boolean;
  error: string | null;
  proposals: Proposal[];
  onPick: (id: string) => void;
}

const ProposalPicker = ({ ref, ...rest }: PickerProps & { ref: React.Ref<HTMLDivElement> }) => {
  // Mount-state trick: render hidden first, flip to visible next paint
  // so the popover smoothly scales from its trigger (top-left origin).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      ref={ref}
      style={{ transformOrigin: 'top left' }}
      className={`absolute left-0 right-0 top-[44px] z-50 overflow-hidden rounded-xl border border-border/80 bg-popover/95 text-popover-foreground shadow-[0_8px_28px_-6px_rgba(0,0,0,0.18)] backdrop-blur transition-[transform,opacity] duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
        mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]'
      }`}
    >
      <div className="border-b border-border/60 p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <input
            autoFocus
            type="text"
            value={rest.search}
            onChange={(e) => rest.onSearchChange(e.target.value)}
            placeholder="Pick a proposal"
            className="w-full rounded-md border border-transparent bg-background py-1.5 pl-8 pr-2 text-sm placeholder:text-muted-foreground/70 focus:border-border focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {rest.loading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading proposals
          </div>
        ) : rest.error ? (
          <div className="px-3 py-4 text-xs text-red-600">{rest.error}</div>
        ) : rest.proposals.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {rest.search ? 'No matching proposals.' : 'No proposals yet.'}
          </div>
        ) : (
          <ul className="p-1">
            {rest.proposals.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => rest.onPick(p.id)}
                  className="group flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted/70 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {p.name || 'Untitled'}
                    </div>
                    {p.solicitation_number && (
                      <div className="truncate text-[11px] text-muted-foreground/80">
                        {p.solicitation_number}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
ProposalPicker.displayName = 'ProposalPicker';

// ─── Main area: title bar & empties ─────────────────────────────

interface ChatTitleBarProps {
  title: string;
  proposalName?: string | null;
  updatedAt: string | null;
  messageCount: number;
}

function ChatTitleBar({ title, proposalName, updatedAt, messageCount }: ChatTitleBarProps) {
  return (
    <div className="flex shrink-0 items-baseline justify-between border-b border-border/60 px-6 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          {proposalName && (
            <>
              <span className="truncate">{proposalName}</span>
              {(updatedAt || messageCount > 0) && <span aria-hidden>·</span>}
            </>
          )}
          {updatedAt && (
            <>
              <span>{relativeTime(updatedAt)}</span>
              {messageCount > 0 && <span aria-hidden>·</span>}
            </>
          )}
          {messageCount > 0 && (
            <span>
              {messageCount} message{messageCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyMain({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_8px_24px_-8px_rgba(37,99,235,0.45)] motion-safe:animate-[scaleIn_400ms_cubic-bezier(0.23,1,0.32,1)]"
        >
          <span className="text-xl font-bold tracking-tight">Q</span>
        </div>
        <h2 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
          Pick up a chat or start a new one
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Your past Q conversations are grouped by proposal on the left. Open one
          to keep talking — or start fresh.
        </p>
        <button
          onClick={onStart}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-primary/90 active:scale-[0.97]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          New chat
        </button>
      </div>
    </div>
  );
}

function SidebarEmpty({ isSearching }: { isSearching: boolean }) {
  return (
    <div className="mx-3 mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-8 text-center">
      <MessageSquare className="h-5 w-5 text-muted-foreground/60" strokeWidth={1.75} />
      <div className="text-xs text-muted-foreground">
        {isSearching ? 'No matching chats' : 'No past chats yet'}
      </div>
      {!isSearching && (
        <div className="text-[11px] text-muted-foreground/70">
          Click <span className="font-medium text-foreground">+ New chat</span> to
          begin.
        </div>
      )}
    </div>
  );
}

function SidebarShimmer() {
  return (
    <div className="space-y-3 px-3 pt-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="space-y-1">
            <div className="h-9 animate-pulse rounded-lg bg-muted/70" />
            <div className="h-9 animate-pulse rounded-lg bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Misc helpers ───────────────────────────────────────────────

/**
 * Find a GSA position on the proposal so ChatColumn can pass gsa_current_year
 * to the backend (enables the GSA retrieval tools).
 */
function extractGsaCurrentYear(p: Proposal): number | undefined {
  const sd = (p.spreadsheet_data as { positions?: Array<{ wage_source?: string; gsa_current_year?: number }> } | undefined);
  const positions = sd?.positions || [];
  const firstGSA = positions.find((pos) => pos.wage_source === 'gsa');
  return firstGSA?.gsa_current_year;
}

// Suppress unused-import errors for icons used elsewhere if any
void ExternalLink;
