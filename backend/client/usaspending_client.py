"""
USASpending.gov client for fetching comparable federal award data.

Used by the PTW (Price-to-Win) suggestion engine: given a proposal's NAICS code
and awarding agency, this client pulls historical contract awards that look like
the one being priced, then derives a competitive price target from their
distribution.

USASpending.gov is a free, public, no-auth API:
    https://api.usaspending.gov/

Typical usage:
    client = get_usaspending_client()
    suggestion = await client.suggest_ptw(
        naics_code="541330",
        agency_name="Department of the Navy",
        total_years=5,
        keywords=["SATCOM"],
    )
    print(suggestion.suggested_ptw, suggestion.confidence)
"""

import asyncio
import hashlib
import json
import logging
import statistics
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Optional

import httpx
import redis.asyncio as aioredis

from app.settings import settings

logger = logging.getLogger(__name__)

USASPENDING_BASE_URL = "https://api.usaspending.gov/api/v2"
DEFAULT_TIMEOUT = 30.0
MAX_RESULTS_PER_PAGE = 100

# Procurement award type codes considered "contracts":
#   A = BPA Call
#   B = Purchase Order
#   C = Delivery Order
#   D = Definitive Contract
CONTRACT_AWARD_TYPES = ["A", "B", "C", "D"]

CACHE_TTL_SECONDS = 24 * 3600  # 24h — USASpending data updates daily

# Minimum award duration to be considered a meaningful comparable.
# Sub-3-month awards are usually closeouts or one-off mods.
MIN_DURATION_YEARS = 0.25


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class USASpendingError(Exception):
    """Raised when the USASpending API call fails or returns no usable data."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class Award:
    """A single federal contract award returned from USASpending."""

    award_id: str
    recipient_name: str
    amount: float
    description: str
    start_date: Optional[str]
    end_date: Optional[str]
    awarding_sub_agency: Optional[str]
    internal_id: str  # used to build the public usaspending.gov URL

    @property
    def duration_years(self) -> Optional[float]:
        if not (self.start_date and self.end_date):
            return None
        try:
            d1 = datetime.fromisoformat(self.start_date)
            d2 = datetime.fromisoformat(self.end_date)
            years = (d2 - d1).days / 365.25
            return years if years > 0 else None
        except (ValueError, TypeError):
            return None

    @property
    def annual_cost(self) -> Optional[float]:
        """Award amount normalized to $/year. None if duration is unusable."""
        years = self.duration_years
        if not years or years < MIN_DURATION_YEARS:
            return None
        return self.amount / years

    @property
    def usaspending_url(self) -> str:
        """Public-facing award detail page on usaspending.gov."""
        return f"https://www.usaspending.gov/award/{self.internal_id}/"

    def to_dict(self) -> dict:
        return {
            "award_id": self.award_id,
            "recipient": self.recipient_name,
            "amount": self.amount,
            "annual_cost": self.annual_cost,
            "duration_years": self.duration_years,
            "description": self.description[:200],
            "start_date": self.start_date,
            "end_date": self.end_date,
            "awarding_sub_agency": self.awarding_sub_agency,
            "url": self.usaspending_url,
        }


@dataclass
class Distribution:
    """Statistical summary of comparable award annual costs ($/year)."""

    count: int
    p25: float
    median: float
    p75: float
    min_val: float
    max_val: float

    def to_dict(self) -> dict:
        return {
            "count": self.count,
            "p25": self.p25,
            "median": self.median,
            "p75": self.p75,
            "min": self.min_val,
            "max": self.max_val,
        }


@dataclass
class PTWSuggestion:
    """Bundle returned to the API consumer: a suggested PTW + supporting context."""

    suggested_ptw: float
    low: float
    high: float
    methodology: str
    num_comparables: int
    distribution: Distribution
    top_comparables: list[dict]
    confidence: str  # "high" | "medium" | "low"
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "suggested_ptw": self.suggested_ptw,
            "low": self.low,
            "high": self.high,
            "methodology": self.methodology,
            "num_comparables": self.num_comparables,
            "distribution": self.distribution.to_dict(),
            "top_comparables": self.top_comparables,
            "confidence": self.confidence,
            "notes": self.notes,
        }


# ---------------------------------------------------------------------------
# Cache: Redis with in-memory fallback
# ---------------------------------------------------------------------------
#
# Redis is the primary cache (shared across workers, survives restarts).
# If Redis is unreachable (down, not configured, or network blip), the cache
# silently degrades to a per-process in-memory dict so PTW suggestions still
# work — just without cross-worker sharing.

REDIS_KEY_PREFIX = "usaspending:"
REDIS_CONNECT_TIMEOUT = 2.0  # seconds — fail fast so we don't block on a dead Redis


class _USASpendingCache:
    """Async cache for award lists. Redis-backed with in-memory fallback."""

    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None
        self._redis_init_attempted = False
        self._redis_lock = asyncio.Lock()
        # Per-process fallback when Redis is unavailable
        self._memory: dict[str, tuple[float, list[Award]]] = {}
        self._memory_lock = threading.RLock()

    async def _get_redis(self) -> Optional[aioredis.Redis]:
        """Lazy-connect to Redis. Returns None if unavailable."""
        if self._redis_init_attempted:
            return self._redis
        async with self._redis_lock:
            if self._redis_init_attempted:
                return self._redis
            try:
                client = aioredis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=REDIS_CONNECT_TIMEOUT,
                    socket_timeout=REDIS_CONNECT_TIMEOUT,
                )
                await client.ping()
                self._redis = client
                logger.info(
                    f"USASpending cache: Redis connected at {settings.REDIS_URL}"
                )
            except Exception as e:
                logger.warning(
                    f"USASpending cache: Redis unavailable ({e}); "
                    "using in-memory fallback."
                )
                self._redis = None
            self._redis_init_attempted = True
        return self._redis

    @staticmethod
    def key(*args) -> str:
        raw = "|".join(repr(a) for a in args)
        return hashlib.sha256(raw.encode()).hexdigest()

    async def get(self, key: str) -> Optional[list[Award]]:
        redis_client = await self._get_redis()
        if redis_client is not None:
            try:
                raw = await redis_client.get(f"{REDIS_KEY_PREFIX}{key}")
                if raw:
                    data = json.loads(raw)
                    return [Award(**a) for a in data]
                return None
            except Exception as e:
                logger.warning(f"Redis GET failed ({e}); using memory fallback.")
        # In-memory fallback
        with self._memory_lock:
            entry = self._memory.get(key)
            if not entry:
                return None
            ts, awards = entry
            if time.time() - ts > CACHE_TTL_SECONDS:
                del self._memory[key]
                return None
            return awards

    async def set(self, key: str, awards: list[Award]) -> None:
        redis_client = await self._get_redis()
        if redis_client is not None:
            try:
                payload = json.dumps([asdict(a) for a in awards])
                await redis_client.setex(
                    f"{REDIS_KEY_PREFIX}{key}", CACHE_TTL_SECONDS, payload
                )
                return
            except Exception as e:
                logger.warning(f"Redis SET failed ({e}); using memory fallback.")
        # In-memory fallback
        with self._memory_lock:
            self._memory[key] = (time.time(), awards)


_cache = _USASpendingCache()


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------


class USASpendingClient:
    """
    Async client for USASpending.gov.

    Singleton via get_usaspending_client(). Shares one httpx.AsyncClient across
    the app for connection pooling.
    """

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._client_lock = asyncio.Lock()

    async def _get_http(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            async with self._client_lock:
                if self._client is None or self._client.is_closed:
                    self._client = httpx.AsyncClient(
                        base_url=USASPENDING_BASE_URL,
                        timeout=DEFAULT_TIMEOUT,
                        headers={"Content-Type": "application/json"},
                    )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ----- core query -----

    async def search_awards(
        self,
        naics_code: str,
        agency_name: str = "Department of the Navy",
        keywords: Optional[list[str]] = None,
        years_back: int = 3,
        amount_range: Optional[tuple[float, float]] = None,
        limit: int = 100,
    ) -> list[Award]:
        """
        Search historical federal awards matching the given filters.

        Args:
            naics_code: 6-digit NAICS code (e.g. "541330").
            agency_name: Awarding sub-agency name (e.g. "Department of the Navy").
                         Use "Department of Defense" to broaden to all of DoD.
            keywords: Optional list of keywords matched against award descriptions.
            years_back: How far back to search (default 3 years).
            amount_range: Optional (lower, upper) dollar bounds.
            limit: Max results to return per page.
        """
        cache_key = _cache.key(
            "search", naics_code, agency_name, keywords, years_back, amount_range, limit
        )
        cached = await _cache.get(cache_key)
        if cached is not None:
            logger.debug(f"USASpending cache hit ({len(cached)} awards)")
            return cached

        end_date = datetime.utcnow().strftime("%Y-%m-%d")
        start_date = f"{datetime.utcnow().year - years_back}-01-01"

        body: dict = {
            "filters": {
                "award_type_codes": CONTRACT_AWARD_TYPES,
                "naics_codes": [naics_code],
                "agencies": [
                    {"type": "awarding", "tier": "subtier", "name": agency_name}
                ],
                "time_period": [{"start_date": start_date, "end_date": end_date}],
            },
            "fields": [
                "Award ID",
                "Recipient Name",
                "Award Amount",
                "Description",
                "Start Date",
                "End Date",
                "Awarding Sub Agency",
            ],
            "page": 1,
            "limit": min(limit, MAX_RESULTS_PER_PAGE),
            "sort": "Award Amount",
            "order": "desc",
        }
        if keywords:
            body["filters"]["keywords"] = keywords
        if amount_range:
            body["filters"]["award_amounts"] = [
                {"lower_bound": amount_range[0], "upper_bound": amount_range[1]}
            ]

        http = await self._get_http()
        try:
            resp = await http.post("/search/spending_by_award/", json=body)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error(
                f"USASpending HTTP {e.response.status_code}: "
                f"{e.response.text[:200]}"
            )
            raise USASpendingError(
                f"USASpending search failed: HTTP {e.response.status_code}",
                status_code=e.response.status_code,
            ) from e
        except httpx.HTTPError as e:
            logger.error(f"USASpending request failed: {e}")
            raise USASpendingError(f"USASpending request failed: {e}") from e

        results = resp.json().get("results", [])
        awards = [self._parse_award(r) for r in results]
        logger.info(
            f"USASpending: {len(awards)} awards for NAICS={naics_code} "
            f"agency='{agency_name}' keywords={keywords}"
        )
        await _cache.set(cache_key, awards)
        return awards

    @staticmethod
    def _parse_award(r: dict) -> Award:
        return Award(
            award_id=r.get("Award ID") or "",
            recipient_name=r.get("Recipient Name") or "",
            amount=float(r.get("Award Amount") or 0),
            description=(r.get("Description") or "").strip(),
            start_date=r.get("Start Date"),
            end_date=r.get("End Date"),
            awarding_sub_agency=r.get("Awarding Sub Agency"),
            internal_id=r.get("generated_internal_id") or "",
        )

    # ----- distribution math -----

    @staticmethod
    def compute_distribution(awards: list[Award]) -> Distribution:
        """
        Compute the $/year distribution across a list of awards.

        Only awards with usable duration (≥ MIN_DURATION_YEARS) are counted.
        """
        annual = [a.annual_cost for a in awards if a.annual_cost is not None]
        if not annual:
            return Distribution(0, 0.0, 0.0, 0.0, 0.0, 0.0)
        annual.sort()
        if len(annual) >= 4:
            q = statistics.quantiles(annual, n=4)
            p25, p75 = q[0], q[2]
        else:
            p25, p75 = annual[0], annual[-1]
        return Distribution(
            count=len(annual),
            p25=p25,
            median=statistics.median(annual),
            p75=p75,
            min_val=annual[0],
            max_val=annual[-1],
        )

    # ----- end-to-end PTW suggestion (top-down) -----

    async def suggest_ptw(
        self,
        naics_code: str,
        agency_name: str,
        total_years: int,
        keywords: Optional[list[str]] = None,
        escalation_rate: float = 0.025,
        expected_annual_cost: Optional[float] = None,
        size_filter_range: tuple[float, float] = (0.5, 2.0),
    ) -> PTWSuggestion:
        """
        Top-down PTW estimate from USASpending data.

        Strategy with progressive fallbacks if the agency+keyword combo is sparse:
            1. NAICS + agency + keywords (most specific)
            2. NAICS + agency (drop keywords)
            3. NAICS + entire DoD (drop sub-agency)

        If expected_annual_cost is provided (typically bottom-up year-1 cost from
        the proposal), the comparable pool is additionally narrowed to awards
        whose annualized cost falls within size_filter_range × expected. This
        cuts noise from tiny task orders and giant multi-year programs that
        share a NAICS but operate at a completely different scope. The filter
        is dropped automatically if it would leave fewer than 5 comparables.

        Then:
            - Median $/year of resulting comparables → Year 1 baseline
            - Compounded escalation_rate annual escalation across total_years
            - P25/P75 give the competitive low/high band

        Bottom-up reconciliation lives outside this client (in the PTW router).
        """
        notes: list[str] = []

        awards = await self.search_awards(
            naics_code=naics_code,
            agency_name=agency_name,
            keywords=keywords,
        )
        if len(awards) < 5 and keywords:
            notes.append(
                f"Only {len(awards)} comparables with keywords {keywords}; "
                f"broadened search to all {agency_name} NAICS {naics_code} awards."
            )
            awards = await self.search_awards(
                naics_code=naics_code, agency_name=agency_name
            )
        if len(awards) < 5 and agency_name != "Department of Defense":
            notes.append(
                f"Only {len(awards)} {agency_name} comparables; "
                f"broadened to all DoD-wide NAICS {naics_code} awards."
            )
            awards = await self.search_awards(
                naics_code=naics_code, agency_name="Department of Defense"
            )

        if not awards:
            raise USASpendingError(
                f"No comparable awards found for NAICS {naics_code} / {agency_name}",
                status_code=404,
            )

        # Optional scope-size filter: keep only awards whose annualized cost is
        # within size_filter_range × expected_annual_cost. Drops the giant
        # multi-FTE task orders and tiny single-person mods that share a NAICS
        # but operate at completely different scale. Auto-disabled if filtering
        # would leave fewer than 5 comparables (can't compute a meaningful
        # distribution from too few points).
        if expected_annual_cost and expected_annual_cost > 0:
            lo_mult, hi_mult = size_filter_range
            lower = expected_annual_cost * lo_mult
            upper = expected_annual_cost * hi_mult
            filtered = [
                a for a in awards
                if a.annual_cost is not None and lower <= a.annual_cost <= upper
            ]
            if len(filtered) >= 5:
                notes.append(
                    f"Narrowed to {len(filtered)} of {len(awards)} comparables "
                    f"within {lo_mult:.1f}x–{hi_mult:.1f}x your scope "
                    f"(${lower:,.0f}–${upper:,.0f} per year)."
                )
                awards = filtered
            else:
                notes.append(
                    f"Size filter would leave only {len(filtered)} comparables "
                    f"(need ≥5) — kept unfiltered pool of {len(awards)}."
                )

        dist = self.compute_distribution(awards)
        if dist.count == 0:
            raise USASpendingError(
                "Found awards but none had usable duration data — "
                "cannot compute $/year distribution.",
                status_code=404,
            )

        # Top-down baseline: median $/year, scaled across the PoP with escalation.
        # Note: median spans all team sizes in the comparable pool. Bottom-up
        # reconciliation in the endpoint adjusts for the proposal's actual FTE count.
        def _project(year1_rate: float) -> float:
            return sum(
                year1_rate * ((1 + escalation_rate) ** y) for y in range(total_years)
            )

        suggested = _project(dist.median)
        low = _project(dist.p25)
        high = _project(dist.p75)

        if dist.count >= 15:
            confidence = "high"
        elif dist.count >= 5:
            confidence = "medium"
        else:
            confidence = "low"
            notes.append(
                f"Only {dist.count} comparable awards — treat suggestion as directional."
            )

        methodology = (
            f"Median $/year of {dist.count} comparable {agency_name} contracts "
            f"under NAICS {naics_code} (last 3 years), compounded at "
            f"{escalation_rate * 100:.1f}% annual escalation over {total_years} years."
        )

        top_comparables = [a.to_dict() for a in awards[:10]]

        return PTWSuggestion(
            suggested_ptw=round(suggested, -3),  # nearest $1K
            low=round(low, -3),
            high=round(high, -3),
            methodology=methodology,
            num_comparables=dist.count,
            distribution=dist,
            top_comparables=top_comparables,
            confidence=confidence,
            notes=notes,
        )


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_client_instance: Optional[USASpendingClient] = None
_instance_lock = threading.RLock()


def get_usaspending_client() -> USASpendingClient:
    """Get the singleton USASpending client."""
    global _client_instance
    if _client_instance is None:
        with _instance_lock:
            if _client_instance is None:
                _client_instance = USASpendingClient()
    return _client_instance
