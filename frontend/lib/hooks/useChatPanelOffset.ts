/**
 * Read the live width of the floating Q chat panel.
 *
 * PricingChatPanel writes its current width into `--chat-panel-offset` on
 * `:root` while it's open (and clears it on close). This hook subscribes
 * to that variable via a `MutationObserver` on `documentElement`'s style
 * attribute, so any component can react to the panel opening / closing /
 * resizing without coupling to PricingChatPanel directly.
 *
 * Typical use in a data grid: shrink frozen-column widths when the panel
 * is open so non-frozen (year) columns still have room.
 *
 *   const { isCompact, pick } = useChatPanelOffset();
 *   <Column width={pick(180, 80)} ... />
 *   // remember to add `pick` to the `useMemo` deps for your columns.
 */

import { useCallback, useEffect, useState } from 'react';

interface ChatPanelOffset {
  /** Current panel width in pixels (0 if closed). */
  offset: number;
  /** True when the panel is open (offset > 0). */
  isCompact: boolean;
  /**
   * Pick a width based on panel state. Use in column definitions:
   *   width: pick(180, 80)  // 180 when panel closed, 80 when open
   */
  pick: <T>(full: T, compact: T) => T;
}

export function useChatPanelOffset(): ChatPanelOffset {
  const [offset, setOffset] = useState<number>(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const read = () => {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue('--chat-panel-offset')
        .trim();
      const n = parseInt(v, 10);
      setOffset(Number.isFinite(n) ? n : 0);
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });
    return () => obs.disconnect();
  }, []);

  const isCompact = offset > 0;
  const pick = useCallback(
    <T,>(full: T, compact: T): T => (isCompact ? compact : full),
    [isCompact],
  );

  return { offset, isCompact, pick };
}
