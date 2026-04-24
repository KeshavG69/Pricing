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

# Ensure backend directory is on path (needed when Celery forks a worker process)
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.worker import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True)
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

    except Exception as e:
        logger.error(f"Proposal processing task failed: {proposal_id}: {e}", exc_info=True)
        if 'temp_dir' in locals():
            shutil.rmtree(temp_dir, ignore_errors=True)
        return {"status": "error", "proposal_id": proposal_id, "error": str(e)}

    finally:
        gc.collect()


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
