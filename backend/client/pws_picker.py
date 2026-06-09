"""
RFP Radar — PWS / SOW filename picker.

Given a list of attachments on a SAM.gov opportunity, pick the file most likely
to be the Performance Work Statement / Statement of Work / Scope of Work — the
document PriceIQ's intelligent_parser can extract labor categories from.

Used at scan time as a confidence gate: opportunities where we can't pick a
likely PWS at HIGH confidence are dropped from recommendations entirely.
The user only ever sees opportunities with a ready-to-parse SOW lined up.

Pure functions — no I/O, no LLM call. Filename heuristics only.
"""

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------


@dataclass
class Attachment:
    """One attachment on a SAM.gov opportunity."""

    attachment_id: str
    resource_id: str
    name: str
    size: int                # bytes
    mime_type: str           # e.g. ".pdf", ".docx", ".xlsx"
    posted_date: Optional[str] = None
    order: Optional[int] = None  # SAM.gov's attachmentOrder

    def to_dict(self) -> dict:
        return {
            "attachment_id": self.attachment_id,
            "resource_id": self.resource_id,
            "name": self.name,
            "size": self.size,
            "mime_type": self.mime_type,
            "posted_date": self.posted_date,
            "order": self.order,
        }


class PWSConfidence(str, Enum):
    """How sure we are the picked attachment is actually the PWS/SOW."""

    HIGH = "high"        # ship into recommendations
    MEDIUM = "medium"    # uncertain — only surfaced if user asks
    LOW = "low"          # drop from recommendations
    NONE = "none"        # no attachments at all


# ---------------------------------------------------------------------------
# Scorer
# ---------------------------------------------------------------------------


def score_pws_likelihood(
    name: str, size: int, mime_type: str
) -> tuple[int, list[str]]:
    """
    Score a filename 0–N on how likely it is the PWS/SOW.

    Returns (score, reasons[]) — reasons are short labels for debugging
    why a file scored what it did.
    """
    s = 0
    reasons: list[str] = []
    n = (name or "").lower()
    mt = (mime_type or "").lower()

    # ── Strong positive — explicit PWS/SOW signals ────────────────────
    # Custom boundary that treats `_` as a separator (regex \b doesn't —
    # \bpws\b fails on common filenames like "PWS_Mobile_Final.pdf").
    BOUND = r"(?<![a-z0-9])"  # not preceded by alnum
    NOT_AFTER = r"(?![a-z0-9])"  # not followed by alnum
    if re.search(BOUND + r"pws" + NOT_AFTER, n):
        s += 50
        reasons.append("PWS")
    if re.search(BOUND + r"sow" + NOT_AFTER, n):
        s += 50
        reasons.append("SOW")
    if "performance work statement" in n:
        s += 60
        reasons.append("PWS-full")
    if "statement of work" in n:
        s += 60
        reasons.append("SOW-full")
    if "scope of work" in n:
        s += 50
        reasons.append("scope")
    if "work statement" in n:
        s += 40
        reasons.append("work-stmt")

    # ── Statement of Objectives (Govt RFI/draft form) ─────────────────
    if "statement of objectives" in n or re.search(r"\bsoo\b", n):
        s += 30
        reasons.append("SOO")

    # ── Solicitation itself (often contains scope) ────────────────────
    if "solicitation" in n and "amendment" not in n and "mod" not in n:
        s += 25
        reasons.append("solicitation")

    # ── Numbered-attachment hints ─────────────────────────────────────
    if re.search(r"attachment[\s_-]*0*1\b", n):
        s += 15
        reasons.append("Att-1")
    if re.search(r"\batt[\s_-]*j[\s_-]*0*1\b", n):
        s += 15
        reasons.append("J-1")
    if re.search(r"attachment[\s_-]*[ab]\b", n):
        s += 10
        reasons.append("Att-A/B")

    # ── File type ─────────────────────────────────────────────────────
    if mt == ".pdf":
        s += 10
        reasons.append("PDF")
    elif mt in (".docx", ".doc"):
        s += 10
        reasons.append("DOCX")
    elif mt in (".xlsx", ".xls"):
        s -= 15  # spreadsheets almost never carry scope text
        reasons.append("xlsx-")

    # ── Size hints ────────────────────────────────────────────────────
    if size and size > 200_000:
        s += 10
        reasons.append(">200KB")
    if size and size < 30_000:
        s -= 20
        reasons.append("<30KB-")

    # ── Strong negative — admin / pricing / amendment docs ────────────
    if re.search(r"\bsf[\s_-]*1449\b", n) or re.search(r"\b1449\b", n):
        s -= 80
        reasons.append("SF1449")
    if (
        re.search(r"wage[\s_-]*det", n)
        or re.search(r"\bwd[\s_-]", n)
        or re.search(r"\bsca\b", n)
    ):
        s -= 80
        reasons.append("wage-det")
    if "amendment" in n or "modification" in n or re.search(r"\bmod\s*[0-9]", n):
        s -= 60
        reasons.append("amendment")
    if "q&a" in n or "questions" in n or " qa " in n:
        s -= 50
        reasons.append("Q&A")
    if "past performance" in n or "past_performance" in n:
        s -= 40
        reasons.append("past-perf")
    if re.search(r"\bcdrl", n):
        s -= 30
        reasons.append("CDRL")
    if (
        "section l" in n
        or "section m" in n
        or "sections lm" in n
        or "sec lm" in n
        or "sections l-m" in n
        or "l&m" in n
    ):
        s -= 30
        reasons.append("Sec-L/M")
    if (
        "cost summary" in n
        or "pricing" in n
        or "labor rate" in n
        or "burdened" in n
        or "rate template" in n
    ):
        s -= 30
        reasons.append("pricing")
    if "cover" in n or "cover sheet" in n:
        s -= 30
        reasons.append("cover")
    if "evaluation" in n or "eval criteria" in n:
        s -= 30
        reasons.append("eval")
    if "instruction" in n or "instructions to offerors" in n:
        s -= 20
        reasons.append("instructions")
    if "dd254" in n or "dd 254" in n or "security classification" in n:
        s -= 30
        reasons.append("DD254")
    if "oci" in n and ("plan" in n or "list" in n or "policy" in n):
        s -= 30
        reasons.append("OCI")
    if "transmittal" in n:
        s -= 20
        reasons.append("transmittal")
    if (
        "representation" in n
        or "reps and cert" in n
        or "reps & cert" in n
        or "rep and cert" in n
        or "rep & cert" in n
    ):
        s -= 50
        reasons.append("reps&certs")
    if "far clause" in n or re.search(r"\bclause\s+set", n):
        s -= 30
        reasons.append("FAR")
    if "qasp" in n:  # quality assurance surveillance plan
        s -= 20
        reasons.append("QASP")
    if (
        "sources sought" in n
        or "industry day" in n
        or re.search(r"\bnotice\b", n)
        and "draft" not in n
    ):
        # Often the only attachment on Sources Sought notices is the SS Notice
        # itself — these usually don't contain real PWSs.
        s -= 10
        reasons.append("SS-notice")

    return s, reasons


# ---------------------------------------------------------------------------
# Picker
# ---------------------------------------------------------------------------


# Confidence thresholds. Conservative — we'd rather drop a real PWS than
# silently parse the wrong file and waste a "Price this RFP" click.
HIGH_MIN_SCORE = 50          # top scorer must be at least this strong
HIGH_MIN_LEAD = 30           # and must lead the runner-up by this much
MEDIUM_MIN_SCORE = 20


@dataclass
class PWSPick:
    """Result of pick_likely_pws — the best candidate plus confidence."""

    attachment: Optional[Attachment]
    confidence: PWSConfidence
    score: int
    lead_over_next: int       # gap to the second-best score
    reasons: list[str]

    def to_dict(self) -> dict:
        return {
            "attachment": self.attachment.to_dict() if self.attachment else None,
            "confidence": self.confidence.value,
            "score": self.score,
            "lead_over_next": self.lead_over_next,
            "reasons": self.reasons,
        }


def pick_likely_pws(attachments: list[Attachment]) -> PWSPick:
    """
    Pick the most-likely PWS/SOW from an opportunity's file attachments.

    Returns a PWSPick with:
      - HIGH    : confident enough to silently feed to the parser
      - MEDIUM  : best candidate scored OK but lead over runner-up is small
      - LOW     : weak best score — no signal in the filenames
      - NONE    : no attachments at all
    """
    if not attachments:
        return PWSPick(
            attachment=None,
            confidence=PWSConfidence.NONE,
            score=0,
            lead_over_next=0,
            reasons=[],
        )

    scored: list[tuple[int, list[str], Attachment]] = []
    for a in attachments:
        s, reasons = score_pws_likelihood(a.name, a.size, a.mime_type)
        scored.append((s, reasons, a))

    # Sort by score desc; tie-break by file size desc (bigger PDFs tend to be
    # the real document, not the cover sheet).
    scored.sort(key=lambda t: (t[0], t[2].size), reverse=True)

    top_score, top_reasons, top = scored[0]
    next_score = scored[1][0] if len(scored) > 1 else top_score - HIGH_MIN_LEAD - 1
    lead = top_score - next_score

    if top_score >= HIGH_MIN_SCORE and lead >= HIGH_MIN_LEAD:
        conf = PWSConfidence.HIGH
    elif top_score >= MEDIUM_MIN_SCORE:
        conf = PWSConfidence.MEDIUM
    else:
        conf = PWSConfidence.LOW

    return PWSPick(
        attachment=top,
        confidence=conf,
        score=top_score,
        lead_over_next=lead,
        reasons=top_reasons,
    )
