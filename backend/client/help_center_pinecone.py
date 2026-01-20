"""
Pinecone client for help center documentation search.

Uses namespaces to separate help center docs from GSA labor categories.
"""

import threading
from typing import List, Dict, Optional
from pinecone import Pinecone, ServerlessSpec
from langchain_pinecone import PineconeVectorStore

from app.settings import settings
from client.llm_client import get_embeddings


class HelpCenterPineconeClient:
    """Client for storing and searching help center documentation in Pinecone."""

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
            index_name = settings.HELP_CENTER_PINECONE_INDEX_NAME

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

    def store_documents(
        self,
        documents: List[Dict],
        namespace: str = "help-center"
    ) -> int:
        """
        Store help center documents in Pinecone.

        Args:
            documents: List of dicts with keys:
                - content: Document text content
                - metadata: Dict with category, title, file_name, etc.
            namespace: Namespace to store in (default: "help-center")

        Returns:
            Number of vectors stored

        Example:
            documents = [
                {
                    "content": "PriceIQ is a pricing automation platform...",
                    "metadata": {
                        "category": "getting-started",
                        "title": "Introduction",
                        "file_name": "intro.md",
                        "article_type": "guide",
                        "priority": "high",
                        "chunk_index": 0
                    }
                }
            ]
        """
        if not documents:
            return 0

        with self._lock:
            self._ensure_index()
            embeddings = self._get_embeddings_model()

            texts = []
            metadatas = []
            ids = []

            for doc in documents:
                texts.append(doc["content"])
                metadatas.append(doc["metadata"])

                # Generate ID from metadata
                meta = doc["metadata"]
                doc_id = f"{namespace}_{meta.get('category', 'general')}_{meta.get('file_name', 'doc')}_{meta.get('chunk_index', 0)}"
                ids.append(doc_id)

            print(f"  Storing {len(texts)} help center docs in Pinecone (namespace: {namespace})...")

            vectorstore = PineconeVectorStore(
                index_name=settings.HELP_CENTER_PINECONE_INDEX_NAME,
                embedding=embeddings,
                pinecone_api_key=settings.PINECONE_API_KEY,
                namespace=namespace
            )

            vectorstore.add_texts(
                texts=texts,
                metadatas=metadatas,
                ids=ids
            )

            print(f"  ✓ Stored {len(texts)} help center docs")
            return len(texts)

    def search(
        self,
        query: str,
        namespace: str = "help-center",
        top_k: int = 5,
        
    ) -> List[Dict]:
        """
        Search help center documentation.

        Args:
            query: User question or search query
            namespace: Namespace to search in (default: "help-center")
            top_k: Number of results
            

        Returns:
            List of matching documents with content, metadata, and scores

        Example:
            results = client.search(
                query="How do I upload a document?",
                category="getting-started",
                top_k=3
            )
        """
        with self._lock:
            self._ensure_index()
            embeddings = self._get_embeddings_model()

            vectorstore = PineconeVectorStore(
                index_name=settings.HELP_CENTER_PINECONE_INDEX_NAME,
                embedding=embeddings,
                pinecone_api_key=settings.PINECONE_API_KEY,
                namespace=namespace
            )

            # Build filter for category if specified
            

            results = vectorstore.similarity_search_with_score(
                query,
                k=top_k,
                
            )

            matches = []
            for doc, score in results:
                matches.append({
                    "content": doc.page_content,
                    "metadata": doc.metadata,
                    "score": score
                })

            return matches

    def delete_namespace(
        self,
        namespace: str = "help-center"
    ) -> bool:
        """
        Delete all vectors in a namespace.

        Args:
            namespace: Namespace to delete (default: "help-center")

        Returns:
            True if successful
        """
        with self._lock:
            try:
                index = self._ensure_index()
                index.delete(delete_all=True, namespace=namespace)
                print(f"  ✓ Deleted all vectors in namespace: {namespace}")
                return True
            except Exception as e:
                print(f"  ✗ Error deleting namespace {namespace}: {e}")
                return False


# Singleton
_help_center_pinecone_client: Optional[HelpCenterPineconeClient] = None
_client_lock = threading.RLock()


def get_help_center_pinecone_client() -> HelpCenterPineconeClient:
    """Get or create help center Pinecone client singleton."""
    global _help_center_pinecone_client
    with _client_lock:
        if _help_center_pinecone_client is None:
            _help_center_pinecone_client = HelpCenterPineconeClient()
        return _help_center_pinecone_client
