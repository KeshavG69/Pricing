"""
Pinecone client for proposal source-document chunks.

Each proposal's uploaded files (RFP, PWS, SOW, JDs, etc.) are parsed by
LiteParse, chunked per-page with Chonkie's RecursiveChunker, embedded with
OpenAI text-embedding-3-small (1536d, same as the GSA index), and upserted
here so the pricing-chat agent can answer "what does the RFP say about X?"
with grounded citations.

Tenant model:
- namespace = organization_id           (isolation between orgs)
- metadata.proposal_id filter           (scopes a chat session to its proposal)
- metadata.document_id                  (lets DELETE /documents/{i} purge cleanly)

Vector ID format: "{proposal_id}#{document_id}#p{page}#{chunk_index}"
Encoded so duplicate-proposal (future) can enumerate via index.list(prefix=...).
"""

from __future__ import annotations

import logging
import threading
from typing import Dict, List, Optional

from pinecone import Pinecone, ServerlessSpec

from app.settings import settings
from client.llm_client import get_embeddings

logger = logging.getLogger(__name__)


class ProposalDocsPineconeClient:
    """Stores + searches proposal source-document chunks in Pinecone."""

    def __init__(self):
        self._lock = threading.RLock()
        self._pc: Optional[Pinecone] = None
        self._index = None
        self._embeddings = None

    def _get_pinecone(self) -> Pinecone:
        if self._pc is None:
            if not settings.PINECONE_API_KEY:
                raise ValueError("PINECONE_API_KEY not set")
            self._pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        return self._pc

    def _ensure_index(self):
        if self._index is None:
            pc = self._get_pinecone()
            name = settings.PROPOSAL_DOCS_PINECONE_INDEX_NAME
            existing = [idx.name for idx in pc.list_indexes()]
            if name not in existing:
                logger.info(f"Creating Pinecone index: {name}")
                pc.create_index(
                    name=name,
                    dimension=1536,
                    metric="cosine",
                    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
                )
            self._index = pc.Index(name)
        return self._index

    def _get_embeddings_model(self):
        if self._embeddings is None:
            self._embeddings = get_embeddings()
        return self._embeddings

    # ─── WRITE ───────────────────────────────────────────────────────────

    def upsert_chunks(
        self,
        *,
        organization_id: str,
        proposal_id: str,
        document_id: str,
        filename: str,
        chunks: List[Dict],
    ) -> int:
        """
        Embed + upsert a batch of chunks for a single document.

        chunks: [{"text": str, "page": int, "chunk_index": int}]
        Returns the number of vectors written.
        """
        if not chunks:
            return 0

        with self._lock:
            index = self._ensure_index()
            embeddings = self._get_embeddings_model()

            # Prefix each chunk with its citation handle so the embedding
            # carries location context — cheap retrieval-quality win on
            # structured docs (per the 2026 RAG playbook research).
            cited_texts = [
                f"[{filename}, p. {c['page']}]\n\n{c['text']}" for c in chunks
            ]

            # OpenAI batch embed. LangChain's embed_documents handles batching
            # + retries internally; we just hand it the whole list per doc
            # (typical RFP ≈ 500-1500 chunks → 1-3 batched API calls).
            vectors = embeddings.embed_documents(cited_texts)

            to_upsert = []
            for chunk, vec in zip(chunks, vectors):
                vid = f"{proposal_id}#{document_id}#p{chunk['page']}#{chunk['chunk_index']}"
                to_upsert.append({
                    "id": vid,
                    "values": vec,
                    "metadata": {
                        "organization_id": organization_id,
                        "proposal_id": proposal_id,
                        "document_id": document_id,
                        "filename": filename,
                        "page": int(chunk["page"]),
                        "chunk_index": int(chunk["chunk_index"]),
                        # Store raw chunk text (no citation prefix) so the
                        # retriever can return it verbatim for the agent.
                        "text": chunk["text"],
                    },
                })

            # Pinecone caps upsert batches at 100 vectors / 2 MB.
            BATCH = 100
            total = 0
            for i in range(0, len(to_upsert), BATCH):
                batch = to_upsert[i : i + BATCH]
                index.upsert(vectors=batch, namespace=organization_id)
                total += len(batch)

            logger.info(
                f"[proposal-docs] upserted {total} chunks "
                f"org={organization_id} proposal={proposal_id} doc={document_id} file={filename!r}"
            )
            return total

    # ─── DELETE ──────────────────────────────────────────────────────────

    def delete_proposal_vectors(
        self,
        *,
        organization_id: str,
        proposal_id: str,
    ) -> bool:
        """Purge every chunk for a proposal (called on proposal delete / reingest)."""
        with self._lock:
            try:
                index = self._ensure_index()
                index.delete(
                    filter={"proposal_id": {"$eq": proposal_id}},
                    namespace=organization_id,
                )
                logger.info(
                    f"[proposal-docs] deleted all vectors for proposal={proposal_id} "
                    f"org={organization_id}"
                )
                return True
            except Exception as e:
                logger.error(f"[proposal-docs] delete_proposal_vectors failed: {e}", exc_info=True)
                return False

    def delete_document_vectors(
        self,
        *,
        organization_id: str,
        proposal_id: str,
        document_id: str,
    ) -> bool:
        """Purge every chunk for a single document (called on DELETE /documents/{i})."""
        with self._lock:
            try:
                index = self._ensure_index()
                index.delete(
                    filter={
                        "proposal_id": {"$eq": proposal_id},
                        "document_id": {"$eq": document_id},
                    },
                    namespace=organization_id,
                )
                logger.info(
                    f"[proposal-docs] deleted vectors for document={document_id} "
                    f"proposal={proposal_id} org={organization_id}"
                )
                return True
            except Exception as e:
                logger.error(f"[proposal-docs] delete_document_vectors failed: {e}", exc_info=True)
                return False

    # ─── READ (retriever) ────────────────────────────────────────────────

    def search(
        self,
        *,
        query: str,
        organization_id: str,
        proposal_id: str,
        top_k: int = 8,
    ) -> List[Dict]:
        """
        Vector-search proposal chunks. Returns list of dicts with text + citation.
        Used by the agent's document_retriever tool.
        """
        with self._lock:
            try:
                index = self._ensure_index()
                embeddings = self._get_embeddings_model()
                qvec = embeddings.embed_query(query)

                response = index.query(
                    vector=qvec,
                    top_k=top_k,
                    filter={"proposal_id": {"$eq": proposal_id}},
                    namespace=organization_id,
                    include_metadata=True,
                )

                out = []
                for match in response.matches or []:
                    md = match.metadata or {}
                    out.append({
                        "filename": md.get("filename"),
                        "page": md.get("page"),
                        "text": md.get("text", ""),
                        "score": float(match.score) if match.score is not None else None,
                    })
                return out
            except Exception as e:
                # Retriever failures must not crash the chat turn — return
                # empty so the agent can say "I couldn't find that in your docs."
                logger.error(f"[proposal-docs] search failed: {e}", exc_info=True)
                return []


# ─── Singleton ──────────────────────────────────────────────────────────

_client: Optional[ProposalDocsPineconeClient] = None
_client_lock = threading.RLock()


def get_proposal_docs_pinecone_client() -> ProposalDocsPineconeClient:
    """Get or create the proposal-docs Pinecone client (singleton)."""
    global _client
    with _client_lock:
        if _client is None:
            _client = ProposalDocsPineconeClient()
        return _client
