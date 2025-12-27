"""GSA Contract parsing using LlamaExtract API."""

import re
from typing import List, Optional
from pydantic import BaseModel, Field
import json
from functools import lru_cache

from client.jd_parser import _convert_excel_to_csv
from client.llm_client import get_chat_llm
from client.llama_client import get_llama_extract
from app.settings import settings

try:
    from llama_cloud import ExtractConfig, ExtractMode
except ImportError:
    raise ImportError(
        "llama-cloud not installed. "
        "Run: pip install llama-cloud"
    )


# =====================================================================
# LLAMAEXTRACT SCHEMA (Metadata Only)
# =====================================================================

class GSAContractMetadata(BaseModel):
    """
    Metadata extraction for GSA contract (contract number, dates, company name).
    Labor categories are extracted separately using GPT-4 with intelligent chunking.
    """
    contract_number: Optional[str] = Field(
        None,
        description="GSA contract number (e.g., 'GS-35F-0119Y', '47QRCA25DS242', '47QTCA20D003R')"
    )
    contract_start_date: Optional[str] = Field(
        None,
        description="Contract start date or period of performance start"
    )
    contract_end_date: Optional[str] = Field(
        None,
        description="Contract end date or period of performance end"
    )
    company_name: Optional[str] = Field(
        None,
        description="Contractor/company name"
    )
    year_columns: Optional[List[str]] = Field(
        None,
        description="List of year column headers from the rate table (e.g., ['Year 6', 'Year 7', 'Year 8', 'Year 9', 'Year 10'] or ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'])"
    )


# =====================================================================
# HELPER FUNCTIONS
# =====================================================================

def _convert_rtf_to_txt(rtf_path: str) -> str:
    """
    Convert RTF file to TXT for LlamaExtract compatibility.

    Args:
        rtf_path: Path to the RTF file

    Returns:
        Path to temporary TXT file
    """
    import subprocess
    import tempfile

    temp_txt = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
    temp_txt.close()

    try:
        # Use textutil (macOS) to convert RTF to TXT
        subprocess.run(
            ['textutil', '-convert', 'txt', '-output', temp_txt.name, rtf_path],
            check=True,
            capture_output=True
        )
        print(f"  Converted RTF to TXT: {temp_txt.name}")
        return temp_txt.name
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Fallback: try striprtf library
        try:
            from striprtf.striprtf import rtf_to_text
            with open(rtf_path, 'r', encoding='utf-8', errors='ignore') as f:
                rtf_content = f.read()
            txt_content = rtf_to_text(rtf_content)
            with open(temp_txt.name, 'w', encoding='utf-8') as f:
                f.write(txt_content)
            print(f"  Converted RTF to TXT (striprtf): {temp_txt.name}")
            return temp_txt.name
        except ImportError:
            raise ValueError("Cannot convert RTF. Install striprtf: pip install striprtf")


def _extract_and_chunk_by_file_type(file_path: str) -> List[str]:
    """
    Extract and chunk text based on file type for optimal context.

    Chunking Strategy:
    - PDF: By pages (1 page = 1 chunk)
    - DOCX: By paragraphs (5-10 paragraphs or 4000 chars = 1 chunk)
    - CSV: By rows (50 rows = 1 chunk)
    - TXT/RTF: By character count (4000 chars = 1 chunk)

    Args:
        file_path: Path to file

    Returns:
        List of text chunks
    """
    import os
    file_ext = os.path.splitext(file_path)[1].lower()

    # =========================================================================
    # PDF: Chunk by pages (keeps page context together)
    # =========================================================================
    if file_ext == '.pdf':
        try:
            import PyPDF2
            chunks = []
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text = page.extract_text()
                    if text.strip():
                        chunks.append(text)
            print(f"     [PDF] Extracted {len(chunks)} pages as chunks")
            return chunks
        except ImportError:
            raise ImportError("PyPDF2 not installed. Run: pip install PyPDF2")

    # =========================================================================
    # DOCX: Chunk by paragraphs (5-10 paragraphs or 4000 chars per chunk)
    # =========================================================================
    elif file_ext == '.docx':
        try:
            import docx
            doc = docx.Document(file_path)
            all_content = []

            # Extract paragraphs
            for para in doc.paragraphs:
                if para.text.strip():
                    all_content.append(para.text)

            # Extract tables
            for table in doc.tables:
                for row in table.rows:
                    row_text = ' | '.join([cell.text.strip() for cell in row.cells])
                    if row_text.strip():
                        all_content.append(row_text)

            # Chunk by paragraphs (5-10 paragraphs or 4000 chars)
            chunks = []
            current_chunk = []
            current_size = 0

            for content in all_content:
                content_size = len(content)

                # If adding this would exceed 4000 chars and we have 5+ paragraphs, start new chunk
                if (current_size + content_size > 4000 and len(current_chunk) >= 5) or len(current_chunk) >= 10:
                    chunks.append('\n'.join(current_chunk))
                    current_chunk = [content]
                    current_size = content_size
                else:
                    current_chunk.append(content)
                    current_size += content_size

            if current_chunk:
                chunks.append('\n'.join(current_chunk))

            print(f"     [DOCX] Created {len(chunks)} chunks from {len(all_content)} paragraphs")
            return chunks
        except ImportError:
            raise ImportError("python-docx not installed. Run: pip install python-docx")

    # =========================================================================
    # CSV: Chunk by rows (50 rows per chunk)
    # =========================================================================
    elif file_ext == '.csv':
        import csv
        chunks = []
        current_chunk = []
        row_count = 0

        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            for row in reader:
                line = ' | '.join([cell.strip() for cell in row if cell.strip()])
                if line:
                    current_chunk.append(line)
                    row_count += 1

                    # Create chunk every 50 rows
                    if len(current_chunk) >= 50:
                        chunks.append('\n'.join(current_chunk))
                        current_chunk = []

        # Add remaining rows
        if current_chunk:
            chunks.append('\n'.join(current_chunk))

        print(f"     [CSV] Created {len(chunks)} chunks from {row_count} rows")
        return chunks

    # =========================================================================
    # TXT/RTF: Simple character-based chunking
    # =========================================================================
    else:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            full_text = f.read()

        chunks = _chunk_text_simple(full_text, chunk_size=4000)
        print(f"     [TXT] Created {len(chunks)} chunks from {len(full_text):,} characters")
        return chunks


def _chunk_text_simple(text: str, chunk_size: int = 4000) -> List[str]:
    """
    Split text into chunks by character count (no overlap).

    Args:
        text: Full text content
        chunk_size: Max characters per chunk (default 4000)

    Returns:
        List of text chunks
    """
    if len(text) <= chunk_size:
        return [text] if text.strip() else []

    chunks = []
    lines = text.split('\n')

    # Build chunks (no overlap)
    current_chunk_lines = []
    current_size = 0

    for line in lines:
        line_size = len(line) + 1  # +1 for newline

        if current_size + line_size > chunk_size and current_chunk_lines:
            # Save current chunk
            chunks.append('\n'.join(current_chunk_lines))

            # Start new chunk
            current_chunk_lines = [line]
            current_size = line_size
        else:
            current_chunk_lines.append(line)
            current_size += line_size

    if current_chunk_lines:
        chunks.append('\n'.join(current_chunk_lines))

    return chunks


def _extract_labor_categories_with_llm(text_chunk: str, chunk_index: int, year_columns: Optional[List[str]] = None) -> List[dict]:
    """
    Extract labor categories from a text chunk using GPT-4.

    Args:
        text_chunk: Text content from a page/chunk
        chunk_index: Index of the chunk (for debugging)
        year_columns: List of year column headers extracted from metadata (e.g., ['Year 6', 'Year 7', ...])

    Returns:
        List of labor category dicts
    """
    llm = get_chat_llm()

    # Build year context from metadata
    if year_columns and len(year_columns) > 0:
        year_nums = []
        for col in year_columns:
            # Extract number from "Year 6" -> "6"
            match = re.search(r'\d+', col)
            if match:
                year_nums.append(match.group())

        year_context = f"""
🎯 IMPORTANT: This document has the following year columns: {', '.join(year_columns)}
You MUST use these exact year numbers as keys in rates_by_year: {', '.join(year_nums)}
"""
    else:
        year_context = """
Look at the table header row to find the year columns (e.g., "Year 1", "Year 6", etc.)
Use the EXACT year numbers from the headers as keys in rates_by_year.
"""

    prompt = f"""Extract labor categories from this GSA contract rate schedule.
{year_context}
EXTRACTION RULES:
1. ONLY extract rows with BOTH a job title AND dollar rates
2. DO NOT extract SIN descriptions, headers, or rows without rates

FIELDS TO EXTRACT:
- title: Job title/position name (REQUIRED)
- sin: SIN code if present (e.g., "541330ENG", "541611")
- description: Job description or responsibilities. Look carefully for:
  * Text paragraphs below or near the job title
  * Duty statements or role descriptions
  * Any text explaining what this position does
  * If NO description text exists, omit this field or set to null
- experience: Years of experience required. Look for:
  * Dedicated "Experience" column in the table
  * Text like "5 years", "3-5 years minimum", "10+ years", "Entry Level", "Senior Level"
  * Words in the title like "Senior" (implies 5+ years), "Junior" (1-3 years), "Lead" (7+ years)
  * Roman numerals: "I" = Entry, "II" = 2-4 years, "III" = 5-7 years, "IV" = 8+ years
  * If NO experience info exists, omit this field or set to null
- rates_by_year: Dict with year numbers as keys and hourly rates as values (REQUIRED)

IMPORTANT: Only include description/experience if you actually find relevant text. Don't make up or infer information.

OUTPUT FORMAT (with data found):
[
  {{
    "title": "Administrative Specialist - Senior",
    "sin": "541330ENG",
    "description": "Provides administrative support including scheduling and document management.",
    "experience": "5+ years",
    "rates_by_year": {{"6": 36.49, "7": 37.19, "8": 37.89, "9": 38.61, "10": 39.35}}
  }}
]

OUTPUT FORMAT (if description/experience not found):
[
  {{
    "title": "Software Engineer II",
    "sin": "541511",
    "experience": "2-4 years",
    "rates_by_year": {{"6": 85.00, "7": 86.50}}
  }}
]

TEXT CHUNK:
{text_chunk}

Return ONLY valid JSON array:"""

    max_retries = 2
    for attempt in range(max_retries):
        try:
            response = llm.invoke(prompt)
            response_text = response.content.strip()

            # Remove markdown code blocks if present
            if response_text.startswith('```'):
                response_text = response_text.split('```')[1]
                if response_text.startswith('json'):
                    response_text = response_text[4:]
                response_text = response_text.strip()

            # Parse JSON
            labor_categories = json.loads(response_text)

            if not isinstance(labor_categories, list):
                labor_categories = [labor_categories]

            print(f"     Chunk {chunk_index + 1}: Extracted {len(labor_categories)} labor categories")
            return labor_categories

        except json.JSONDecodeError as e:
            if attempt < max_retries - 1:
                print(f"     ⚠️  Chunk {chunk_index + 1}: JSON parse error (attempt {attempt + 1}/{max_retries}): {e}")
                print(f"     🔄 Retrying chunk {chunk_index + 1}...")
                continue
            else:
                print(f"     ❌ Chunk {chunk_index + 1}: JSON parse error after {max_retries} attempts: {e}")
                return []
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"     ⚠️  Chunk {chunk_index + 1}: Extraction error (attempt {attempt + 1}/{max_retries}): {e}")
                print(f"     🔄 Retrying chunk {chunk_index + 1}...")
                continue
            else:
                print(f"     ❌ Chunk {chunk_index + 1}: Extraction error after {max_retries} attempts: {e}")
                return []

    return []


# =====================================================================
# MAIN FUNCTION
# =====================================================================

def parse_gsa_contract(file_path: str) -> dict:
    """
    Parse GSA contract and return data for MongoDB storage.

    Args:
        file_path: Path to GSA contract (PDF, Excel, or RTF)

    Returns:
        Dict with contract_number, dates, labor_categories, needs_date
    """
    import os

    file_ext = os.path.splitext(file_path)[1].lower()
    temp_file_path = None

    # Handle Excel files
    if file_ext in ['.xlsx', '.xls']:
        print(f"  Converting Excel to CSV...")
        temp_file_path = _convert_excel_to_csv(file_path)
        file_path = temp_file_path

    # Handle RTF files
    elif file_ext == '.rtf':
        print(f"  Converting RTF to TXT...")
        temp_file_path = _convert_rtf_to_txt(file_path)
        file_path = temp_file_path

    try:
        # Get singleton LlamaExtract instance
        extractor = get_llama_extract()

        # ========================================================================
        # PARALLEL STEP 1: Metadata + Chunking (in parallel)
        # ========================================================================
        import concurrent.futures as cf

        print("  🚀 Starting parallel preparation:")
        print("     Task 1: LlamaExtract → Document metadata (including year columns)")
        print("     Task 2: Chonkie TableChunker → Table-aware chunking")

        def extract_metadata():
            """Extract metadata using LlamaExtract."""
            print("     [Metadata] Starting...")
            metadata_config = ExtractConfig(extraction_mode=ExtractMode.PREMIUM)
            metadata_run = extractor.extract(
                GSAContractMetadata,
                metadata_config,
                file_path
            )
            metadata = metadata_run.data
            if isinstance(metadata, dict):
                metadata = GSAContractMetadata(**metadata)

            print(f"     [Metadata] ✓ Complete")
            if metadata.year_columns:
                print(f"     [Metadata] Year columns found: {metadata.year_columns}")
            else:
                print(f"     [Metadata] ⚠️ No year columns detected")

            return metadata

        def extract_and_chunk():
            """Extract and chunk text based on file type."""
            print("     [Chunking] Starting...")
            chunks = _extract_and_chunk_by_file_type(file_path)
            print(f"     [Chunking] ✓ Complete: {len(chunks)} chunks created")
            return chunks

        # Run metadata extraction and chunking in parallel
        with cf.ThreadPoolExecutor(max_workers=2) as executor:
            metadata_future = executor.submit(extract_metadata)
            chunks_future = executor.submit(extract_and_chunk)

            # Wait for both to complete
            metadata = metadata_future.result()
            chunks = chunks_future.result()

        year_columns = metadata.year_columns or []

        # ========================================================================
        # STEP 2: Extract labor categories using chunks + year context
        # ========================================================================
        print("     Step 2: GPT-4 → Labor category extraction")

        def extract_labor_categories_llm(chunks: List[str], year_cols: List[str]):
            """Extract labor categories using chunked text + GPT-4 with parallel processing."""
            import concurrent.futures as chunk_cf
            import threading as chunk_threading

            print("     [Labor] Starting...")

            # Thread-safe storage
            all_labor_categories = []
            seen_titles = set()
            lock = chunk_threading.Lock()

            def process_chunk(args):
                """Process a single chunk and return categories."""
                chunk_idx, chunk_text = args
                return chunk_idx, _extract_labor_categories_with_llm(chunk_text, chunk_idx, year_cols)

            # Process chunks in parallel (5 at a time)
            print(f"     [Labor] Processing {len(chunks)} chunks (5 parallel)...")
            with chunk_cf.ThreadPoolExecutor(max_workers=5) as chunk_executor:
                # Submit all chunks
                futures = {
                    chunk_executor.submit(process_chunk, (i, chunk)): i
                    for i, chunk in enumerate(chunks)
                }

                # Collect results as they complete
                for future in chunk_cf.as_completed(futures):
                    _, chunk_categories = future.result()

                    # Thread-safe deduplication
                    with lock:
                        for cat in chunk_categories:
                            title = cat.get('title', '').strip()
                            title_lower = title.lower()

                            if title and title_lower not in seen_titles:
                                seen_titles.add(title_lower)

                                # Convert to storage format
                                rates_by_year = cat.get('rates_by_year', {})
                                all_labor_categories.append({
                                    "lcat_id": f"lcat_{len(all_labor_categories)}",
                                    "sin": cat.get('sin'),
                                    "title": title,
                                    "description": cat.get('description'),
                                    "experience": cat.get('experience'),
                                    "rates_by_year": rates_by_year
                                })

            print(f"     [Labor] ✓ Complete: {len(all_labor_categories)} categories")
            return all_labor_categories

        labor_categories = extract_labor_categories_llm(chunks, year_columns)

        # ========================================================================
        # RESULTS SUMMARY
        # ========================================================================
        print(f"\n  ✅ Extraction Complete:")
        print(f"     Contract Number: {metadata.contract_number}")
        print(f"     Company Name: {metadata.company_name}")
        print(f"     Start Date: {metadata.contract_start_date}")
        print(f"     End Date: {metadata.contract_end_date}")
        print(f"     Total Labor Categories: {len(labor_categories)}")

        # Show first 3 and last 3
        if labor_categories:
            print(f"\n     Sample categories:")
            for i, lcat in enumerate(labor_categories[:3]):
                rates = lcat.get('rates_by_year', {})
                rate_str = f"${list(rates.values())[0]:.2f}" if rates else "No rates"
                print(f"       [{i+1}] {lcat['title']} - {rate_str}")

            if len(labor_categories) > 6:
                print(f"       ...")
                for i, lcat in enumerate(labor_categories[-3:]):
                    idx = len(labor_categories) - 3 + i + 1
                    rates = lcat.get('rates_by_year', {})
                    rate_str = f"${list(rates.values())[0]:.2f}" if rates else "No rates"
                    print(f"       [{idx}] {lcat['title']} - {rate_str}")

        # Parse dates
        start_date = _parse_date(metadata.contract_start_date)
        end_date = _parse_date(metadata.contract_end_date)

        return {
            "contract_number": metadata.contract_number,
            "contract_start_date": start_date,
            "contract_end_date": end_date,
            "company_name": metadata.company_name,
            "labor_categories": labor_categories,
            "needs_date": start_date is None
        }

    finally:
        if temp_file_path:
            try:
                os.unlink(temp_file_path)
            except Exception:
                pass


def _parse_date(date_str: Optional[str]) -> Optional[str]:
    """Parse date string to ISO format."""
    if not date_str:
        return None
    try:
        from dateutil import parser
        return parser.parse(date_str).strftime("%Y-%m-%d")
    except Exception:
        return date_str
