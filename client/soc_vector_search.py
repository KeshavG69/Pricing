"""
SOC code mapper using FAISS vector search with OpenAI embeddings.
Maps job titles to Standard Occupational Classification codes.
"""

import pandas as pd
from pathlib import Path
from typing import List, Tuple, Optional
import threading
from langchain_community.vectorstores import FAISS

from client.llm_client import get_embeddings

DATA_DIR = Path("data/oews")
CACHE_DIR = Path("data/cache")


class SOCVectorSearch:
    """Map job titles to SOC codes using semantic vector search."""

    def __init__(self):
        """Initialize vector search with OpenAI embeddings."""
        self._lock = threading.RLock()

        # Use shared embeddings instance
        self.embeddings = get_embeddings()
        self.vectorstore = None
        self.occupations = None

        # Load occupation data
        self._load_occupations()

        # Load or build FAISS index
        self._load_or_build_index()

    def _load_occupations(self):
        """Load occupation codes and names from local file."""
        print("Loading occupations...")
        df = pd.read_csv(
            DATA_DIR / "oe.occupation",
            sep="\t",
            header=0,
            dtype=str,
        )
        df.columns = df.columns.str.strip()
        df["occupation_code"] = df["occupation_code"].str.strip()
        df["occupation_name"] = df["occupation_name"].str.strip()
        df["occupation_description"] = df["occupation_description"].str.strip()

        # Filter to detailed occupations only (6-digit SOC codes)
        # These are the most specific and useful for matching job titles
        df = df[df["occupation_code"].str.len() == 6].copy()
        df = df[df["occupation_name"] != ""].copy()

        self.occupations = df.reset_index(drop=True)
        print(f"  ✓ Loaded {len(self.occupations)} detailed occupations")

    def _load_or_build_index(self):
        """Load cached FAISS index or build new one."""
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        index_path = CACHE_DIR / "soc_faiss_index"

        # Check if cached FAISS index exists
        if index_path.exists():
            print("Loading cached FAISS index...")
            try:
                # LangChain FAISS can load from disk
                self.vectorstore = FAISS.load_local(
                    str(index_path),
                    self.embeddings,
                    allow_dangerous_deserialization=True  # We trust our own cache
                )
                print(f"  ✓ Loaded index from cache")
                return
            except Exception as e:
                print(f"  ⚠️  Cache load failed: {e}")

        # Cache doesn't exist - build new index
        print("Building FAISS index with OpenAI embeddings...")
        self._build_index()

        # Save to cache for future use
        print("  Saving to cache...")
        self.vectorstore.save_local(str(index_path))
        print(f"  ✓ Index cached to {index_path}")

    def _build_index(self):
        """Build FAISS index using LangChain."""
        print(f"  Creating embeddings for {len(self.occupations)} occupations...")
        print("  (This will make one OpenAI API call, ~$0.02)")

        # Prepare texts: combine occupation name + description for richer embeddings
        # This helps match job titles to SOC codes more accurately
        # Example: "Software Developers: Research, design, and develop computer software..."
        texts = []
        metadatas = []

        for _, row in self.occupations.iterrows():
            # Combine name and description (if description exists)
            if pd.notna(row["occupation_description"]) and row["occupation_description"]:
                text = f"{row['occupation_name']}: {row['occupation_description']}"
            else:
                text = row["occupation_name"]

            texts.append(text)

            # Store metadata for retrieval
            metadatas.append({
                "soc_code": row["occupation_code"],
                "occupation_name": row["occupation_name"],
                "occupation_description": row["occupation_description"] if pd.notna(row["occupation_description"]) else ""
            })

        # Create FAISS vectorstore from texts
        # LangChain handles: embedding creation, FAISS index building, metadata storage
        self.vectorstore = FAISS.from_texts(
            texts=texts,
            embedding=self.embeddings,
            metadatas=metadatas
        )

        print(f"  ✓ Built FAISS index with {len(texts)} occupations")

    def search(
        self,
        query: str,
        top_k: int = 5,
    ) -> List[Tuple[str, str, float]]:
        """
        Search for most similar SOC codes using vector similarity.

        Args:
            query: Job title or description (e.g., "Senior Python Developer")
            top_k: Number of results to return

        Returns:
            List of (soc_code, occupation_name, score) tuples
        """
        results_with_scores = self.vectorstore.similarity_search_with_score(
            query,
            k=top_k
        )

        results = []
        for doc, score in results_with_scores:
            results.append((
                doc.metadata["soc_code"],
                doc.metadata["occupation_name"],
                float(score)
            ))

        return results

    def get_best_match(self, query: str) -> Tuple[str, str, float]:
        """
        Get single best matching SOC code.

        Args:
            query: Job title or description

        Returns:
            (soc_code, occupation_name, score)
            Returns (None, None, 0.0) if no results
        """
        results = self.search(query, top_k=1)
        return results[0] if results else (None, None, 0.0)


# Global SOC vector search client (singleton pattern)
_soc_client: Optional[SOCVectorSearch] = None
_client_lock = threading.RLock()


def get_soc_vector_search_client() -> SOCVectorSearch:
    """
    Get or create SOC vector search client (singleton pattern)

    Returns:
        SOCVectorSearch instance
    """
    global _soc_client
    with _client_lock:
        if _soc_client is None:
            _soc_client = SOCVectorSearch()
        return _soc_client
