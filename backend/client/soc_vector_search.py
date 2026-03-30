"""
SOC code mapper using FAISS vector search with OpenAI embeddings.
Maps job titles to Standard Occupational Classification codes.
"""

import pandas as pd
from pathlib import Path
from typing import List, Tuple, Optional
import threading
from langchain_community.vectorstores import FAISS
import os
from client.llm_client import get_embeddings

DATA_DIR = Path("data/oews")
CACHE_DIR = Path("data/cache")

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
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

    def _download_occupation_file(self):
        """Download oe.occupation from BLS if not present."""
        occ_file = DATA_DIR / "oe.occupation"
        if occ_file.exists():
            return
        print("  oe.occupation not found, downloading from BLS...")
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        import requests
        url = "https://download.bls.gov/pub/time.series/oe/oe.occupation"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
        }
        response = requests.get(url, headers=headers, timeout=60)
        response.raise_for_status()
        occ_file.write_bytes(response.content)
        print(f"  ✓ Downloaded oe.occupation ({occ_file.stat().st_size / 1024:.1f} KB)")

    def _load_occupations(self):
        """Load occupation codes and names from local file."""
        print("Loading occupations...")
        self._download_occupation_file()
        df = pd.read_csv(
            DATA_DIR / "oe.occupation",
            sep="\t",
            header=0,
            dtype=str,
        )

        # Debug: print columns found
        print(f"  Columns found: {df.columns.tolist()}")

        df.columns = df.columns.str.strip()

        # Check if required columns exist
        required_cols = ["occupation_code", "occupation_name"]
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}. Found: {df.columns.tolist()}")

        df["occupation_code"] = df["occupation_code"].str.strip()
        df["occupation_name"] = df["occupation_name"].str.strip()

        # Handle occupation_description if it exists
        if "occupation_description" in df.columns:
            df["occupation_description"] = df["occupation_description"].str.strip()
        else:
            df["occupation_description"] = ""

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
        description: Optional[str] = None,
        top_k: int = 5,
    ) -> List[Tuple[str, str, float]]:
        """
        Search for most similar SOC codes using vector similarity.

        Args:
            query: Job title (e.g., "Senior Python Developer")
            description: Optional full job description for richer semantic matching
            top_k: Number of results to return

        Returns:
            List of (soc_code, occupation_name, score) tuples
        """
        # Combine job title and description for better matching
        if description:
            search_query = f"Job Title: {query}. Description: {description}"
        else:
            search_query = query

        results_with_scores =  self.vectorstore.similarity_search_with_score(
            search_query,
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

    def get_best_match(self, query: str, description: Optional[str] = None) -> Tuple[str, str, float]:
        """
        Get single best matching SOC code.

        Args:
            query: Job title
            description: Optional full job description for better matching

        Returns:
            (soc_code, occupation_name, score)
            Returns (None, None, 0.0) if no results
        """
        results = self.search(query, description=description, top_k=1)
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
