"""
SAM.gov client — find open federal RFPs that match a capability profile.

Uses the documented keyed v2 endpoint at api.sam.gov/opportunities/v2/search.
Requires SAMGOV_API_KEY in env (free key from sam.gov → Account Details).

Endpoints
=========
  GET  /opportunities/v2/search
       Search opportunities with rich response shape — set-aside, deadline,
       attachment URLs (`resourceLinks`), agency hierarchy, and PoP all returned
       in a single call. We don't need a separate detail endpoint anymore;
       single-opportunity lookup is just `search(noticeid=X)`.

Key request params
==================
  api_key       — REQUIRED. From settings.SAMGOV_API_KEY.
  postedFrom    — REQUIRED. MM/dd/yyyy. Max 1-year range vs postedTo.
  postedTo      — REQUIRED. MM/dd/yyyy.
  ncode         — NAICS code (one per request — fan out for multiple).
  typeOfSetAside — set-aside code (SBA, WOSB, EDWOSB, 8A, HZC, SDVOSBC, ...).
  ptype         — notice type codes (k, p, o, r, ...).
  limit         — records per page (1–1000, default 1).
  offset        — pagination index.

Rate limits
===========
  Public account: 10 requests/day (testing only)
  Registered entity: 1,000 requests/day (production v1)

When SAMGOV_API_KEY is empty we raise a SamGovError with an actionable message
rather than silently failing on a 401.
"""

import asyncio
import csv
import logging
import os
import tempfile
import threading
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from typing import AsyncIterator, Optional

import httpx

from app.settings import settings
from client.pws_picker import Attachment

logger = logging.getLogger(__name__)


SAMGOV_BASE = "https://api.sam.gov"
SAMGOV_SEARCH_PATH = "/opportunities/v2/search"

# Public daily bulk CSV — refreshed by SAM.gov ~03:30 GMT each day. No key needed.
# Contains ALL opportunities (active + archived), ~217 MB. We stream-parse it
# in the daily scanner instead of fanning out per-NAICS API calls.
SAMGOV_BULK_CSV_URL = (
    "https://falextracts.s3.amazonaws.com/Contract%20Opportunities/datagov/"
    "ContractOpportunitiesFullCSV.csv"
)
BULK_DOWNLOAD_TIMEOUT = 300.0  # 5 min — 217 MB download

DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_PER_NAICS = 25
MAX_CONCURRENCY = 5  # parallel NAICS fan-out
DEFAULT_POSTED_WINDOW_DAYS = 60  # how far back to look — 2 months keeps recs fresh


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class SamGovError(Exception):
    """Raised when SAM.gov API returns an error or no usable data."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


# Map SAM.gov's single-letter notice type codes to human labels.
NOTICE_TYPE_MAP = {
    "o": "Solicitation",
    "p": "Presolicitation",
    "k": "Combined Synopsis/Solicitation",
    "r": "Sources Sought",
    "g": "Sale of Surplus Property",
    "i": "Intent to Bundle Requirements",
    "s": "Special Notice",
    "a": "Award Notice",
    "u": "Justification and Authorization",
}


@dataclass
class Opportunity:
    """
    A SAM.gov opportunity. v2 returns rich-enough data on the search response
    that we don't need a separate detail call — everything we need to score and
    later hand off lands here in one shot.
    """

    notice_id: str
    title: str

    # Hierarchy parsed from fullParentPathName (period-delimited string).
    awarding_top_agency: Optional[str]    # e.g. "DEPT OF DEFENSE"
    awarding_sub_agency: Optional[str]    # e.g. "DEPT OF THE NAVY"

    notice_type_code: Optional[str]        # 1-letter (k, p, o, r, ...)
    posted_date: Optional[str]             # ISO date
    response_deadline: Optional[str]       # ISO date
    solicitation_number: Optional[str]

    # The NAICS the API returned (single string in v2). If the same opp came
    # back via multiple NAICS searches, dedup-merge in search_opportunities()
    # extends this list with the others.
    naics_codes: list[str] = field(default_factory=list)

    set_aside_code: Optional[str] = None        # raw code (SBA, WOSB, ...)
    set_aside_description: Optional[str] = None

    pop_state: Optional[str] = None
    pop_city: Optional[str] = None

    # Attachment download URLs — directly downloadable, but require api_key
    # appended for content access. This is what enables the "Price this RFP"
    # handoff in piece 6.
    attachments: list[str] = field(default_factory=list)

    # Direct link to the sam.gov UI page for this opportunity.
    ui_link: Optional[str] = None

    @property
    def notice_type_label(self) -> str:
        return NOTICE_TYPE_MAP.get(
            (self.notice_type_code or "").lower(), self.notice_type_code or ""
        )

    @property
    def sam_gov_url(self) -> str:
        """Public-facing opportunity page on sam.gov."""
        return self.ui_link or f"https://sam.gov/opp/{self.notice_id}/view"

    def to_dict(self) -> dict:
        d = asdict(self)
        d["sam_gov_url"] = self.sam_gov_url
        d["notice_type_label"] = self.notice_type_label
        return d


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------


class SamGovClient:
    """
    Async client for SAM.gov v2 opportunities API.

    Singleton via get_samgov_client(). Loop-safe — handles TestClient's
    per-request event-loop spin-up.
    """

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._client_loop: Optional[asyncio.AbstractEventLoop] = None
        self._client_lock = asyncio.Lock()

    async def _get_http(self) -> httpx.AsyncClient:
        current_loop = asyncio.get_event_loop()
        needs_rebuild = (
            self._client is None
            or self._client.is_closed
            or self._client_loop is not current_loop
        )
        if needs_rebuild:
            async with self._client_lock:
                needs_rebuild = (
                    self._client is None
                    or self._client.is_closed
                    or self._client_loop is not current_loop
                )
                if needs_rebuild:
                    self._client = httpx.AsyncClient(
                        base_url=SAMGOV_BASE,
                        timeout=DEFAULT_TIMEOUT,
                        headers={"Accept": "application/json"},
                    )
                    self._client_loop = current_loop
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ----- api key guard -----

    def _require_api_key(self) -> str:
        key = settings.SAMGOV_API_KEY
        if not key:
            raise SamGovError(
                "SAMGOV_API_KEY is not set. Get a free key from sam.gov → "
                "Account Details → API Key, then add it to backend/.env.",
                status_code=500,
            )
        return key

    # ----- search -----

    async def search_opportunities(
        self,
        naics_codes: list[str],
        max_per_naics: int = DEFAULT_MAX_PER_NAICS,
        set_aside_codes: Optional[list[str]] = None,
        posted_from: Optional[date] = None,
        posted_to: Optional[date] = None,
    ) -> list[Opportunity]:
        """
        Fan-out search across NAICS codes (and optionally set-asides), dedup
        by notice_id, return Opportunity list.

        v2's `ncode` is single-valued per request, so we fan out one search
        per NAICS in parallel and merge. Set-asides are fanned out the same way
        (because the API also accepts only one `typeOfSetAside` per request).

        Args:
            naics_codes: NAICS codes from the profile.
            max_per_naics: cap per-NAICS results (default 25, max 1000).
            set_aside_codes: optional set-aside codes to filter at the API.
                             If omitted, returns all set-aside types (caller
                             can filter post-fetch).
            posted_from / posted_to: MM/dd/yyyy date window. Defaults to the
                             last 30 days if not provided. v2 caps the range
                             at 1 year.
        """
        if not naics_codes:
            return []

        self._require_api_key()

        posted_to = posted_to or datetime.utcnow().date()
        posted_from = posted_from or (posted_to - timedelta(days=DEFAULT_POSTED_WINDOW_DAYS))

        semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

        # If no set-aside filter requested, run one search per NAICS only.
        # Otherwise fan out the cross-product (NAICS × set-aside).
        targets: list[tuple[str, Optional[str]]] = []
        if set_aside_codes:
            for n in naics_codes:
                for sa in set_aside_codes:
                    targets.append((n, sa))
        else:
            for n in naics_codes:
                targets.append((n, None))

        async def _bounded(naics: str, set_aside: Optional[str]):
            async with semaphore:
                return await self._search_single(
                    naics=naics,
                    set_aside=set_aside,
                    posted_from=posted_from,
                    posted_to=posted_to,
                    limit=max_per_naics,
                )

        per_request_results = await asyncio.gather(*(_bounded(n, sa) for n, sa in targets))

        # Dedup by notice_id; merge naics_codes across hits.
        seen: dict[str, Opportunity] = {}
        for results in per_request_results:
            for opp in results:
                existing = seen.get(opp.notice_id)
                if existing is None:
                    seen[opp.notice_id] = opp
                else:
                    for code in opp.naics_codes:
                        if code not in existing.naics_codes:
                            existing.naics_codes.append(code)

        logger.info(
            f"SAM.gov v2: {len(seen)} unique opportunities across "
            f"{len(naics_codes)} NAICS × {len(set_aside_codes or [None])} set-asides"
        )
        return list(seen.values())

    async def _search_single(
        self,
        naics: str,
        set_aside: Optional[str],
        posted_from: date,
        posted_to: date,
        limit: int,
    ) -> list[Opportunity]:
        params = {
            "api_key": self._require_api_key(),
            "postedFrom": posted_from.strftime("%m/%d/%Y"),
            "postedTo": posted_to.strftime("%m/%d/%Y"),
            "ncode": naics,
            "limit": str(min(limit, 1000)),
            "offset": "0",
        }
        if set_aside:
            params["typeOfSetAside"] = set_aside

        http = await self._get_http()
        try:
            resp = await http.get(SAMGOV_SEARCH_PATH, params=params)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            body_preview = (e.response.text or "")[:160]
            logger.error(
                f"SAM.gov v2 HTTP {e.response.status_code} for NAICS {naics}: {body_preview}"
            )
            if e.response.status_code == 401:
                raise SamGovError(
                    "SAM.gov rejected the API key (401). Check that "
                    "SAMGOV_API_KEY in .env is current — keys rotate every 90 days.",
                    status_code=401,
                ) from e
            if e.response.status_code == 429:
                raise SamGovError(
                    "SAM.gov rate limit hit (429). Public account = 10/day, "
                    "registered entity = 1000/day.",
                    status_code=429,
                ) from e
            raise SamGovError(
                f"SAM.gov v2 search failed: HTTP {e.response.status_code}",
                status_code=e.response.status_code,
            ) from e
        except httpx.HTTPError as e:
            raise SamGovError(f"SAM.gov v2 search request failed: {e}") from e

        data = resp.json()
        opps_data = data.get("opportunitiesData") or []
        return [self._parse_opportunity(r, naics) for r in opps_data]

    # ----- single-opportunity lookup -----

    async def get_opportunity_detail(self, notice_id: str) -> Optional[Opportunity]:
        """
        Look up a single opportunity by notice ID.

        v2 doesn't have a dedicated detail endpoint; we use the search
        endpoint with `noticeid` filter. Returns None if not found.
        """
        if not notice_id:
            raise SamGovError("notice_id is required", status_code=400)

        self._require_api_key()
        posted_to = datetime.utcnow().date()
        # Same 60-day window as search — opportunities older than that aren't
        # surfaced in scans, so detail lookups for them aren't expected either.
        posted_from = posted_to - timedelta(days=DEFAULT_POSTED_WINDOW_DAYS)

        params = {
            "api_key": self._require_api_key(),
            "postedFrom": posted_from.strftime("%m/%d/%Y"),
            "postedTo": posted_to.strftime("%m/%d/%Y"),
            "noticeid": notice_id,
            "limit": "1",
        }
        http = await self._get_http()
        try:
            resp = await http.get(SAMGOV_SEARCH_PATH, params=params)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise SamGovError(
                f"SAM.gov v2 detail failed: HTTP {e.response.status_code}",
                status_code=e.response.status_code,
            ) from e
        except httpx.HTTPError as e:
            raise SamGovError(f"SAM.gov v2 detail request failed: {e}") from e

        opps = resp.json().get("opportunitiesData") or []
        if not opps:
            return None
        return self._parse_opportunity(opps[0], None)

    # ----- attachments (no API key) -----

    async def list_attachments(self, notice_id: str) -> list[Attachment]:
        """
        List file attachments on an opportunity via the public no-key
        /api/prod/opps/v3/opportunities/{id}/resources endpoint.

        Returns only `type=file` attachments where `fileExists=1` — the ones
        we could actually download. External link-type attachments (web pages
        on piee.eb.mil etc.) are filtered out.

        ~200ms call. No API key, no rate limit. Used at scan time as the
        confidence gate (drop opportunities where we can't pick a PWS).
        """
        if not notice_id:
            return []
        # The public-web endpoint at sam.gov/api/prod/... — separate base from
        # the keyed api.sam.gov client. Use a one-off httpx call so we don't
        # confuse the keyed client's connection pool.
        url = (
            "https://sam.gov/api/prod/opps/v3/opportunities/"
            f"{notice_id}/resources"
        )
        try:
            async with httpx.AsyncClient(
                timeout=15.0, headers={"Accept": "*/*"}
            ) as c:
                resp = await c.get(url)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as e:
            logger.warning(f"SAM.gov /resources failed for {notice_id}: {e}")
            return []

        # Schema: {_embedded: {opportunityAttachmentList: [{attachments: [...]}]}}
        lists = (data.get("_embedded") or {}).get("opportunityAttachmentList") or []
        if not lists:
            return []
        raw_atts = lists[0].get("attachments") or []
        out: list[Attachment] = []
        for a in raw_atts:
            if a.get("type") != "file":
                continue
            if a.get("fileExists") != "1":
                continue
            out.append(Attachment(
                attachment_id=a.get("attachmentId") or "",
                resource_id=a.get("resourceId") or "",
                name=a.get("name") or "",
                size=int(a.get("size") or 0),
                mime_type=(a.get("mimeType") or "").lower(),
                posted_date=a.get("postedDate"),
                order=a.get("attachmentOrder"),
            ))
        return out

    # ----- bulk daily CSV (no API key, no quota) -----

    async def stream_daily_csv(
        self,
        naics_codes: Optional[set[str]] = None,
        set_aside_codes: Optional[set[str]] = None,
        posted_within_days: int = DEFAULT_POSTED_WINDOW_DAYS,
        active_only: bool = True,
    ) -> AsyncIterator[Opportunity]:
        """
        Stream SAM.gov's daily bulk Contract Opportunities CSV (~217 MB).

        Refreshed daily ~03:30 GMT. No API key required, no rate limit. This
        is the path the production daily scanner uses — one download covers
        scanning for every organization in the system.

        Filters applied during stream parsing so memory stays low (~50 MB
        peak even on the full file):

        Args:
            naics_codes: only yield opportunities whose NaicsCode is in this set
            set_aside_codes: only yield opportunities whose SetASideCode is in this set
            posted_within_days: skip opps posted longer ago than this (default 60)
            active_only: skip opps with Active='No' (default True)

        Yields:
            Opportunity objects. Note: attachments + ui_link are NOT populated
            from the bulk CSV (it doesn't include resourceLinks). Callers that
            need attachments must enrich via get_opportunity_detail() — typically
            only when the user clicks "Price this RFP" on a specific opp.
        """
        cutoff: Optional[date] = None
        if posted_within_days is not None and posted_within_days > 0:
            cutoff = datetime.utcnow().date() - timedelta(days=posted_within_days)

        http = await self._get_http()
        # Stream into a temp file rather than holding the whole CSV in memory.
        # csv module needs a sync file-like, and multi-line quoted fields
        # (Description in particular) need a proper CSV parser — easier and
        # more correct than custom line splitting on the byte stream.
        tmp = tempfile.NamedTemporaryFile(
            mode="wb", suffix=".csv", delete=False, prefix="samgov_bulk_"
        )
        tmp_path = tmp.name
        try:
            logger.info(
                f"SAM.gov bulk CSV: streaming download from {SAMGOV_BULK_CSV_URL}"
            )
            t0 = datetime.utcnow()
            bytes_total = 0
            async with http.stream(
                "GET", SAMGOV_BULK_CSV_URL, timeout=BULK_DOWNLOAD_TIMEOUT
            ) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(chunk_size=1 << 16):
                    tmp.write(chunk)
                    bytes_total += len(chunk)
            tmp.close()
            elapsed = (datetime.utcnow() - t0).total_seconds()
            logger.info(
                f"SAM.gov bulk CSV: downloaded {bytes_total / 1024 / 1024:.1f} MB "
                f"in {elapsed:.1f}s — parsing now"
            )

            # Sync parsing inside the temp file. csv.DictReader handles quoted
            # multi-line fields correctly.
            yielded = 0
            scanned = 0
            with open(tmp_path, "r", encoding="utf-8", errors="replace", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    scanned += 1
                    # Filter: active
                    if active_only and (row.get("Active") or "").strip().lower() != "yes":
                        continue
                    # Filter: NAICS
                    if naics_codes:
                        if (row.get("NaicsCode") or "").strip() not in naics_codes:
                            continue
                    # Filter: set-aside
                    if set_aside_codes:
                        if (row.get("SetASideCode") or "").strip() not in set_aside_codes:
                            continue
                    # Filter: posted date cutoff
                    if cutoff is not None:
                        posted = self._parse_csv_date(row.get("PostedDate"))
                        if posted is None or posted < cutoff:
                            continue
                    yielded += 1
                    yield self._parse_csv_row(row)
            logger.info(
                f"SAM.gov bulk CSV: scanned {scanned:,} rows, yielded {yielded:,} matches"
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    @staticmethod
    def _parse_csv_date(raw: Optional[str]) -> Optional[date]:
        """CSV PostedDate format: '2026-06-07 22:57:38.977-04' — extract the date."""
        if not raw:
            return None
        try:
            # Just take the leading YYYY-MM-DD
            return datetime.fromisoformat(raw[:10]).date()
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _parse_csv_row(row: dict) -> Opportunity:
        """Map a row from the bulk Contract Opportunities CSV → Opportunity."""
        # Notice type label is in `Type` column (full string, not 1-letter code).
        # Map back to our 1-letter code for consistency with API path.
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
            attachments=[],  # not in bulk CSV — enrich via v2 API when needed
            ui_link=(row.get("Link") or "").strip() or None,
        )

    # ----- response parsing -----

    @staticmethod
    def _parse_opportunity(r: dict, fallback_naics: Optional[str]) -> Opportunity:
        # fullParentPathName is delimited by "." typically — split for top + sub.
        # Format observed: "DEPT OF DEFENSE.DEPT OF THE NAVY.NAVAL SEA SYSTEMS CMD"
        full_path = r.get("fullParentPathName") or ""
        parts = [p.strip() for p in full_path.replace("/", ".").split(".") if p.strip()]
        top_agency = parts[0] if parts else None
        sub_agency = parts[1] if len(parts) > 1 else None

        # NAICS — v2 returns single `naicsCode`. Some responses also include
        # naicsCodes array.
        naics_list: list[str] = []
        primary = r.get("naicsCode")
        if isinstance(primary, str) and primary:
            naics_list.append(primary)
        for n in r.get("naicsCodes") or []:
            if isinstance(n, str) and n and n not in naics_list:
                naics_list.append(n)
        if not naics_list and fallback_naics:
            naics_list.append(fallback_naics)

        # Place of performance
        pop = r.get("placeOfPerformance") or {}
        pop_city = (pop.get("city") or {}).get("name") if isinstance(pop.get("city"), dict) else pop.get("city")
        pop_state = (pop.get("state") or {}).get("code") if isinstance(pop.get("state"), dict) else pop.get("state")

        # Notice type — v2 returns a string like "Solicitation" via `type`, plus a
        # `baseType`. Try to find the 1-letter code; otherwise stash the string.
        notice_type = r.get("type") or r.get("baseType") or ""
        # Look up the code from our reverse map of NOTICE_TYPE_MAP
        notice_type_code = None
        if isinstance(notice_type, str):
            for code, label in NOTICE_TYPE_MAP.items():
                if notice_type.strip().lower() == label.lower():
                    notice_type_code = code
                    break
            if notice_type_code is None and len(notice_type) == 1:
                notice_type_code = notice_type

        return Opportunity(
            notice_id=r.get("noticeId") or "",
            title=(r.get("title") or "").strip(),
            awarding_top_agency=top_agency,
            awarding_sub_agency=sub_agency,
            notice_type_code=notice_type_code,
            posted_date=r.get("postedDate"),
            response_deadline=r.get("responseDeadLine"),
            solicitation_number=r.get("solicitationNumber"),
            naics_codes=naics_list,
            set_aside_code=r.get("typeOfSetAside"),
            set_aside_description=r.get("typeOfSetAsideDescription"),
            pop_state=pop_state,
            pop_city=pop_city,
            attachments=list(r.get("resourceLinks") or []),
            ui_link=r.get("uiLink"),
        )


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------


_client_instance: Optional[SamGovClient] = None
_instance_lock = threading.RLock()


def get_samgov_client() -> SamGovClient:
    """Get the singleton SAM.gov client."""
    global _client_instance
    if _client_instance is None:
        with _instance_lock:
            if _client_instance is None:
                _client_instance = SamGovClient()
    return _client_instance
