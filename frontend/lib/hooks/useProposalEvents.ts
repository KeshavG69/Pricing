import { useEffect, useRef, useState } from 'react';
import { proposalsApi, ParserEvent } from '../api/proposals';

/**
 * Poll the intelligent-parser event feed for a proposal.
 * Stops polling once the proposal status is no longer 'processing'.
 *
 * Events are never duplicated: seq numbers are monotonic per proposal, and
 * we advance `since` only after successfully merging a batch.
 */
export function useProposalEvents(
  proposalId: string | null,
  interval = 30000
) {
  const [events, setEvents] = useState<ParserEvent[]>([]);
  const sinceRef = useRef(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!proposalId) return;

    // Reset state when proposalId changes
    setEvents([]);
    sinceRef.current = 0;
    stoppedRef.current = false;

    let cancelled = false;

    const tick = async () => {
      if (cancelled || stoppedRef.current) return;
      try {
        const res = await proposalsApi.getEvents(proposalId, sinceRef.current);
        if (cancelled) return;

        if (res.events.length > 0) {
          setEvents((prev) => [...prev, ...res.events]);
          sinceRef.current = res.last_seq;
        }

        if (res.status !== 'processing') {
          stoppedRef.current = true;
        }
      } catch {
        // Ignore transient network errors; the outer status poll owns real error UX.
      }
    };

    tick();
    const id = setInterval(tick, interval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [proposalId, interval]);

  return events;
}
