"""
RFP Radar — daily scanner.

For each organization with a capability profile, produces up to 10 top-ranked
matches from today's SAM.gov bulk CSV and saves them to rfp_radar_matches.

Run by the Celery beat schedule at 6am ET. Pure async Python orchestration —
heavy reuse of:
  - SAM.gov bulk CSV download (no key, no quota)
  - match_scorer.score_opportunity         for ranking
  - samgov_client.list_attachments         for the PWS confidence gate
  - pws_picker.pick_likely_pws             for the auto-PWS decision
  - rfp_radar_match_crud.bulk_save_for_scan for storage

The orchestrator is `run_daily_scan_for_all_orgs()`; the per-org function
`run_scan_for_org()` is exposed separately for ad-hoc testing.
"""

import asyncio
import csv
import logging
import os
import tempfile
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from auth.database import get_mongodb_client
from client.capability_profile_builder import (
    CapabilityProfile,
    NAICSContribution,
    SubAgencyContribution,
)
from client.match_scorer import score_opportunity
from client.pws_picker import PWSConfidence, pick_likely_pws
from client.samgov_client import (
    BULK_DOWNLOAD_TIMEOUT,
    NOTICE_TYPE_MAP,
    Opportunity,
    SAMGOV_BULK_CSV_URL,
    get_samgov_client,
)
from utils.rfp_radar_match_crud import get_rfp_radar_match_crud

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

# Top N matches to save per org per day
TOP_N_MATCHES = 10

# Cap on how many top-scored candidates to PWS-check before giving up filling
# the top-N quota. Calibrated against our validation run (40% pass HIGH) —
# 30 candidates expected to yield ~10–12 survivors.
PWS_CHECK_CANDIDATES = 30

# Concurrent /resources calls during the PWS gate
PWS_CHECK_CONCURRENCY = 5

# Only consider opportunities posted within this window
POSTED_WITHIN_DAYS = 60


# ---------------------------------------------------------------------------
# Bulk CSV download + parse
# ---------------------------------------------------------------------------


async def download_bulk_csv() -> str:
    """
    Stream-download SAM.gov's daily bulk CSV (~217 MB) to a temp file.
    Returns the path. Caller is responsible for cleanup.
    """
    tmp = tempfile.NamedTemporaryFile(
        mode="wb", suffix=".csv", delete=False, prefix="samgov_scan_"
    )
    tmp_path = tmp.name
    t0 = datetime.now(timezone.utc)
    bytes_total = 0
    try:
        async with httpx.AsyncClient(
            timeout=BULK_DOWNLOAD_TIMEOUT, headers={"Accept": "*/*"}
        ) as c:
            async with c.stream("GET", SAMGOV_BULK_CSV_URL) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(chunk_size=1 << 16):
                    tmp.write(chunk)
                    bytes_total += len(chunk)
        tmp.close()
        elapsed = (datetime.now(timezone.utc) - t0).total_seconds()
        logger.info(
            f"Downloaded bulk CSV: {bytes_total / 1024 / 1024:.1f} MB "
            f"in {elapsed:.1f}s → {tmp_path}"
        )
        return tmp_path
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def parse_csv_to_naics_buckets(
    csv_path: str,
    posted_within_days: int = POSTED_WITHIN_DAYS,
    active_only: bool = True,
) -> dict[str, list[tuple[Opportunity, str]]]:
    """
    Stream-parse the bulk CSV once and index by NAICS code.

    Returns: { naics_code: [(opportunity, description), ...] }

    Description is kept alongside each Opportunity so it can be passed to the
    match scorer for keyword matching — the bulk CSV is the only path that
    gives us description text without an API call.
    """
    cutoff: Optional[date] = None
    if posted_within_days > 0:
        cutoff = datetime.now(timezone.utc).date() - timedelta(days=posted_within_days)

    buckets: dict[str, list[tuple[Opportunity, str]]] = defaultdict(list)
    scanned = 0
    kept = 0
    with open(csv_path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            scanned += 1
            if active_only and (row.get("Active") or "").strip().lower() != "yes":
                continue
            naics = (row.get("NaicsCode") or "").strip()
            if not naics:
                continue
            if cutoff is not None:
                posted_str = row.get("PostedDate") or ""
                try:
                    posted_dt = datetime.fromisoformat(posted_str[:10]).date()
                    if posted_dt < cutoff:
                        continue
                except (ValueError, TypeError):
                    continue
            opp = _csv_row_to_opportunity(row)
            description = (row.get("Description") or "").strip()
            buckets[naics].append((opp, description))
            kept += 1
    logger.info(
        f"Parsed bulk CSV: {scanned:,} rows scanned, {kept:,} active in last "
        f"{posted_within_days}d across {len(buckets):,} NAICS codes"
    )
    return dict(buckets)


def _csv_row_to_opportunity(row: dict) -> Opportunity:
    """Map a bulk-CSV row to an Opportunity dataclass."""
    notice_type_label = (row.get("Type") or "").strip()
    notice_type_code = None
    for code, label in NOTICE_TYPE_MAP.items():
        if notice_type_label.lower() == label.lower():
            notice_type_code = code
            break
    naics = (row.get("NaicsCode") or "").strip()
    return Opportunity(
        notice_id=(row.get("NoticeId") or "").strip(),
        title=(row.get("Title") or "").strip(),
        awarding_top_agency=(row.get("Department/Ind.Agency") or "").strip() or None,
        awarding_sub_agency=(row.get("Sub-Tier") or "").strip() or None,
        notice_type_code=notice_type_code,
        posted_date=row.get("PostedDate") or None,
        response_deadline=row.get("ResponseDeadLine") or None,
        solicitation_number=(row.get("Sol#") or "").strip() or None,
        naics_codes=[naics] if naics else [],
        set_aside_code=(row.get("SetASideCode") or "").strip() or None,
        set_aside_description=(row.get("SetASide") or "").strip() or None,
        pop_state=(row.get("PopState") or "").strip() or None,
        pop_city=(row.get("PopCity") or "").strip() or None,
        attachments=[],
        ui_link=(row.get("Link") or "").strip() or None,
    )


# ---------------------------------------------------------------------------
# Profile hydration (Mongo doc → CapabilityProfile dataclass)
# ---------------------------------------------------------------------------


def _profile_from_doc(doc: dict) -> CapabilityProfile:
    """Hydrate a CapabilityProfile dataclass from a Mongo profile doc."""
    return CapabilityProfile(
        uei=doc.get("uei", ""),
        company_name=doc.get("company_name", ""),
        hq_location=doc.get("hq_location"),
        naics_codes=[
            NAICSContribution(
                code=n.get("code", ""),
                description=n.get("description", ""),
                wins=int(n.get("wins") or 0),
                total_amount=float(n.get("total_amount") or 0.0),
            )
            for n in doc.get("naics_codes", [])
        ],
        sub_agencies_of_interest=[
            SubAgencyContribution(
                name=s.get("name", ""),
                wins=int(s.get("wins") or 0),
                total_amount=float(s.get("total_amount") or 0.0),
            )
            for s in doc.get("sub_agencies_of_interest", [])
        ],
        set_asides_qualified=list(doc.get("set_asides_qualified") or []),
        scope_keywords=list(doc.get("scope_keywords") or []),
        pop_states_primary=list(doc.get("pop_states_primary") or []),
        past_awards_count=int(doc.get("past_awards_count") or 0),
        past_awards_total=float(doc.get("past_awards_total") or 0.0),
        most_recent_award_date=doc.get("most_recent_award_date"),
        built_at=str(doc.get("built_at")) if doc.get("built_at") else "",
    )


# ---------------------------------------------------------------------------
# Per-org scan
# ---------------------------------------------------------------------------


def _dedup_by_solicitation(
    candidate_map: dict[str, tuple[Opportunity, str]],
) -> dict[str, tuple[Opportunity, str]]:
    """
    Collapse opportunities that share a solicitation number, keeping the
    most-recently-posted version.

    SAM.gov mints a new notice_id for every re-post/amendment of the same
    solicitation, so a single Sol# can appear several times across posted
    dates. We keep the latest posting (the current/active amendment) and
    merge NAICS codes from the dropped duplicates so scoring still sees the
    full set.

    Opportunities without a solicitation number are never collapsed — each is
    kept on its own notice_id, since we have no reliable identity to group on.

    Returned keys are arbitrary (notice_id of the survivor); only the values
    matter downstream.
    """
    # group_key -> (winning opp, desc)
    winners: dict[str, tuple[Opportunity, str]] = {}

    for opp, desc in candidate_map.values():
        sol = (opp.solicitation_number or "").strip().upper()
        # No solicitation number → unique by notice_id (never merge).
        group_key = sol if sol else f"__noticeid__{opp.notice_id}"

        existing = winners.get(group_key)
        if existing is None:
            winners[group_key] = (opp, desc)
            continue

        old_opp, old_desc = existing
        # Merge the loser's NAICS codes into whichever opp survives, so we
        # don't lose a NAICS signal just because it rode in on the older post.
        merged_naics = list(old_opp.naics_codes)
        for c in opp.naics_codes:
            if c not in merged_naics:
                merged_naics.append(c)

        # Most recent posted_date wins. ISO YYYY-MM-DD compares lexically;
        # a missing date is treated as oldest.
        new_is_newer = (opp.posted_date or "") > (old_opp.posted_date or "")
        winner_opp, winner_desc = (opp, desc) if new_is_newer else (old_opp, old_desc)
        winner_opp.naics_codes = merged_naics
        winners[group_key] = (winner_opp, winner_desc)

    # Re-key by the survivor's notice_id for a clean caller-facing map.
    return {opp.notice_id: (opp, desc) for opp, desc in winners.values()}


async def run_scan_for_org(
    profile_doc: dict,
    naics_buckets: dict[str, list[tuple[Opportunity, str]]],
    top_n: int = TOP_N_MATCHES,
) -> list[dict]:
    """
    Run a scan for one organization. Returns up to top_n match-document dicts
    ready to insert via RFPRadarMatchCRUD.bulk_save_for_scan.

    Pipeline:
        1. Collect candidates across the org's NAICS codes (dedup by notice_id)
        2. Score each one — description from CSV powers keyword matching
        3. Sort by score desc
        4. Walk the top PWS_CHECK_CANDIDATES, running PWS_CHECK_CONCURRENCY
           concurrent /resources calls
        5. Keep only opportunities whose PWS picker returns HIGH confidence
        6. Stop at top_n survivors
    """
    profile = _profile_from_doc(profile_doc)
    org_id = profile_doc.get("organization_id")

    # 1. Gather candidates
    candidate_map: dict[str, tuple[Opportunity, str]] = {}
    for naics_obj in profile.naics_codes:
        for opp, desc in naics_buckets.get(naics_obj.code, []):
            existing = candidate_map.get(opp.notice_id)
            if existing is None:
                candidate_map[opp.notice_id] = (opp, desc)
            else:
                old_opp, _ = existing
                for c in opp.naics_codes:
                    if c not in old_opp.naics_codes:
                        old_opp.naics_codes.append(c)

    if not candidate_map:
        logger.info(f"Org {org_id}: no candidates in CSV for their NAICS")
        return []

    # 1b. Collapse re-posts of the same solicitation. SAM.gov issues a fresh
    # notice_id for every amendment/re-post, so the notice_id dedup above lets
    # the same Sol# (e.g. N0018926RL020) through 4× on different posted dates.
    # Keep only the most-recently-posted version of each solicitation number.
    deduped = _dedup_by_solicitation(candidate_map)
    if len(deduped) < len(candidate_map):
        logger.info(
            f"Org {org_id}: collapsed {len(candidate_map)} → {len(deduped)} "
            f"candidates after solicitation-number dedup"
        )

    # 2. Score each
    scored: list[tuple[Any, Opportunity, str]] = []
    for opp, desc in deduped.values():
        ms = score_opportunity(opp, profile, opp_description=desc)
        scored.append((ms, opp, desc))
    scored.sort(key=lambda t: t[0].score, reverse=True)

    logger.info(
        f"Org {org_id}: {len(candidate_map)} candidates scored, "
        f"top score {scored[0][0].score if scored else 0}, "
        f"running PWS gate on top {min(PWS_CHECK_CANDIDATES, len(scored))}…"
    )

    # 3. PWS gate
    sam = get_samgov_client()
    semaphore = asyncio.Semaphore(PWS_CHECK_CONCURRENCY)

    async def _check_one(ms, opp: Opportunity, desc: str):
        async with semaphore:
            atts = await sam.list_attachments(opp.notice_id)
            pick = pick_likely_pws(atts)
            return ms, opp, desc, pick

    survivors: list[dict] = []
    pool = scored[:PWS_CHECK_CANDIDATES]

    # Process in concurrency-sized windows so we can stop early once we have
    # top_n survivors (no point checking the 30th candidate if we already
    # have 10).
    idx = 0
    while idx < len(pool) and len(survivors) < top_n:
        batch = pool[idx : idx + PWS_CHECK_CONCURRENCY]
        results = await asyncio.gather(
            *(_check_one(ms, opp, desc) for ms, opp, desc in batch),
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, Exception):
                logger.warning(f"Org {org_id}: PWS check raised {r}")
                continue
            ms, opp, desc, pick = r
            if pick.confidence != PWSConfidence.HIGH or pick.attachment is None:
                continue
            survivors.append(_build_match_doc(ms, opp, pick, rank=len(survivors) + 1))
            if len(survivors) >= top_n:
                break
        idx += PWS_CHECK_CONCURRENCY

    logger.info(
        f"Org {org_id}: {len(survivors)}/{top_n} survivors after PWS gate "
        f"(checked {min(idx, len(pool))} top candidates)"
    )
    return survivors


def _build_match_doc(ms, opp: Opportunity, pick, rank: int) -> dict:
    """Shape a dict for RFPRadarMatchCRUD.bulk_save_for_scan."""
    return {
        "rank": rank,
        "match_score": ms.score,
        "match_reasons": list(ms.reasons),
        "signal_breakdown": dict(ms.signal_breakdown),
        "notice_id": opp.notice_id,
        "title": opp.title,
        "awarding_top_agency": opp.awarding_top_agency,
        "awarding_sub_agency": opp.awarding_sub_agency,
        "notice_type_code": opp.notice_type_code,
        "notice_type_label": opp.notice_type_label,
        "posted_date": opp.posted_date,
        "response_deadline": opp.response_deadline,
        "solicitation_number": opp.solicitation_number,
        "naics_codes": list(opp.naics_codes),
        "set_aside_code": opp.set_aside_code,
        "set_aside_description": opp.set_aside_description,
        "pop_state": opp.pop_state,
        "pop_city": opp.pop_city,
        "ui_link": opp.ui_link or opp.sam_gov_url,
        "pws": {
            "attachment_id": pick.attachment.attachment_id,
            "resource_id": pick.attachment.resource_id,
            "filename": pick.attachment.name,
            "size_bytes": pick.attachment.size,
            "mime_type": pick.attachment.mime_type,
            "confidence": pick.confidence.value,
            "score": pick.score,
        },
    }


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------


def daily_rfp_radar_scan_sync() -> dict:
    """
    Sync entry point — runs the async daily scan inside an event loop.

    Use this from Celery tasks (sync) or any CLI. For async callers (FastAPI
    endpoints, tests), call `run_daily_scan_for_all_orgs()` directly.
    """
    return asyncio.run(run_daily_scan_for_all_orgs())


async def run_daily_scan_for_all_orgs() -> dict:
    """
    Daily scan for every organization with a capability profile.

    Downloads the bulk CSV once, parses it once, then scans each org.
    Returns a summary dict suitable for logging or status endpoints.
    """
    scan_date = datetime.now(timezone.utc).date()
    csv_path: Optional[str] = None
    summary: dict = {
        "scan_date": scan_date.isoformat(),
        "orgs_total": 0,
        "orgs_scanned": 0,
        "matches_total": 0,
        "per_org": {},
    }
    try:
        csv_path = await download_bulk_csv()
        buckets = parse_csv_to_naics_buckets(csv_path)

        mongodb = get_mongodb_client()
        db = mongodb.get_database()
        profiles = list(db["capability_profiles"].find({}))
        summary["orgs_total"] = len(profiles)
        crud = get_rfp_radar_match_crud()

        for profile_doc in profiles:
            org_id = profile_doc.get("organization_id")
            try:
                matches = await run_scan_for_org(profile_doc, buckets)
            except Exception:
                logger.exception(f"Scan failed for org {org_id}")
                continue
            inserted = crud.bulk_save_for_scan(org_id, scan_date, matches)
            summary["orgs_scanned"] += 1
            summary["matches_total"] += inserted
            summary["per_org"][str(org_id)] = inserted
            logger.info(f"Org {org_id}: {inserted} matches saved for {scan_date}")
    finally:
        if csv_path:
            try:
                os.unlink(csv_path)
            except OSError:
                pass
    return summary


# ---------------------------------------------------------------------------
# Celery task wrapper
# ---------------------------------------------------------------------------
#
# Lives at the bottom so the file is importable without Celery (handy for
# unit tests that hit the pure scanner functions). The import is best-effort
# — if Celery isn't installed or app.worker can't be loaded, the wrapper is
# silently skipped and the underlying functions still work.

try:
    from app.worker import celery_app

    @celery_app.task(
        name="rfp_radar.daily_scan",
        bind=True,
        time_limit=1800,         # 30 min hard limit (shouldn't take more than ~2 min in practice)
        soft_time_limit=1500,    # 25 min soft
    )
    def daily_rfp_radar_scan(self) -> dict:
        """
        Celery task entry point — fires from beat schedule at ~10:00 UTC daily.

        Run manually for testing:
            celery -A app.worker call rfp_radar.daily_scan
        """
        logger.info(f"RFP Radar daily scan starting (task_id={self.request.id})")
        try:
            summary = daily_rfp_radar_scan_sync()
            logger.info(f"RFP Radar daily scan complete: {summary}")
            return summary
        except Exception:
            logger.exception("RFP Radar daily scan failed")
            raise

except ImportError as _e:
    # Tests / scripts that import this module without Celery installed.
    logger.debug(f"Celery wrapper skipped: {_e}")
