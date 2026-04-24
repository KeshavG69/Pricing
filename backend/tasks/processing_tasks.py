"""
Processing Celery Tasks
Wraps async proposal and GSA contract processing functions.
"""

import asyncio
import gc
import logging
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from celery.exceptions import SoftTimeLimitExceeded

# Ensure backend directory is on path (needed when Celery forks a worker process)
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.worker import celery_app

logger = logging.getLogger(__name__)

# Soft limit raises SoftTimeLimitExceeded inside the task so we can clean up
# (mark proposal as error, skip billing). Hard limit kills the worker process
# if the task ignores the soft signal. Must stay below / equal to the lazy
# timeout check in ProposalCRUD.check_for_timeout (currently 30 min) so a
# stuck task is resolved before a polling client flips it.
PROPOSAL_TASK_SOFT_TIMEOUT = 25 * 60  # 25 minutes
PROPOSAL_TASK_HARD_TIMEOUT = 30 * 60  # 30 minutes


@celery_app.task(
    bind=True,
    soft_time_limit=PROPOSAL_TASK_SOFT_TIMEOUT,
    time_limit=PROPOSAL_TASK_HARD_TIMEOUT,
)
def process_proposal_task(
    self,
    proposal_id: str,
    user_id: str,
    organization_id: str,
    idrive_keys: List[str],
    file_names: List[str],
    wage_source: Dict[str, Any],
    preserved_advanced_mode: Optional[bool] = None,
    preserved_subcontractor_configured: Optional[bool] = None,
    preserved_subcontractors: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """
    Celery task that processes uploaded proposal documents.

    Downloads files from iDrive into a worker-local tmpdir, then runs
    process_proposal_documents. Files must already be uploaded to iDrive by the
    caller — only idrive_keys cross the task boundary, so this works whether the
    worker runs in the same container as the API or in a separate one.
    """
    temp_dir: Optional[Path] = None
    try:
        logger.info(f"Starting proposal processing task: {proposal_id}")

        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)

        from client.idrive_storage import get_idrive_storage
        from utils.processing import process_proposal_documents

        temp_dir = Path(tempfile.mkdtemp())
        file_paths: List[str] = []

        storage = get_idrive_storage()
        for key, name in zip(idrive_keys, file_names):
            local_path = temp_dir / name
            storage.download_document(key, str(local_path))
            file_paths.append(str(local_path))

        asyncio.run(process_proposal_documents(
            proposal_id=proposal_id,
            user_id=user_id,
            organization_id=organization_id,
            file_paths=file_paths,
            file_names=file_names,
            temp_dir=temp_dir,
            wage_source=wage_source,
            preserved_advanced_mode=preserved_advanced_mode,
            preserved_subcontractor_configured=preserved_subcontractor_configured,
            preserved_subcontractors=preserved_subcontractors or [],
        ))

        logger.info(f"Proposal processing task completed: {proposal_id}")
        return {"status": "success", "proposal_id": proposal_id}

    except SoftTimeLimitExceeded:
        logger.error(
            f"Proposal processing task exceeded {PROPOSAL_TASK_SOFT_TIMEOUT}s soft limit: {proposal_id}"
        )
        _mark_proposal_timed_out(proposal_id, user_id)
        return {"status": "timeout", "proposal_id": proposal_id}

    except Exception as e:
        logger.error(f"Proposal processing task failed: {proposal_id}: {e}", exc_info=True)
        return {"status": "error", "proposal_id": proposal_id, "error": str(e)}

    finally:
        if temp_dir is not None:
            shutil.rmtree(temp_dir, ignore_errors=True)
        gc.collect()


def _mark_proposal_timed_out(proposal_id: str, user_id: str) -> None:
    """Flip a timed-out proposal to error and leave billing_status unpaid so no charge fires."""
    try:
        from utils.proposals import get_proposal_crud
        crud = get_proposal_crud()
        crud.update_proposal(
            proposal_id,
            user_id,
            {
                "status": "error",
                "progress": 0,
                "billing_status": "unpaid",
                "message": (
                    f"Processing exceeded the {PROPOSAL_TASK_SOFT_TIMEOUT // 60}-minute time limit "
                    "and was cancelled. Please retry the upload, or contact support if this persists."
                ),
            },
        )
    except Exception as update_err:
        logger.error(
            f"Failed to mark proposal {proposal_id} as timed out: {update_err}",
            exc_info=True,
        )


@celery_app.task(bind=True)
def process_gsa_contract_task(
    self,
    file_id: str,
    organization_id: str,
    idrive_key: str,
    filename: str,
) -> Dict[str, Any]:
    """
    Celery task that processes an uploaded GSA contract file.

    Downloads the file from iDrive into a worker-local tmpdir before parsing.
    """
    try:
        logger.info(f"Starting GSA contract processing task: {file_id}")

        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)

        from client.idrive_storage import get_idrive_storage
        from utils.processing import process_gsa_contract

        temp_dir = Path(tempfile.mkdtemp())
        local_path = temp_dir / filename
        get_idrive_storage().download_document(idrive_key, str(local_path))

        asyncio.run(process_gsa_contract(
            file_id=file_id,
            organization_id=organization_id,
            file_path=str(local_path),
            temp_dir=temp_dir,
        ))

        logger.info(f"GSA contract processing task completed: {file_id}")
        return {"status": "success", "file_id": file_id}

    except Exception as e:
        logger.error(f"GSA contract processing task failed: {file_id}: {e}", exc_info=True)
        if 'temp_dir' in locals():
            shutil.rmtree(temp_dir, ignore_errors=True)
        return {"status": "error", "file_id": file_id, "error": str(e)}

    finally:
        gc.collect()
