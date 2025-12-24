"""
Pinecone client for GSA labor category vector search.

Uses LangChain Pinecone for easy retriever integration.
"""

import threading
from typing import List, Dict, Optional
from pinecone import Pinecone, ServerlessSpec
from langchain_pinecone import PineconeVectorStore

from app.settings import settings
from client.llm_client import get_embeddings


class GSAPineconeClient:
    """Client for storing and searching GSA labor categories in Pinecone."""

    def __init__(self):
        self._lock = threading.RLock()
        self._pc = None
        self._index = None
        self._embeddings = None

    def _get_pinecone(self):
        """Get or create Pinecone client."""
        if self._pc is None:
            if not settings.PINECONE_API_KEY:
                raise ValueError("PINECONE_API_KEY not set")
            self._pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        return self._pc

    def _ensure_index(self):
        """Ensure Pinecone index exists."""
        if self._index is None:
            pc = self._get_pinecone()
            index_name = settings.PINECONE_INDEX_NAME

            existing = [idx.name for idx in pc.list_indexes()]
            if index_name not in existing:
                print(f"Creating Pinecone index: {index_name}")
                pc.create_index(
                    name=index_name,
                    dimension=1536,
                    metric="cosine",
                    spec=ServerlessSpec(cloud="aws", region="us-east-1")
                )

            self._index = pc.Index(index_name)
        return self._index

    def _get_embeddings_model(self):
        """Get embeddings model."""
        if self._embeddings is None:
            self._embeddings = get_embeddings()
        return self._embeddings

    def store_labor_categories(
        self,
        organization_id: str,
        file_id: str,
        labor_categories: List[Dict]
    ) -> int:
        """
        Store labor categories in Pinecone.

        Args:
            organization_id: Organization ID
            file_id: GSA contract file ID
            labor_categories: List of labor category dicts

        Returns:
            Number of vectors stored
        """
        if not labor_categories:
            return 0

        with self._lock:
            self._ensure_index()
            embeddings = self._get_embeddings_model()

            # Prepare texts and metadata
            texts = []
            metadatas = []
            ids = []

            for lcat in labor_categories:
                title = lcat.get("title", "")
                description = lcat.get("description", "")
                text = f"{title}: {description}" if description else title

                texts.append(text)
                ids.append(f"{organization_id}_{file_id}_{lcat['lcat_id']}")
                metadatas.append({
                    "organization_id": organization_id,
                    "file_id": file_id,
                    "lcat_id": lcat["lcat_id"],
                    "title": title,
                    "sin": lcat.get("sin", ""),
                    "education": lcat.get("education", ""),
                    "experience": lcat.get("experience", "")
                })

            # Use LangChain PineconeVectorStore to add documents
            print(f"  Storing {len(texts)} labor categories in Pinecone...")

            vectorstore = PineconeVectorStore(
                index_name=settings.PINECONE_INDEX_NAME,
                embedding=embeddings,
                pinecone_api_key=settings.PINECONE_API_KEY
            )

            vectorstore.add_texts(
                texts=texts,
                metadatas=metadatas,
                ids=ids
            )

            print(f"  ✓ Stored {len(texts)} vectors in Pinecone")
            return len(texts)

    def get_retriever(
        self,
        organization_id: str,
        file_id: str,
        top_k: int = 5
    ):
        """
        Get LangChain retriever for a specific GSA contract.

        Args:
            organization_id: Organization ID to filter
            file_id: GSA contract file ID to filter
            top_k: Number of results

        Returns:
            LangChain retriever
        """
        with self._lock:
            self._ensure_index()
            embeddings = self._get_embeddings_model()

            vectorstore = PineconeVectorStore(
                index_name=settings.PINECONE_INDEX_NAME,
                embedding=embeddings,
                pinecone_api_key=settings.PINECONE_API_KEY
            )

            retriever = vectorstore.as_retriever(
                search_kwargs={
                    "k": top_k,
                    "filter": {
                        "organization_id": {"$eq": organization_id},
                        "file_id": {"$eq": file_id}
                    }
                }
            )

            return retriever

    def search_labor_categories(
        self,
        query: str,
        organization_id: str,
        file_id: str,
        top_k: int = 5
    ) -> List[Dict]:
        """
        Search for matching labor categories.

        Args:
            query: Job description or title
            organization_id: Organization ID to filter
            file_id: GSA contract file ID to filter
            top_k: Number of results

        Returns:
            List of matching labor categories with scores
        """
        with self._lock:
            self._ensure_index()
            embeddings = self._get_embeddings_model()

            vectorstore = PineconeVectorStore(
                index_name=settings.PINECONE_INDEX_NAME,
                embedding=embeddings,
                pinecone_api_key=settings.PINECONE_API_KEY
            )

            results = vectorstore.similarity_search_with_score(
                query,
                k=top_k,
                filter={
                    "organization_id": {"$eq": organization_id},
                    "file_id": {"$eq": file_id}
                }
            )

            matches = []
            for doc, score in results:
                matches.append({
                    "lcat_id": doc.metadata.get("lcat_id"),
                    "title": doc.metadata.get("title"),
                    "sin": doc.metadata.get("sin"),
                    "education": doc.metadata.get("education"),
                    "experience": doc.metadata.get("experience"),
                    "score": score
                })

            return matches

    def delete_labor_categories(
        self,
        organization_id: str,
        file_id: str
    ) -> bool:
        """
        Delete all labor categories for a file.

        Args:
            organization_id: Organization ID
            file_id: GSA contract file ID

        Returns:
            True if successful
        """
        with self._lock:
            try:
                index = self._ensure_index()

                index.delete(
                    filter={
                        "organization_id": {"$eq": organization_id},
                        "file_id": {"$eq": file_id}
                    }
                )

                print(f"  ✓ Deleted vectors for file {file_id}")
                return True
            except Exception as e:
                print(f"  ✗ Error deleting vectors: {e}")
                return False


# Singleton
_gsa_pinecone_client: Optional[GSAPineconeClient] = None
_client_lock = threading.RLock()


def get_gsa_pinecone_client() -> GSAPineconeClient:
    """Get or create GSA Pinecone client."""
    global _gsa_pinecone_client
    with _client_lock:
        if _gsa_pinecone_client is None:
            _gsa_pinecone_client = GSAPineconeClient()
        return _gsa_pinecone_client
