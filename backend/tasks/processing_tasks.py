"""
Processing Celery Tasks
Wraps async proposal and GSA contract processing functions.
"""

import asyncio
import gc
import logging
import sys
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
    file_paths: List[str],
    file_names: List[str],
    temp_dir: str,
    wage_source: Dict[str, Any],
    preserved_advanced_mode: Optional[bool] = None,
    preserved_subcontractor_configured: Optional[bool] = None,
    preserved_subcontractors: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """
    Celery task that processes uploaded proposal documents.

    Wraps the async process_proposal_documents function.
    temp_dir is passed as a string (Path objects are not JSON-serializable).
    """
    try:
        logger.info(f"Starting proposal processing task: {proposal_id}")

        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)

        from utils.processing import process_proposal_documents

        asyncio.run(process_proposal_documents(
            proposal_id=proposal_id,
            user_id=user_id,
            organization_id=organization_id,
            file_paths=file_paths,
            file_names=file_names,
            temp_dir=Path(temp_dir),
            wage_source=wage_source,
            preserved_advanced_mode=preserved_advanced_mode,
            preserved_subcontractor_configured=preserved_subcontractor_configured,
            preserved_subcontractors=preserved_subcontractors or [],
        ))

        logger.info(f"Proposal processing task completed: {proposal_id}")
        return {"status": "success", "proposal_id": proposal_id}

    except Exception as e:
        logger.error(f"Proposal processing task failed: {proposal_id}: {e}", exc_info=True)
        return {"status": "error", "proposal_id": proposal_id, "error": str(e)}

    finally:
        gc.collect()


@celery_app.task(bind=True)
def process_gsa_contract_task(
    self,
    file_id: str,
    organization_id: str,
    file_path: str,
    temp_dir: str,
) -> Dict[str, Any]:
    """
    Celery task that processes an uploaded GSA contract file.

    Wraps the async process_gsa_contract function.
    temp_dir is passed as a string (Path objects are not JSON-serializable).
    """
    try:
        logger.info(f"Starting GSA contract processing task: {file_id}")

        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)

        from utils.processing import process_gsa_contract

        asyncio.run(process_gsa_contract(
            file_id=file_id,
            organization_id=organization_id,
            file_path=file_path,
            temp_dir=Path(temp_dir),
        ))

        logger.info(f"GSA contract processing task completed: {file_id}")
        return {"status": "success", "file_id": file_id}

    except Exception as e:
        logger.error(f"GSA contract processing task failed: {file_id}: {e}", exc_info=True)
        return {"status": "error", "file_id": file_id, "error": str(e)}

    finally:
        gc.collect()
