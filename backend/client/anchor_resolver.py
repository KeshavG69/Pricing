"""Resolve LLM-returned description anchors back to verbatim source spans.

The descriptions parser returns locators (`desc_start` / `desc_end`) instead of
transcribing prose, which cuts its output by ~10x. This module turns those
locators back into description text sliced verbatim out of the source document.

Three problems have to be handled:
  1. Anchors won't match byte-exact — the model normalizes whitespace and
     hyphens, and occasionally drops a word.
  2. The same phrase recurs across labor categories (boilerplate like
     "in accordance with agency standards"), so first-match is not safe.
  3. A bad span must fail loudly rather than silently swallow a neighbour.
"""

import logging
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

MAX_DESC_CHARS = 2000
MIN_DESC_CHARS = 20
MIN_ANCHOR_SCORE = 0.75   # coverage gate: how much of the anchor matched
MIN_MATCH_DENSITY = 0.6   # density gate: how tightly the match packs into the span
TITLE_LOOKBACK = 400      # a title header sits just above its description
MAX_EXACT_HITS = 200
MAX_FUZZY_HITS = 20
MAX_CANDIDATES_PER_ENTRY = 8   # bounds the assignment DP

# Span scoring. Base is high enough that any admissible span beats leaving an
# entry unassigned; the DP then maximises the total across all entries.
SCORE_BASE = 5.0
SCORE_TITLE_ADJACENT = 10.0    # strongest signal — separates identical bodies
SCORE_REAL_END_ANCHOR = 5.0
SCORE_LENGTH_PENALTY = 3.0     # prefer tight spans over sprawling ones


def _normalize_with_map(text: str) -> Tuple[str, List[int]]:
    """Lowercase and collapse whitespace, keeping a map back to original offsets.

    offsets[j] is the index in `text` of the character that produced
    normalized[j]. Matching happens on the normalized copy; slicing happens on
    the original, so extracted text keeps its source formatting exactly.
    """
    chars: List[str] = []
    offsets: List[int] = []
    prev_space = False
    for i, ch in enumerate(text):
        if ch.isspace():
            if prev_space:
                continue
            chars.append(" ")
            offsets.append(i)
            prev_space = True
        else:
            chars.append(ch.lower())
            offsets.append(i)
            prev_space = False
    return "".join(chars), offsets


def _normalize(text: str) -> str:
    return " ".join(text.lower().split())


def _refine(needle: str, hay: str, coarse: int) -> Optional[Tuple[int, int]]:
    """Snap a fixed-width window hit onto its true alignment.

    The coarse scan slides a window of len(needle), so when the anchor drifts in
    length the window can start mid-token. If needle[a:] matches window[b:], the
    real span begins at b - a.

    Two gates reject a bad alignment rather than returning a plausible-looking
    one. Coverage: enough of the anchor has to match at all. Density: the
    matching characters must pack tightly into the span, so a match cannot be
    stitched together out of fragments scattered across a long stretch of text.
    """
    n = len(needle)
    pad = max(8, n // 2)
    origin = max(0, coarse - pad)
    window = hay[origin : coarse + n + pad]

    blocks = [b for b in SequenceMatcher(None, needle, window).get_matching_blocks() if b.size > 0]
    if not blocks:
        return None

    matched = sum(b.size for b in blocks)
    if matched < MIN_ANCHOR_SCORE * n:          # coverage gate
        return None

    first, last = blocks[0], blocks[-1]
    start = max(0, min(origin + first.b - first.a, len(hay)))
    end = origin + last.b + last.size + (n - (last.a + last.size))
    end = max(start, min(end, len(hay)))

    span_len = end - start
    if span_len <= 0 or matched / span_len < MIN_MATCH_DENSITY:   # density gate
        return None

    return (start, end)


def _all_exact(needle: str, hay: str) -> List[Tuple[int, int]]:
    out: List[Tuple[int, int]] = []
    i = hay.find(needle)
    while i != -1 and len(out) < MAX_EXACT_HITS:
        out.append((i, i + len(needle)))
        i = hay.find(needle, i + 1)
    return out


def _all_fuzzy(needle: str, hay: str) -> List[Tuple[int, int]]:
    """Every window scoring above threshold, refined and de-overlapped."""
    n = len(needle)
    if n == 0:
        return []

    scored: List[Tuple[float, int]] = []
    step = max(1, n // 8)
    for i in range(0, max(1, len(hay) - n // 2), step):
        sm = SequenceMatcher(None, needle, hay[i : i + n])
        if sm.quick_ratio() < MIN_ANCHOR_SCORE:
            continue
        ratio = sm.ratio()
        if ratio >= MIN_ANCHOR_SCORE:
            scored.append((ratio, i))

    scored.sort(reverse=True)
    picked: List[Tuple[int, int]] = []
    for _, i in scored:
        if any(abs(i - p[0]) < n for p in picked):
            continue    # same region, already represented
        refined = _refine(needle, hay, i)
        if refined is None:
            continue    # failed the coverage or density gate
        picked.append(refined)
        if len(picked) >= MAX_FUZZY_HITS:
            break
    return picked


def _candidates(anchor: str, hay: str) -> List[Tuple[int, int]]:
    a = _normalize(anchor or "")
    if not a:
        return []
    return _all_exact(a, hay) or _all_fuzzy(a, hay)


def _assign_monotonic(
    per_entry: List[List[Tuple[int, int, float, bool]]],
) -> List[Optional[Tuple[int, int, bool]]]:
    """Globally assign at most one span per entry, in order and without overlap.

    Greedy per-entry selection can commit an early entry to a span that belonged
    to a later one, and has no way to undo it — that is how identical boilerplate
    descriptions get misattributed. This is the same monotonic-occurrence
    dynamic program LangExtract uses: entries in output order map to successive
    occurrences, maximising total score over the whole assignment rather than
    one entry at a time.

    per_entry[i] holds that entry's candidates as (start, end, score, capped).
    Returns the chosen (start, end, capped) per entry, or None where the entry
    is best left unassigned.
    """
    n = len(per_entry)
    if not n:
        return []

    # State is "the previous chosen span ended here", discretised to the set of
    # candidate end positions.
    ends = sorted({0} | {e for cands in per_entry for (_s, e, _sc, _c) in cands})
    end_index = {e: i for i, e in enumerate(ends)}
    m = len(ends)

    # dp[i][k] = best achievable score for entries i.. given spans must start
    # at or after ends[k]. Row n is the all-zeros base case.
    dp: List[List[float]] = [[0.0] * m for _ in range(n + 1)]
    pick: List[List[Optional[Tuple[int, int, bool]]]] = [[None] * m for _ in range(n)]

    for i in range(n - 1, -1, -1):
        row, nxt, picks = dp[i], dp[i + 1], pick[i]
        cands = per_entry[i]
        for k in range(m):
            limit = ends[k]
            best = nxt[k]              # leave entry i unassigned
            best_choice = None
            for (s, e, sc, capped) in cands:
                if s < limit:
                    continue           # would overlap or reorder
                value = sc + nxt[end_index[e]]
                if value > best:
                    best, best_choice = value, (s, e, capped)
            row[k] = best
            picks[k] = best_choice

    chosen: List[Optional[Tuple[int, int, bool]]] = []
    k = 0
    for i in range(n):
        choice = pick[i][k]
        chosen.append(choice)
        if choice is not None:
            k = end_index[choice[1]]
    return chosen


def resolve_descriptions(full_text: str, entries: List[dict]) -> List[dict]:
    """Replace {desc_start, desc_end} anchors with verbatim text from full_text.

    Candidate spans are enumerated and scored, then assigned globally by a
    monotonic dynamic program — boilerplate descriptions repeat verbatim across
    labor categories, so first-match and greedy selection both misattribute.
    The entry title is the primary disambiguator: bodies can be byte-identical,
    titles almost never are ("Engineer I" vs "Engineer II").

    Entries that cannot be resolved get description=None and an `_anchor_miss`
    tag; they are never given a guessed span.
    """
    norm, offsets = _normalize_with_map(full_text)

    # Titles frequently nest: "Logistics Engineer" is a prefix of "Logistics
    # Engineer - Junior", so a naive title search matches inside the longer
    # heading and hands the shorter entry its neighbour's description. Keep the
    # full set so a hit can be rejected when a longer title starts there too.
    all_titles = sorted(
        {_normalize(e.get("title") or "") for e in entries if (e.get("title") or "").strip()},
        key=len,
        reverse=True,
    )

    # Every title position in the document, sorted. When an end anchor can't be
    # found the span is capped, and a fixed character cap will happily run
    # through the next category's heading. Stopping at the next title instead
    # keeps a truncated-but-correct description rather than a merged one.
    title_positions = sorted({s for t in all_titles for s, _ in _candidates(t, norm)})

    def _next_title_after(pos: int) -> Optional[int]:
        for p in title_positions:
            if p > pos:
                return p
        return None

    def _own_title_hits(title: str) -> List[Tuple[int, int]]:
        norm_title = _normalize(title)
        hits = _candidates(title, norm)
        longer = [t for t in all_titles if len(t) > len(norm_title)]
        if not longer:
            return hits
        return [(s, e) for (s, e) in hits if not any(norm.startswith(t, s) for t in longer)]

    # ---- build scored candidates per entry ----
    per_entry: List[List[Tuple[int, int, float, bool]]] = []
    miss: List[Optional[str]] = []

    for entry in entries:
        starts = _candidates(entry.get("desc_start", ""), norm)
        if not starts:
            per_entry.append([])
            miss.append("start")
            continue

        title = (entry.get("title") or "").strip()
        title_hits = _own_title_hits(title) if title else []
        end_hits = _candidates(entry.get("desc_end", ""), norm)

        cands: List[Tuple[int, int, float, bool]] = []
        for s_start, _ in starts:
            # Tightest end anchor that follows this start, within the cap.
            span_end: Optional[int] = None
            for e_start, e_end in end_hits:
                if e_start > s_start and (e_end - s_start) <= MAX_DESC_CHARS:
                    if span_end is None or e_end < span_end:
                        span_end = e_end

            capped = span_end is None
            if capped:
                span_end = min(s_start + MAX_DESC_CHARS, len(norm))
                boundary = _next_title_after(s_start + MIN_DESC_CHARS)
                if boundary is not None:
                    span_end = min(span_end, boundary)

            length = span_end - s_start
            if length < MIN_DESC_CHARS:
                continue

            score = SCORE_BASE
            # Title header immediately above the description is the strongest
            # signal, and the only one separating byte-identical bodies.
            if any(0 <= s_start - t_end <= TITLE_LOOKBACK for _, t_end in title_hits):
                score += SCORE_TITLE_ADJACENT
            if not capped:
                score += SCORE_REAL_END_ANCHOR
            # Prefer tight spans — swallowing a neighbour is the failure to avoid.
            score -= SCORE_LENGTH_PENALTY * (length / MAX_DESC_CHARS)

            cands.append((s_start, span_end, score, capped))

        # Ordering and overlap are enforced by the DP, so only the strongest few
        # candidates per entry need to reach it.
        cands.sort(key=lambda c: c[2], reverse=True)
        per_entry.append(cands[:MAX_CANDIDATES_PER_ENTRY])
        miss.append(None if cands else "span")

    # The DP enforces document order as a hard constraint, but the LLM does not
    # always emit entries in document order. Sequence them by where their
    # strongest candidate actually sits, run the assignment in that order, then
    # scatter the results back to the caller's ordering.
    def _position_key(i: int) -> float:
        cands = per_entry[i]
        return float(cands[0][0]) if cands else float("inf")

    order = sorted(range(len(per_entry)), key=_position_key)
    ordered_assignment = _assign_monotonic([per_entry[i] for i in order])

    assignment: List[Optional[Tuple[int, int, bool]]] = [None] * len(per_entry)
    for slot, entry_index in enumerate(order):
        assignment[entry_index] = ordered_assignment[slot]

    # ---- materialise ----
    resolved: List[dict] = []
    for entry, chosen, reason in zip(entries, assignment, miss):
        out = {k: v for k, v in entry.items() if k not in ("desc_start", "desc_end")}

        if chosen is None:
            out["description"] = None
            out["_anchor_miss"] = reason or "span"
            resolved.append(out)
            continue

        n_start, n_end, capped = chosen
        o_start = offsets[n_start]
        o_end = offsets[n_end - 1] + 1 if n_end <= len(offsets) else len(full_text)

        out["description"] = full_text[o_start:o_end].strip()
        if capped:
            out["_anchor_miss"] = "end"
        resolved.append(out)

    return resolved


def anchor_miss_summary(entries: List[dict]) -> Dict[str, int]:
    """Count unresolved anchors by reason — the signal that anchors are drifting."""
    summary: Dict[str, int] = {}
    for e in entries:
        reason = e.get("_anchor_miss")
        if reason:
            summary[reason] = summary.get(reason, 0) + 1
    return summary
