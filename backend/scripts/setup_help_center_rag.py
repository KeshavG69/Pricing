"""
Setup Help Center RAG Pipeline

This script:
1. Reads all markdown files from docs/help-center/
2. Splits them into chunks
3. Generates embeddings using OpenAI
4. Uploads to Pinecone vector store (separate index from GSA, uses HELP_CENTER_PINECONE_INDEX_NAME)

Metadata fields per chunk:
- category: folder name (e.g., "getting-started")
- title: article title from # heading
- file_name: filename (e.g., "03-first-proposal.md")
- article_type: Tutorial/Explainer/Reference/etc
- priority: P0/P1/P2
- chunk_index: chunk number (0, 1, 2, ...)

Usage:
    cd backend
    uv run python scripts/setup_help_center_rag.py

Requirements:
    - OPENAI_API_KEY in .env
    - PINECONE_API_KEY in .env
"""

import os
import sys
from pathlib import Path
from typing import List
import time
import re

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from pinecone import Pinecone, ServerlessSpec

# Load environment variables
load_dotenv()

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("HELP_CENTER_PINECONE_INDEX_NAME", "help-center")  # Separate index for help center
PINECONE_NAMESPACE = "help-center"  # Namespace within the index
DOCS_PATH = Path(__file__).parent.parent.parent / "docs" / "help-center"

# Embedding configuration
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSION = 1536

# Chunking configuration
CHUNK_SIZE = 1000  # Characters per chunk
CHUNK_OVERLAP = 200  # Overlap to preserve context


def validate_environment():
    """Validate required environment variables."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not found in environment")
    if not PINECONE_API_KEY:
        raise ValueError("PINECONE_API_KEY not found in environment")

    print("✓ Environment variables validated")


def initialize_pinecone():
    """Initialize Pinecone client and create index if it doesn't exist."""
    print(f"\nInitializing Pinecone...")
    print(f"Index: {PINECONE_INDEX_NAME}")
    print(f"Namespace: {PINECONE_NAMESPACE}")

    pc = Pinecone(api_key=PINECONE_API_KEY)

    # Check if index exists
    existing_indexes = pc.list_indexes()
    index_names = [index['name'] for index in existing_indexes]

    if PINECONE_INDEX_NAME not in index_names:
        print(f"Creating new index: {PINECONE_INDEX_NAME}")
        pc.create_index(
            name=PINECONE_INDEX_NAME,
            dimension=EMBEDDING_DIMENSION,
            metric="cosine",
            spec=ServerlessSpec(
                cloud="aws",
                region="us-east-1"  # Use closest region
            )
        )
        print(f"✓ Index '{PINECONE_INDEX_NAME}' created")

        # Wait for index to be ready
        print("Waiting for index to be ready...")
        time.sleep(10)
    else:
        print(f"✓ Using existing index: {PINECONE_INDEX_NAME}")

    return pc


def extract_metadata_from_content(content: str) -> dict:
    """
    Extract article_type and priority from markdown content.

    Looks for lines like:
    **Article Type:** Tutorial | **Priority:** P0 | **Reading Time:** 5 minutes
    """
    metadata = {
        "article_type": "Unknown",
        "priority": "Unknown"
    }

    # Look for metadata line (usually second or third line)
    lines = content.split('\n')[:10]  # Check first 10 lines

    for line in lines:
        # Match pattern: **Article Type:** Tutorial | **Priority:** P0
        if '**Article Type:**' in line and '**Priority:**' in line:
            # Extract article type
            type_match = re.search(r'\*\*Article Type:\*\*\s*([^|]+)', line)
            if type_match:
                metadata["article_type"] = type_match.group(1).strip()

            # Extract priority
            priority_match = re.search(r'\*\*Priority:\*\*\s*(\w+)', line)
            if priority_match:
                metadata["priority"] = priority_match.group(1).strip()

            break

    return metadata


def load_markdown_files() -> List[Document]:
    """Load all markdown files from help center directory."""
    print(f"\nLoading markdown files from: {DOCS_PATH}")

    if not DOCS_PATH.exists():
        raise ValueError(f"Documentation path does not exist: {DOCS_PATH}")

    documents = []
    markdown_files = list(DOCS_PATH.rglob("*.md"))

    # Filter out certain files
    excluded_files = {
        "DOCUMENTATION_STATUS.md",
        "FINAL_SUMMARY.md",
        "FILE_LIST.txt",
        "create_remaining_articles.sh"
    }
    markdown_files = [f for f in markdown_files if f.name not in excluded_files]

    print(f"Found {len(markdown_files)} markdown files")

    for file_path in markdown_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Skip empty files
            if not content.strip():
                print(f"  ⊘ Skipping empty file: {file_path.name}")
                continue

            # Extract relative path for category
            relative_path = file_path.relative_to(DOCS_PATH)

            # Extract category from path
            parts = relative_path.parts
            category = parts[0] if len(parts) > 1 else "root"

            # Extract title from first line (assumes # Title format)
            title = "Untitled"
            first_line = content.split('\n')[0].strip()
            if first_line.startswith('#'):
                title = first_line.lstrip('#').strip()

            # Extract article_type and priority from content
            content_metadata = extract_metadata_from_content(content)

            # Create document with 6 metadata fields (NO source field)
            doc = Document(
                page_content=content,
                metadata={
                    "category": category,
                    "title": title,
                    "file_name": file_path.name,
                    "article_type": content_metadata["article_type"],
                    "priority": content_metadata["priority"],
                    # chunk_index will be added during splitting
                }
            )
            documents.append(doc)

            print(f"  ✓ Loaded: {category}/{file_path.name}")

        except Exception as e:
            print(f"  ✗ Error loading {file_path}: {e}")
            continue

    print(f"✓ Loaded {len(documents)} documents")
    return documents


def split_documents(documents: List[Document]) -> List[Document]:
    """Split documents into chunks and add chunk_index metadata."""
    print(f"\nSplitting documents into chunks...")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        separators=[
            "\n## ",  # Split on H2 headers first
            "\n### ",  # Then H3 headers
            "\n\n",  # Then paragraphs
            "\n",  # Then lines
            " ",  # Then words
            ""  # Then characters
        ]
    )

    all_chunks = []

    for doc in documents:
        # Split document
        doc_chunks = text_splitter.split_documents([doc])

        # Add chunk_index to each chunk
        for idx, chunk in enumerate(doc_chunks):
            chunk.metadata["chunk_index"] = idx

        all_chunks.extend(doc_chunks)

    avg_chunk_size = sum(len(c.page_content) for c in all_chunks) // len(all_chunks) if all_chunks else 0
    print(f"✓ Created {len(all_chunks)} chunks (avg {avg_chunk_size} chars per chunk)")
    return all_chunks


def upload_to_pinecone(chunks: List[Document]):
    """Generate embeddings and upload to Pinecone namespace."""
    print(f"\nGenerating embeddings and uploading to Pinecone...")
    print(f"Using model: {EMBEDDING_MODEL}")
    print(f"Target: Index '{PINECONE_INDEX_NAME}' → Namespace '{PINECONE_NAMESPACE}'")

    # Initialize embeddings (using OpenAI directly)
    embeddings = OpenAIEmbeddings(
        model=EMBEDDING_MODEL,
        openai_api_key=OPENAI_API_KEY
    )

    # Augment chunks with metadata for better vector search
    print(f"Augmenting chunks with metadata...")
    augmented_chunks = []
    for chunk in chunks:
        # Create augmented content: original content + metadata string
        metadata_str = f"\nmetadata: {chunk.metadata}"
        augmented_content = chunk.page_content + metadata_str

        # Create new document with augmented content but same metadata
        augmented_chunk = Document(
            page_content=augmented_content,
            metadata=chunk.metadata
        )
        augmented_chunks.append(augmented_chunk)

    # Create vector store and upload to namespace
    print(f"Uploading {len(augmented_chunks)} chunks...")

    try:
        vector_store = PineconeVectorStore.from_documents(
            documents=augmented_chunks,
            embedding=embeddings,
            index_name=PINECONE_INDEX_NAME,
            namespace=PINECONE_NAMESPACE  # Store in help-center namespace
        )

        print(f"✓ Successfully uploaded {len(augmented_chunks)} chunks to Pinecone")
        print(f"  Index: {PINECONE_INDEX_NAME}")
        print(f"  Namespace: {PINECONE_NAMESPACE}")
        print(f"  (Content augmented with metadata for better search)")

    except Exception as e:
        print(f"✗ Error uploading to Pinecone: {e}")
        raise


def print_summary(chunks: List[Document]):
    """Print summary statistics."""
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    # Count by category
    categories = {}
    for chunk in chunks:
        cat = chunk.metadata.get('category', 'unknown')
        categories[cat] = categories.get(cat, 0) + 1

    # Count by priority
    priorities = {}
    for chunk in chunks:
        pri = chunk.metadata.get('priority', 'unknown')
        priorities[pri] = priorities.get(pri, 0) + 1

    # Count by article type
    types = {}
    for chunk in chunks:
        typ = chunk.metadata.get('article_type', 'unknown')
        types[typ] = types.get(typ, 0) + 1

    print(f"\nTotal chunks: {len(chunks)}")
    print(f"Pinecone index: {PINECONE_INDEX_NAME}")
    print(f"Pinecone namespace: {PINECONE_NAMESPACE}")
    print(f"Embedding model: {EMBEDDING_MODEL}")

    print(f"\nChunks by category:")
    for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
        print(f"  {cat}: {count} chunks")

    print(f"\nChunks by priority:")
    for pri, count in sorted(priorities.items(), key=lambda x: x[1], reverse=True):
        print(f"  {pri}: {count} chunks")

    print(f"\nChunks by article type:")
    for typ, count in sorted(types.items(), key=lambda x: x[1], reverse=True):
        print(f"  {typ}: {count} chunks")

    print("\n" + "="*60)
    print("Setup complete! 🎉")
    print("="*60)
    print("\nMetadata fields per chunk:")
    print("  1. category (folder name)")
    print("  2. title (article title)")
    print("  3. file_name (filename)")
    print("  4. article_type (Tutorial/Explainer/etc)")
    print("  5. priority (P0/P1/P2)")
    print("  6. chunk_index (chunk number)")
    print("\nYou can now query the help center using the RAG API endpoint.")
    print('Example: POST /api/help/search with {"query": "How do I create a proposal?"}')


def main():
    """Main execution function."""
    print("="*60)
    print("PRICEIQ HELP CENTER RAG SETUP")
    print("="*60)

    try:
        # Step 1: Validate environment
        validate_environment()

        # Step 2: Initialize Pinecone
        initialize_pinecone()

        # Step 3: Load markdown files
        documents = load_markdown_files()

        if not documents:
            print("✗ No documents found! Check DOCS_PATH.")
            return

        # Step 4: Split into chunks
        chunks = split_documents(documents)

        # Step 5: Upload to Pinecone namespace
        upload_to_pinecone(chunks)

        # Step 6: Print summary
        print_summary(chunks)

    except Exception as e:
        print(f"\n✗ Setup failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
