"""
Request rate limiting as FastAPI dependencies.

Usage:
    @router.post("/login", dependencies=[Depends(rate_limit_ip("login", "10/minute;50/hour"))])
    @router.post("/ask",   dependencies=[Depends(rate_limit_user("help_ask", "20/minute;300/day"))])

- rate_limit_ip   keys on the client IP (for routes callable without a token).
- rate_limit_user keys on the authenticated user id (resolves get_current_user,
  which FastAPI caches per request, so a handler that also depends on it does
  not pay for a second lookup).

Counters are fixed-window and kept in process memory. The backend runs one
uvicorn process per instance (start.sh), so limits apply per instance; if the
web service is scaled to several replicas, each replica counts separately.
"""

import re
import threading
import time
from typing import Dict, List, Tuple

from fastapi import Depends, HTTPException, Request, status

from app.settings import settings
from auth.dependencies import get_current_user

_WINDOWS = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}
_LIMIT_RE = re.compile(r"^\s*(\d+)\s*/\s*(second|minute|hour|day)\s*$")

_lock = threading.Lock()
_counters: Dict[Tuple[str, str, int, int], int] = {}
_last_sweep = 0.0


def _parse(limits: str) -> List[Tuple[int, int]]:
    parsed = []
    for part in limits.split(";"):
        m = _LIMIT_RE.match(part)
        if not m:
            raise ValueError(f"Invalid rate limit spec: {part!r}")
        parsed.append((int(m.group(1)), _WINDOWS[m.group(2)]))
    return parsed


def _sweep(now: float) -> None:
    """Drop counters for windows that have already ended (called under _lock)."""
    global _last_sweep
    if now - _last_sweep < 60:
        return
    _last_sweep = now
    for key in [k for k in _counters if (k[3] + 1) * k[2] <= now]:
        del _counters[key]


def _hit(scope: str, ident: str, limits: List[Tuple[int, int]]) -> int:
    """Count one request; return 0 if allowed, else seconds until it may retry."""
    now = time.time()
    with _lock:
        _sweep(now)
        retry_after = 0
        keys = []
        for max_requests, window in limits:
            window_index = int(now // window)
            key = (scope, ident, window, window_index)
            keys.append(key)
            if _counters.get(key, 0) >= max_requests:
                retry_after = max(retry_after, int((window_index + 1) * window - now) + 1)
        if retry_after:
            return retry_after
        for key in keys:
            _counters[key] = _counters.get(key, 0) + 1
        return 0


def client_ip(request: Request) -> str:
    """
    Client IP as seen by the trusted proxy chain.

    Prefers the header the edge proxy overwrites with the client address
    (RATE_LIMIT_CLIENT_IP_HEADER, X-Real-IP on Railway). Otherwise, with N
    trusted proxies, the Nth entry from the right of X-Forwarded-For was
    written by our own edge; anything further left is client-controlled.
    """
    header = settings.RATE_LIMIT_CLIENT_IP_HEADER
    if header:
        value = (request.headers.get(header) or "").split(",")[0].strip()
        if value:
            return value
    hops = settings.RATE_LIMIT_TRUSTED_PROXY_HOPS
    forwarded = request.headers.get("x-forwarded-for")
    if hops > 0 and forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            return parts[-min(hops, len(parts))]
    return request.client.host if request.client else "unknown"


def _raise_limited(retry_after: int) -> None:
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many requests. Please try again later.",
        headers={"Retry-After": str(retry_after)},
    )


def rate_limit_ip(scope: str, limits: str):
    """Dependency limiting requests per client IP."""
    parsed = _parse(limits)

    async def dependency(request: Request) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        retry_after = _hit(scope, f"ip:{client_ip(request)}", parsed)
        if retry_after:
            _raise_limited(retry_after)

    return dependency


def rate_limit_user(scope: str, limits: str):
    """Dependency limiting requests per authenticated user (requires a bearer token)."""
    parsed = _parse(limits)

    async def dependency(current_user: dict = Depends(get_current_user)) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        retry_after = _hit(scope, f"user:{current_user['_id']}", parsed)
        if retry_after:
            _raise_limited(retry_after)

    return dependency
