"""
Document indexing for the chat retriever.

The pipeline parses each uploaded file exactly once upstream (in
processing.py via UnstructuredClient.parse_full). This module takes those
already-parsed pages, chunks them with Chonkie's RecursiveChunker, and
upserts to the proposal-docs Pinecone index.

Best-effort: a failure here marks the document indexed=False but never blocks
the proposal from going "ready" for pricing.
"""

from __future__ import annotations

import logging
from typing import Dict, List

from chonkie import RecursiveChunker

from client.proposal_docs_pinecone import get_proposal_docs_pinecone_client

logger = logging.getLogger(__name__)

# RecursiveChunker defaults give paragraph → sentence → word fallback —
# exactly what we want for plain-text per-page chunking. chunk_size is in
# characters (no tokenizer dragged into the worker); ~512 chars ≈ 100-130
# tokens, which retrieves well at top_k=8.
_chunker = RecursiveChunker(
    chunk_size=512,
    min_characters_per_chunk=64,
)


def index_document_pages(
    *,
    organization_id: str,
    proposal_id: str,
    document_id: str,
    filename: str,
    pages: List[Dict],
) -> int:
    """
    Chunk + embed + upsert one document's pages.

    pages: [{"page_num": int, "text": str}, ...]  (as returned by
           UnstructuredClient.parse_full)

    Returns the count of chunks upserted. 0 on failure (logged).
    """
    if not pages:
        logger.warning(f"[doc-index] no pages for {filename}")
        return 0

    # Flatten: one chunk record per (page, chunk_index_within_page)
    chunks: List[Dict] = []
    for page in pages:
        page_num = page.get("page_num")
        page_text = (page.get("text") or "").strip()
        if not page_text or page_num is None:
            continue
        try:
            page_chunks = _chunker.chunk(page_text)
        except Exception as e:
            # One bad page shouldn't lose the whole document.
            logger.warning(f"[doc-index] chunking failed on {filename} p.{page_num}: {e}")
            continue

        for i, ch in enumerate(page_chunks):
            text = (ch.text or "").strip()
            if not text:
                continue
            chunks.append({
                "page": page_num,
                "chunk_index": i,
                "text": text,
            })

    if not chunks:
        logger.warning(f"[doc-index] no chunks produced for {filename}")
        return 0

    try:
        pinecone = get_proposal_docs_pinecone_client()
        return pinecone.upsert_chunks(
            organization_id=organization_id,
            proposal_id=proposal_id,
            document_id=document_id,
            filename=filename,
            chunks=chunks,
        )
    except Exception as e:
        logger.error(
            f"[doc-index] upsert failed for {filename} "
            f"(org={organization_id} proposal={proposal_id}): {e}",
            exc_info=True,
        )
        return 0
