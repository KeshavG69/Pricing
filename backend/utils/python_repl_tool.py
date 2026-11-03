"""
Python tool for the pricing agent — runs in the session's E2B sandbox.

Model-written code used to run inside this API process (LangChain PythonREPL
exec), with the server's environment, files, database clients and other
tenants' state in reach. It now runs in an E2B microVM per chat session
(utils/e2b_sandbox.py), ported from Kroolo's enterprise-fastapi:

- The code is written into the sandbox and executed by sandbox/runner.py,
  which prints one machine-readable result line. Failure is read from that
  line, not by searching the output for "Error", and comes back as
  {type, message, traceback_tail} for the model to fix.
- Each call is a fresh Python process. Only files persist between calls (and
  across pause/resume), in the working directory /home/user/out.
- There is no fallback to running code on this host. Without E2B configured
  the tool reports that it is unavailable.
"""

from __future__ import annotations

import contextvars
import hashlib
import json
import logging
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, Optional

from agno.tools import tool
from e2b.exceptions import TimeoutException
from e2b.sandbox.commands.command_handle import CommandExitException

from app.settings import settings

logger = logging.getLogger(__name__)

RESULT_MARKER = "@@PRICEIQ_RESULT@@"
OUT_DIR = "/home/user/out"
_SCRIPT_DIR = "/home/user/scripts"
_RUNNER_PATH = "/home/user/.priceiq/runner.py"
_RUNNER_SOURCE = (Path(__file__).resolve().parent.parent / "sandbox" / "runner.py").read_text()
# The custom template links its interpreter here (see e2b.Dockerfile); the
# stock template only has python3 on PATH.
_RUN_CMD = (
    'P=/opt/priceiq/python; [ -x "$P" ] || P=python3; '
    f'"$P" {_RUNNER_PATH} {{script}}'
)

# Session and identity are read from ContextVars at runtime so tools don't
# have to pass them. The router sets them from the bearer token.
_current_session_id = contextvars.ContextVar("session_id", default="default")
_current_org_id = contextvars.ContextVar("org_id", default="")
_current_user_id = contextvars.ContextVar("user_id", default="")

# Code that already failed, per session, so the same broken script isn't re-run.
_failed: "OrderedDict[str, Dict[str, str]]" = OrderedDict()
_MAX_SESSIONS = 200


def get_session_id() -> str:
    return _current_session_id.get()


def set_session_id(session_id: str, org_id: str = "", user_id: str = "") -> None:
    """Bind the chat session and its owner for the tools. Call before running the agent."""
    _current_session_id.set(session_id or "default")
    _current_org_id.set(str(org_id or ""))
    _current_user_id.set(str(user_id or ""))


def get_session_context() -> Dict[str, str]:
    return {
        "session_id": _current_session_id.get(),
        "org_id": _current_org_id.get(),
        "user_id": _current_user_id.get(),
    }


async def sandbox_for_this_session():
    """The current session's sandbox, created on first use."""
    from utils.e2b_sandbox import get_or_resume_sandbox

    ctx = get_session_context()
    return await get_or_resume_sandbox(
        ctx["session_id"], org_id=ctx["org_id"], user_id=ctx["user_id"]
    )


def cleanup_session(session_id: str) -> None:
    """Forget what failed in this session. The sandbox itself is paused/reaped by e2b_sandbox."""
    _failed.pop(session_id, None)


def _remember_failure(session_id: str, digest: str, summary: str) -> None:
    bucket = _failed.pop(session_id, {})
    bucket[digest] = summary
    if len(bucket) > 16:
        bucket.pop(next(iter(bucket)))
    _failed[session_id] = bucket
    while len(_failed) > _MAX_SESSIONS:
        _failed.popitem(last=False)


def _digest(code: str) -> str:
    return hashlib.sha256(" ".join((code or "").split()).encode()).hexdigest()[:16]


def _parse_json(output: str) -> Optional[Dict[str, Any]]:
    try:
        parsed = json.loads((output or "").strip())
        return parsed if isinstance(parsed, dict) else None
    except (ValueError, json.JSONDecodeError):
        return None


def _unavailable(error: str, note: str) -> Dict[str, Any]:
    return {"success": False, "output": "", "data": None, "error": error, "note": note}


@tool(stop_after_tool_call=False)
async def python_repl_tool(code: str, description: str = "") -> Dict[str, Any]:
    """
    🐍 Execute Python code to compute pricing figures from the proposal state.

    The code runs in an isolated sandbox. EACH CALL IS A FRESH PYTHON PROCESS:
    variables and imports do NOT carry over between calls, so re-import and
    re-parse the proposal state in every call. Files DO carry over: the working
    directory is /home/user/out, and anything saved there stays for the rest of
    the chat (save with a plain filename like "summary.xlsx").

    USE THIS when the user asks for a computation that isn't pre-computed in
    the <proposal_state> block — e.g. "what's the weighted-average FBLR across
    all senior positions?", "show me the top 5 most expensive positions by
    year-3 cost", "compare prime vs sub labor share as percentages".

    HOW TO USE:
    1. Parse the <proposal_state> JSON into a Python dict.
    2. Implement the formula from FORMULAS.md using the raw inputs.
    3. Print the result.

    CANONICAL FORMULAS (all in FORMULAS.md):
    - BLS FBLR: dl + fringe + oh + ga + fee (fee-inclusive)
    - GSA cost: gsaRate × (1 − discount) × hours
    - Travel: amount × (1 + ga_rate)
    - ODC: amount × (1 + smh_rate)
    - Sub billable: baseRate × (1 + smh + ga_passthrough + sub_fee)

    DOCUMENT GENERATION (write a file → s3_upload_tool returns a download URL):
    - reportlab     → PDF reports (SimpleDocTemplate, Paragraph, Table)
    - python-pptx   → PowerPoint decks (from pptx import Presentation)
    - python-docx   → Word documents (from docx import Document)
    - openpyxl      → Excel workbooks (from openpyxl import Workbook)
    - xlsxwriter    → Excel with charts/formatting
    - matplotlib    → PNG/SVG chart images
    Save with a simple filename ("pricing_summary.pdf"), then call
    s3_upload_tool(filename="pricing_summary.pdf") to get a shareable URL.

    SKILL SCRIPTS: the scripts that skills mention live in the sandbox at
    /home/user/skills/<skill>/scripts/ — run them from this tool, e.g.
    subprocess.run(["python3", "/home/user/skills/xlsx/scripts/recalc.py",
    "summary.xlsx"], check=True).

    GROUND RULES:
    - Do NOT invent numbers. Every figure must come from the state block.
    - For simple reads (already in the state), SKIP this tool and quote directly.
    - Use print() — the tool returns what is printed.
    - Format money as $1,234,567.89, rates as 7.11%, hours as 1,920.

    EXAMPLE — weighted-average FBLR across a subset:
    ```python
    import json
    state = json.loads(STATE)  # STATE is the proposal_state you pulled from context
    positions = [p for p in state["positions"] if p["location_type"] == "On-Site"]
    total_cost  = sum(p["total_amount"] for p in positions)
    total_hours = sum(p["total_hours"]  for p in positions)
    avg_fblr = total_cost / total_hours if total_hours else 0
    print(json.dumps({"avg_fblr": round(avg_fblr, 2), "positions": len(positions)}))
    ```

    Args:
        code: Python code to execute. Must include print() statements.
        description: Short past-tense description, e.g. "Computed avg FBLR for on-site".

    Returns:
        Dict with success, output, data (parsed JSON output), files, error.
    """
    from utils.e2b_sandbox import SandboxOwnershipError, SandboxUnavailableError, evict_handle

    from utils.e2b_sandbox import is_configured

    if not is_configured():
        return _unavailable(
            "Python execution is not available on this server",
            "Answer without running code: quote figures from the proposal state.",
        )
    session_id = get_session_id()
    if not (code or "").strip():
        return _unavailable("no code was given to run", "Send the Python to run.")

    digest = _digest(code)
    previous = (_failed.get(session_id) or {}).get(digest)
    if previous:
        return _unavailable(
            f"this exact code already failed in this conversation: {previous}",
            "Change the code before running it again. Re-running it unchanged will fail the same way.",
        )

    started = time.monotonic()
    try:
        sbx = await sandbox_for_this_session()
        script_path = f"{_SCRIPT_DIR}/s{digest}.py"
        await sbx.files.write_files([
            {"path": _RUNNER_PATH, "data": _RUNNER_SOURCE},
            {"path": script_path, "data": code},
        ])
        try:
            result = await sbx.commands.run(
                _RUN_CMD.format(script=script_path), timeout=settings.E2B_EXEC_TIMEOUT_S
            )
        except CommandExitException as exited:
            # The runner exits 1 when the code raised; its result line is still on stdout.
            result = exited
        stdout = result.stdout or ""
    except SandboxOwnershipError as exc:
        return _unavailable(str(exc), "Do not retry.")
    except SandboxUnavailableError as exc:
        return _unavailable(str(exc), "Retry once; do not rewrite the code because of this.")
    except TimeoutException as exc:
        if type(exc) is TimeoutException:
            return _unavailable(
                f"the code ran longer than {settings.E2B_EXEC_TIMEOUT_S}s and was stopped",
                "Do less work per call, or split it into steps that save to files.",
            )
        evict_handle(session_id)
        logger.error("[python_repl] sandbox failure: %s", exc, exc_info=True)
        return _unavailable(
            f"the sandbox could not run the code: {str(exc)[:300]}",
            "This is an infrastructure failure, not a bug in your code. Retry once.",
        )
    except Exception as exc:  # noqa: BLE001 - a sandbox failure is a result, not a crash
        evict_handle(session_id)
        logger.error("[python_repl] sandbox failure: %s", exc, exc_info=True)
        return _unavailable(
            f"the sandbox could not run the code: {str(exc)[:300]}",
            "This is an infrastructure failure, not a bug in your code. Retry once.",
        )

    line = next((l for l in stdout.splitlines() if l.startswith(RESULT_MARKER)), None)
    if line is None:
        # The runner always prints its result line, so it was killed (memory or time).
        return {
            "success": False,
            "output": stdout[-2000:],
            "data": None,
            "error": "the code did not finish — it was killed, most likely for running out of memory or time",
            "note": "Work on less data at once.",
        }

    envelope = json.loads(line[len(RESULT_MARKER):])
    elapsed = round(time.monotonic() - started, 2)
    out = envelope.get("stdout_tail") or ""
    files = envelope.get("files") or []

    if not envelope.get("ok"):
        error = envelope.get("error") or {}
        summary = f"{error.get('type', 'Error')}: {str(error.get('message', ''))[:200]}"
        _remember_failure(session_id, digest, summary)
        logger.info("[python_repl] %s failed in %.2fs: %s", session_id, elapsed, summary)
        return {
            "success": False,
            "output": out[-3000:],
            "data": None,
            "error": summary,
            "traceback": error.get("traceback_tail"),
            "note": "Fix the line the traceback names. Unchanged code will be refused.",
        }

    logger.info("[python_repl] %s ok in %.2fs (%d file(s))", session_id, elapsed, len(files))
    payload: Dict[str, Any] = {
        "success": True,
        "output": out[-6000:] or "(no output)",
        "data": _parse_json(out),
        "error": None,
    }
    if files:
        payload["files"] = files
        payload["note"] = (
            "These files are in the sandbox, which the user cannot see. To deliver one, "
            "call s3_upload_tool with its name."
        )
        await _note_document_side_effects(session_id, files)
    return payload


async def _note_document_side_effects(session_id: str, files) -> None:
    """Mark a build_document document stale when a script writes over its file.

    Specs generate files; files do not generate specs. Once a script has changed the
    file, an edit from the stored spec would silently discard that change.
    """
    try:
        from utils import docgen_store

        written = {str(f.get("name", "")).rsplit("/", 1)[-1] for f in files}
        for doc in await docgen_store.list_documents(session_id):
            if doc.get("filename") in written:
                await docgen_store.mark_stale(session_id, doc["slug"], "python_repl_tool")
    except Exception as exc:  # noqa: BLE001 - bookkeeping must not fail the run
        logger.debug("[python_repl] could not check document staleness: %s", exc)
