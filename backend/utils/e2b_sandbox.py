"""
One E2B sandbox per pricing-chat session: create, resume, pause, reap.

Model-written Python used to run inside the API process (python_repl_tool),
with the server's environment, files and database access. It now runs in an
E2B microVM. The lifecycle follows Kroolo's enterprise-fastapi
(utils/e2b_sandbox.py), cut down to what PriceIQ needs:

- Hot: during a turn. The box's deadline is absolute (E2B has no idle timer),
  so it is pushed out with set_timeout while the box is in use.
- Warm: E2B_PAUSE_GRACE_S after a turn ends, the box is paused. Pause keeps
  files and memory; the next tool call resumes it with `connect`. Boxes are
  also created with lifecycle on_timeout=pause, as a safety net for turns
  whose explicit pause never ran (restart, client gone).
- Cold: the hourly reaper kills boxes idle for E2B_SANDBOX_MAX_IDLE_DAYS and
  boxes no manifest points at. The next turn starts a fresh box.

The manifest lives in Mongo (`chat_sandboxes`, _id = session_id), not in
process memory, so the Celery reaper can see it and a web restart does not
orphan paused boxes. It also binds the session to the org and user who
created it: session_id comes from the client, so a session owned by someone
else is refused before any E2B call.

Rules carried over from enterprise-fastapi, each learned from a leak:
- Pause and kill by id. connect() resumes (and bills) a paused box first.
- Only a not-found answer from connect means the box is gone. Any other
  failure is SandboxUnavailableError; it is never a reason to create another
  box, which is how conversations lost their files and boxes leaked.
- set_timeout answers not-found for a PAUSED box, so its failure means
  "reconnect", not "gone".
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import tarfile
import time
from datetime import datetime, timedelta, timezone
from inspect import signature
from pathlib import Path
from typing import Any, Dict, Optional

from e2b import SandboxQuery
from e2b_code_interpreter import AsyncSandbox

from app.settings import settings
from auth.database import get_mongodb_client

logger = logging.getLogger(__name__)

_TEMPLATE: Optional[str] = settings.E2B_TEMPLATE_ID or None  # None = stock code-interpreter
_TEMPLATE_KEY = _TEMPLATE or "default"
_SANDBOX_TIMEOUT_S = settings.E2B_SANDBOX_TIMEOUT_S
_KEEPALIVE_S = 300
_CONNECT_RETRY_S = 30
_UNREACHABLE_RETIRE_S = 900
_ORPHAN_MIN_AGE_S = 3600

_SKILLS_DIR = Path(__file__).resolve().parent.parent / "agent" / "skills"
SANDBOX_SKILLS_DIR = "/home/user/skills"
_SKILLS_ARCHIVE = "/home/user/.priceiq/skills.tgz"

# Which database owns a box. QA and production may share one E2B team; the
# orphan sweep only judges boxes tagged with its own store.
_STORE = hashlib.sha256(
    f"{settings.MONGODB_URL}|{settings.MONGODB_DATABASE}".encode()
).hexdigest()[:16]
_APP_TAG = "priceiq"

# The pause method was renamed between SDK lines (beta_pause -> pause). Resolve
# it once and say loudly if neither exists: a missing method used to be
# swallowed, nothing paused, and every box died at its timeout with its files.
_PAUSE_ATTR: Optional[str] = next(
    (name for name in ("pause", "beta_pause") if hasattr(AsyncSandbox, name)), None
)
_LIFECYCLE_SUPPORTED = "lifecycle" in signature(AsyncSandbox.create).parameters
_BETA_CREATE_SUPPORTED = hasattr(AsyncSandbox, "beta_create")
if _PAUSE_ATTR is None:
    logger.error("[E2B] this e2b SDK exposes no pause API; sandboxes will die at their timeout")

if not settings.E2B_API_KEY:
    logger.warning("[E2B] E2B_API_KEY is not set; the pricing agent's Python tool is disabled")


def is_configured() -> bool:
    return bool(settings.E2B_API_KEY)


def _api() -> Dict[str, Any]:
    # Passed per call rather than via os.environ, so the key never reaches a
    # subprocess environment on this host.
    return {"api_key": settings.E2B_API_KEY}


class SandboxUnavailableError(RuntimeError):
    """The session's sandbox cannot be used right now. Transient: retry, don't rewrite code."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            f"the code sandbox is temporarily unavailable ({reason}). This is an "
            f"infrastructure problem, not a problem with the code: retry once, and do "
            f"not rewrite anything because of it."
        )


class SandboxOwnershipError(RuntimeError):
    """The session id belongs to a different org or user."""


# A ContextVar default must never become a shared key.
_INVALID_SESSIONS = {"", "default", "none", "null"}


def _valid_session(session_id: Optional[str]) -> Optional[str]:
    sid = (session_id or "").strip()
    return None if sid.lower() in _INVALID_SESSIONS else sid


def _is_gone(exc: BaseException) -> bool:
    """The control plane says the box does not exist (only trust this from connect/kill/pause)."""
    return type(exc).__name__ in ("SandboxNotFoundException", "NotFoundException")


def session_storage_id(session_id: str) -> str:
    """Server-side id for a session in storage keys, instead of the client-chosen string."""
    return hashlib.sha256(session_id.encode()).hexdigest()[:16]


# ── Manifest (Mongo) ─────────────────────────────────────────────────────

_collection = None


def _coll():
    global _collection
    if _collection is None:
        coll = get_mongodb_client().get_database()["chat_sandboxes"]
        try:
            coll.create_index("last_used_at")
            coll.create_index("sandbox_id")
        except Exception:  # noqa: BLE001 - index creation is best-effort
            pass
        _collection = coll
    return _collection


async def _claim(session_id: str, org_id: str, user_id: str) -> Dict[str, Any]:
    """Load the manifest, creating it for this org/user if it doesn't exist.

    The upsert is atomic, so whoever creates the manifest owns the session;
    a later caller from another org or user is refused.
    """
    def _do() -> Dict[str, Any]:
        from pymongo import ReturnDocument

        return _coll().find_one_and_update(
            {"_id": session_id},
            {"$setOnInsert": {
                "org_id": org_id,
                "user_id": user_id,
                "sandbox_id": None,
                "created_at": datetime.now(timezone.utc),
                "store": _STORE,
            }},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )

    doc = await asyncio.to_thread(_do)
    if doc.get("org_id") != org_id or doc.get("user_id") != user_id:
        raise SandboxOwnershipError("this chat session belongs to another user")
    return doc


async def _load(session_id: str) -> Optional[Dict[str, Any]]:
    return await asyncio.to_thread(_coll().find_one, {"_id": session_id})


async def _update(session_id: str, fields: Dict[str, Any], extra: Optional[Dict[str, Any]] = None) -> None:
    update: Dict[str, Any] = {"$set": fields}
    if extra:
        update.update(extra)
    await asyncio.to_thread(_coll().update_one, {"_id": session_id}, update)


async def _forget_box(session_id: str, sandbox_id: str) -> None:
    """The box is gone or retired: keep the manifest (ownership), drop the box."""
    await _update(
        session_id,
        {"sandbox_id": None, "skills_version": None, "paused_ts": None, "unreachable_since": None},
        {"$addToSet": {"retired": sandbox_id}},
    )


# ── Per-process handles ──────────────────────────────────────────────────


class _Handle:
    __slots__ = ("sbx", "sandbox_id", "extended_at", "acquired_at")

    def __init__(self, sbx: AsyncSandbox) -> None:
        self.sbx = sbx
        self.sandbox_id = sbx.sandbox_id
        self.extended_at = time.monotonic()
        self.acquired_at = time.time()


_handles: Dict[str, _Handle] = {}
_locks: Dict[str, asyncio.Lock] = {}
# Hard refs so the event loop can't GC a scheduled pause mid-flight.
_bg_tasks: "set[asyncio.Task]" = set()


def _lock_for(session_id: str) -> asyncio.Lock:
    lock = _locks.get(session_id)
    if lock is None:
        lock = _locks[session_id] = asyncio.Lock()
    return lock


# ── E2B calls ────────────────────────────────────────────────────────────


async def _create_sandbox(session_id: str, doc: Dict[str, Any]) -> AsyncSandbox:
    kwargs: Dict[str, Any] = {
        "timeout": _SANDBOX_TIMEOUT_S,
        "allow_internet_access": settings.E2B_ALLOW_INTERNET,
        "metadata": {
            "app": _APP_TAG,
            "store": _STORE,
            "session": session_storage_id(session_id),
            "org_id": doc["org_id"],
            "user_id": doc["user_id"],
            # E2B's started_at resets on every resume, so it can't age a box.
            "created_at": str(int(time.time())),
        },
        **_api(),
    }
    if _TEMPLATE:
        kwargs["template"] = _TEMPLATE
    if _LIFECYCLE_SUPPORTED:
        return await AsyncSandbox.create(lifecycle={"on_timeout": "pause"}, **kwargs)
    if _BETA_CREATE_SUPPORTED:
        return await AsyncSandbox.beta_create(auto_pause=True, **kwargs)
    return await AsyncSandbox.create(**kwargs)


async def _kill_quietly(sandbox_id: str) -> None:
    try:
        await AsyncSandbox.kill(sandbox_id, **_api())
    except Exception as exc:  # noqa: BLE001
        if not _is_gone(exc):
            logger.warning("[E2B] kill %s failed: %s", sandbox_id, exc)


async def _connect_or_create(session_id: str, doc: Dict[str, Any]) -> AsyncSandbox:
    box = doc.get("sandbox_id")

    if box and doc.get("template") != _TEMPLATE_KEY:
        # Built from another template: its libraries differ, so don't resume it.
        logger.info("[E2B] %s: template changed, retiring %s", session_id, box)
        await _kill_quietly(box)
        await _forget_box(session_id, box)
        box = None

    if box:
        deadline = time.monotonic() + _CONNECT_RETRY_S
        while True:
            try:
                sbx = await AsyncSandbox.connect(box, timeout=_SANDBOX_TIMEOUT_S, **_api())
                if doc.get("unreachable_since"):
                    await _update(session_id, {"unreachable_since": None})
                return sbx
            except Exception as exc:  # noqa: BLE001
                if _is_gone(exc):
                    logger.info("[E2B] %s: box %s is gone, starting a new one", session_id, box)
                    await _forget_box(session_id, box)
                    break
                if time.monotonic() >= deadline:
                    since = doc.get("unreachable_since") or time.time()
                    if time.time() - since >= _UNREACHABLE_RETIRE_S:
                        logger.warning("[E2B] %s: %s unreachable for %ss, replacing it",
                                       session_id, box, int(time.time() - since))
                        await _kill_quietly(box)
                        await _forget_box(session_id, box)
                        break
                    await _update(session_id, {"unreachable_since": since})
                    raise SandboxUnavailableError(f"could not reach the sandbox: {exc}") from exc
                await asyncio.sleep(1)

    sbx = await _create_sandbox(session_id, doc)
    try:
        await _update(session_id, {
            "sandbox_id": sbx.sandbox_id,
            "template": _TEMPLATE_KEY,
            "skills_version": None,
            "paused_ts": None,
            "unreachable_since": None,
        })
    except Exception:
        # A box no manifest points at would be billed until the orphan sweep.
        await _kill_quietly(sbx.sandbox_id)
        raise
    logger.info("[E2B] %s: created %s (template=%s)", session_id, sbx.sandbox_id, _TEMPLATE_KEY)
    return sbx


async def _keepalive(handle: _Handle) -> bool:
    """Push the deadline out at most every _KEEPALIVE_S. False = reconnect needed."""
    if time.monotonic() - handle.extended_at < _KEEPALIVE_S:
        return True
    try:
        await AsyncSandbox.set_timeout(handle.sandbox_id, _SANDBOX_TIMEOUT_S, **_api())
        handle.extended_at = time.monotonic()
        return True
    except Exception as exc:  # noqa: BLE001 - not-found here also means "paused"
        logger.info("[E2B] keepalive for %s failed (%s); reconnecting", handle.sandbox_id, exc)
        return False


# ── Skill scripts ────────────────────────────────────────────────────────
# The agent's skills (xlsx recalc, LibreOffice conversion, ...) used to be run
# on this host by agno's get_skill_script. They now run in the sandbox, next to
# the files they work on, so the scripts are shipped into every box.

_skills_bundle: Optional[tuple[str, bytes]] = None


def _skills_archive() -> Optional[tuple[str, bytes]]:
    global _skills_bundle
    if _skills_bundle is None:
        if not _SKILLS_DIR.is_dir():
            return None
        files = sorted(
            p for p in _SKILLS_DIR.rglob("*")
            if p.is_file() and "__pycache__" not in p.parts
        )
        digest = hashlib.sha256()
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            for path in files:
                rel = path.relative_to(_SKILLS_DIR).as_posix()
                data = path.read_bytes()
                digest.update(rel.encode() + b"\0" + data)
                info = tarfile.TarInfo(rel)
                info.size = len(data)
                info.mode = 0o755 if path.suffix in (".py", ".sh") else 0o644
                tar.addfile(info, io.BytesIO(data))
        _skills_bundle = (digest.hexdigest()[:16], buf.getvalue())
    return _skills_bundle


async def _ensure_skills(session_id: str, sbx: AsyncSandbox, doc: Dict[str, Any]) -> None:
    bundle = _skills_archive()
    if bundle is None:
        return
    version, data = bundle
    if doc.get("skills_version") == version and doc.get("sandbox_id") == sbx.sandbox_id:
        return
    await sbx.files.write(_SKILLS_ARCHIVE, data)
    await sbx.commands.run(
        f"rm -rf {SANDBOX_SKILLS_DIR} && mkdir -p {SANDBOX_SKILLS_DIR} && "
        f"tar -xzf {_SKILLS_ARCHIVE} -C {SANDBOX_SKILLS_DIR} && rm -f {_SKILLS_ARCHIVE}",
        timeout=60,
    )
    await _update(session_id, {"skills_version": version})


# ── Public API ───────────────────────────────────────────────────────────


async def get_or_resume_sandbox(session_id: str, *, org_id: str, user_id: str) -> AsyncSandbox:
    """The session's sandbox: the cached handle, a resumed box, or a new one.

    Raises SandboxOwnershipError if the session belongs to someone else and
    SandboxUnavailableError for anything transient.
    """
    if not is_configured():
        raise SandboxUnavailableError("E2B is not configured on this server")
    sid = _valid_session(session_id)
    if sid is None:
        raise SandboxUnavailableError("no chat session id")
    if not org_id or not user_id:
        raise SandboxUnavailableError("no signed-in user for this chat")

    async with _lock_for(sid):
        doc = await _claim(sid, str(org_id), str(user_id))
        handle = _handles.get(sid)
        if handle is not None and (
            doc.get("sandbox_id") != handle.sandbox_id
            or (doc.get("paused_ts") or 0) >= handle.acquired_at
        ):
            # Paused or replaced by another process since this handle was made.
            _handles.pop(sid, None)
            handle = None
        if handle is not None and not await _keepalive(handle):
            _handles.pop(sid, None)
            handle = None
        if handle is None:
            sbx = await _connect_or_create(sid, doc)
            handle = _handles[sid] = _Handle(sbx)
            doc = await _load(sid) or doc
        await _ensure_skills(sid, handle.sbx, doc)
        await _update(sid, {
            "last_used_at": datetime.now(timezone.utc),
            "last_used_ts": time.time(),
            "paused_ts": None,
        })
        return handle.sbx


async def claim_session(session_id: str, *, org_id: str, user_id: str) -> str:
    """Bind the session to this org/user (first caller wins) without touching E2B.

    For tools that read per-session state (stored documents) without needing a box.
    Raises SandboxOwnershipError for someone else's session.
    """
    sid = _valid_session(session_id)
    if sid is None:
        raise SandboxUnavailableError("no chat session id")
    if not org_id or not user_id:
        raise SandboxUnavailableError("no signed-in user for this chat")
    await _claim(sid, str(org_id), str(user_id))
    return sid


def evict_handle(session_id: Optional[str]) -> None:
    """Drop this process's cached handle after a failed call, so the next call
    reconnects (and learns whether the box is gone) instead of reusing it."""
    sid = _valid_session(session_id)
    if sid:
        _handles.pop(sid, None)


def pause_session_sandbox(session_id: Optional[str]) -> None:
    """Schedule a pause E2B_PAUSE_GRACE_S from now; skipped if the box is used again.

    Call at the end of every chat turn. Cheap when the turn never touched a
    sandbox: only sessions with a live handle in this process are scheduled.
    """
    sid = _valid_session(session_id)
    if sid is None or not is_configured() or sid not in _handles:
        return
    requested_at = time.time()
    try:
        task = asyncio.get_running_loop().create_task(_pause_later(sid, requested_at))
    except RuntimeError:
        return
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)


async def _pause_later(session_id: str, requested_at: float) -> None:
    await asyncio.sleep(settings.E2B_PAUSE_GRACE_S)
    box: Optional[str] = None
    try:
        async with _lock_for(session_id):
            doc = await _load(session_id)
            box = (doc or {}).get("sandbox_id")
            if not box or doc.get("paused_ts"):
                return
            if (doc.get("last_used_ts") or 0) > requested_at:
                return  # used again since the turn ended
            # Record the pause before making it: a process holding a handle
            # sees paused_ts and reconnects instead of using a paused box.
            await _update(session_id, {"paused_ts": time.time()})
            _handles.pop(session_id, None)
            await pause_by_id(box)
            logger.info("[E2B] %s: paused %s", session_id, box)
    except Exception as exc:  # noqa: BLE001
        if box and _is_gone(exc):
            await _forget_box(session_id, box)
        else:
            # on_timeout=pause still catches it at the deadline.
            logger.warning("[E2B] %s: pause failed: %s", session_id, exc)


async def pause_by_id(sandbox_id: str) -> None:
    """Pause without connecting (connect would resume and bill it first)."""
    if _PAUSE_ATTR is None:
        raise RuntimeError("e2b SDK exposes no pause API")
    await getattr(AsyncSandbox, _PAUSE_ATTR)(sandbox_id, **_api())


async def kill_session_sandbox(session_id: str) -> None:
    """Kill the session's box(es) and keep the manifest so ownership stays bound."""
    doc = await _load(session_id)
    if not doc:
        return
    _handles.pop(session_id, None)
    for box in {doc.get("sandbox_id"), *(doc.get("retired") or [])}:
        if box:
            await _kill_quietly(box)
    await _update(session_id, {"sandbox_id": None, "skills_version": None, "retired": []})


# ── Reaper (Celery beat, hourly) ─────────────────────────────────────────


async def reap_idle_sandboxes(max_idle_days: Optional[int] = None) -> int:
    """Kill boxes unused for max_idle_days. Manifests stay, so ownership survives."""
    if not is_configured():
        return 0
    days = max_idle_days if max_idle_days is not None else settings.E2B_SANDBOX_MAX_IDLE_DAYS
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    docs = await asyncio.to_thread(
        lambda: list(_coll().find(
            {"sandbox_id": {"$ne": None}, "last_used_at": {"$lt": cutoff}},
            {"_id": 1, "sandbox_id": 1},
        ))
    )
    reaped = 0
    for doc in docs:
        await _kill_quietly(doc["sandbox_id"])
        await _forget_box(doc["_id"], doc["sandbox_id"])
        reaped += 1
    if reaped:
        logger.info("[E2B] reaped %d idle sandbox(es)", reaped)
    return reaped


async def reap_orphan_sandboxes(min_age_s: int = _ORPHAN_MIN_AGE_S) -> int:
    """Kill this store's boxes that no manifest points at (lost races, failed writes)."""
    if not is_configured():
        return 0
    known = set(await asyncio.to_thread(
        lambda: [d["sandbox_id"] for d in _coll().find(
            {"sandbox_id": {"$ne": None}}, {"sandbox_id": 1})]
    ))
    paginator = AsyncSandbox.list(
        query=SandboxQuery(metadata={"app": _APP_TAG, "store": _STORE}), limit=100, **_api()
    )
    now = time.time()
    killed = 0
    while paginator.has_next:
        for info in await paginator.next_items():
            if info.sandbox_id in known:
                continue
            try:
                created = int((info.metadata or {}).get("created_at", "0"))
            except ValueError:
                created = 0
            if created and now - created < min_age_s:
                continue  # may be mid-creation; its manifest write is still coming
            await _kill_quietly(info.sandbox_id)
            killed += 1
    if killed:
        logger.info("[E2B] killed %d orphaned sandbox(es)", killed)
    return killed
