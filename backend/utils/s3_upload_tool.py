"""
S3 upload tool — copies a file the agent generated in its E2B sandbox to
iDrive e2 and returns a presigned URL the user can click.

Adapted from Kroolo's enterprise-fastapi/utils/s3_upload_tool.py, retargeted
to PriceIQ's iDrive S3-compatible storage.

The file is read from the sandbox's working directory only, by bare name:
the model-supplied filename is reduced to a basename, so it cannot name a
file anywhere else. (It used to join the name onto a directory on this host,
which let a path like ../../app/.env be uploaded and then deleted.) The
storage key is built from server-side ids, not the client's session id.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import uuid
from typing import Any, Dict

from agno.tools import tool

from client.idrive_storage import get_idrive_storage
from utils.helpers import safe_filename
from utils.python_repl_tool import OUT_DIR, get_session_context, sandbox_for_this_session

logger = logging.getLogger(__name__)

_MAX_UPLOAD_BYTES = 80 * 1024 * 1024


def _failure(filename: str, error: str) -> Dict[str, Any]:
    return {"success": False, "url": None, "filename": filename, "error": error}


@tool(stop_after_tool_call=False)
async def s3_upload_tool(filename: str, description: str = "") -> Dict[str, Any]:
    """
    📤 Upload a file generated in the Python sandbox to iDrive cloud storage and
    return a shareable presigned URL.

    USE THIS after generating a PDF / PPTX / DOCX / XLSX / image / CSV in
    `python_repl_tool`. The user gets a clickable link to download the file.

    HOW IT WORKS:
    - python_repl_tool's working directory (/home/user/out) is in a sandbox the
      user cannot see.
    - This tool finds the file there by name, uploads it to iDrive e2, and
      returns a presigned URL valid for 7 days.

    WORKFLOW:
    1. In `python_repl_tool`, generate the file with a simple filename
       (e.g. "pricing_summary.pdf"). Do NOT include any directory prefix.
    2. Call this tool with the same filename.
    3. Quote the returned `url` to the user as a markdown link.

    EXAMPLE — generate a PDF and upload:
    ```
    # Step 1 (python_repl_tool):
    from reportlab.pdfgen import canvas
    c = canvas.Canvas("pricing_summary.pdf")
    c.drawString(100, 750, "Pricing Summary")
    c.drawString(100, 730, f"Grand Total: $3,016,285.83")
    c.save()
    print("done")

    # Step 2 (s3_upload_tool):
    s3_upload_tool(filename="pricing_summary.pdf",
                   description="Generated pricing summary PDF")
    ```

    Args:
        filename: Name of the file in the working directory (no path).
        description: Short past-tense description of what the file contains.

    Returns:
        Dict with `success`, `url` (presigned, 7-day), `filename`, `error`.
    """
    from utils.e2b_sandbox import SandboxOwnershipError, SandboxUnavailableError, session_storage_id

    name = safe_filename(filename, default="")
    if not name:
        return _failure(filename, "Give the file's name, e.g. 'pricing_summary.pdf'.")
    path = f"{OUT_DIR}/{name}"

    try:
        sbx = await sandbox_for_this_session()
        try:
            info = await sbx.files.get_info(path)
        except Exception as exc:  # noqa: BLE001
            if type(exc).__name__ in ("FileNotFoundException", "NotFoundException"):
                return _failure(
                    name,
                    f"File '{name}' was not found in the working directory. Save it there "
                    f"with python_repl_tool (plain filename, no folder), then call this tool.",
                )
            raise
        if getattr(info, "type", None) is not None and str(info.type).lower().endswith("dir"):
            return _failure(name, f"'{name}' is a folder, not a file.")
        if info.size > _MAX_UPLOAD_BYTES:
            return _failure(name, f"'{name}' is {info.size // (1024 * 1024)} MB; the limit is 80 MB.")

        data = await sbx.files.read(path, format="bytes")
    except SandboxOwnershipError as exc:
        return _failure(name, str(exc))
    except SandboxUnavailableError as exc:
        return _failure(name, str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.error("[s3_upload_tool] reading %s from the sandbox failed: %s", name, exc, exc_info=True)
        return _failure(name, f"Could not read the file from the sandbox: {str(exc)[:200]}")

    ctx = get_session_context()
    try:
        # upload_document takes a path, so stage the bytes in a private temp dir.
        def _upload() -> tuple[str, str]:
            with tempfile.TemporaryDirectory(prefix="priceiq_artifact_") as tmp:
                local_path = os.path.join(tmp, name)
                with open(local_path, "wb") as f:
                    f.write(bytes(data))
                # Key: chat-artifacts/<org>/<session hash>/<random>_<name>
                return get_idrive_storage().upload_document(
                    file_path=local_path,
                    user_id="chat-artifacts",
                    proposal_id=f"{ctx['org_id']}/{session_storage_id(ctx['session_id'])}",
                    filename=f"{uuid.uuid4().hex[:12]}_{name}",
                )

        url, object_key = await asyncio.to_thread(_upload)
    except Exception as exc:  # noqa: BLE001
        logger.error("[s3_upload_tool] upload failed: %s", exc, exc_info=True)
        return _failure(name, f"Upload failed: {str(exc)[:200]}")

    logger.info("[s3_upload_tool] uploaded %s → %s", name, object_key)
    return {
        "success": True,
        "url": url,
        "filename": name,
        "object_key": object_key,
        "error": None,
        "note": (
            "IMPORTANT — DO NOT output this URL as plain text in your reply. "
            "The frontend automatically detects the URL from this tool result and "
            "renders it as a styled download card with a clickable Download button. "
            "If you paste the URL in your message, the user will see a raw link "
            "instead of the rich UI component. "
            "Your reply should only confirm the file is ready and briefly describe "
            "its contents — for example: 'Your pricing summary is ready — it covers "
            "the prime/sub split, year-by-year totals, and the $3.0M grand total.' "
            "Never say 'here is the link', 'click to download', or paste any URL."
        ),
    }
