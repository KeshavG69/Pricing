"""GSA Contract parsing using LlamaExtract API."""

from typing import List, Optional
from pydantic import BaseModel, Field
import json

from app.settings import settings
from client.jd_parser import _convert_excel_to_csv
from client.llm_client import get_chat_llm

try:
    from llama_cloud_services import LlamaExtract
    from llama_cloud import ExtractConfig, ExtractMode
except ImportError:
    raise ImportError(
        "llama-cloud-services not installed. "
        "Run: pip install llama-cloud-services"
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
    # TXT/RTF: Chunk by character count (4000 chars per chunk)
    # =========================================================================
    else:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            full_text = f.read()

        chunks = _chunk_text(full_text, chunk_size=4000)
        print(f"     [TXT] Created {len(chunks)} chunks from {len(full_text):,} characters")
        return chunks


def _chunk_text(text: str, chunk_size: int = 4000) -> List[str]:
    """
    Split text into chunks by character count.

    Args:
        text: Full text content
        chunk_size: Max characters per chunk

    Returns:
        List of text chunks
    """
    chunks = []
    lines = text.split('\n')
    current_chunk = []
    current_size = 0

    for line in lines:
        line_size = len(line) + 1  # +1 for newline
        if current_size + line_size > chunk_size and current_chunk:
            chunks.append('\n'.join(current_chunk))
            current_chunk = [line]
            current_size = line_size
        else:
            current_chunk.append(line)
            current_size += line_size

    if current_chunk:
        chunks.append('\n'.join(current_chunk))

    return chunks


def _extract_labor_categories_with_llm(text_chunk: str, chunk_index: int) -> List[dict]:
    """
    Extract labor categories from a text chunk using GPT-4.

    Args:
        text_chunk: Text content from a page/chunk
        chunk_index: Index of the chunk (for debugging)

    Returns:
        List of labor category dicts
    """
    llm = get_chat_llm()

    prompt = f"""You are extracting labor categories from a GSA contract rate schedule.

CRITICAL INSTRUCTIONS:
1. ONLY extract rows that have BOTH:
   - A job title (e.g., "Software Engineer III", "Database Administrator - Senior")
   - Actual hourly rates in dollars (e.g., $125.50, $185.75)

2. DO NOT extract:
   - SIN descriptions without rates (e.g., "Engineering Services - SIN 54151S")
   - Service category headers
   - Table of contents
   - Any row without dollar amounts

3. For each labor category, extract:
   - title: Job title/position name (REQUIRED)
   - sin: SIN code or CLIN (if present)
   - education: Education requirement (if present)
   - experience: Years of experience (if present)
   - rates_by_year: Dict of year -> rate (e.g., {{"1": 125.50, "2": 129.06}})

4. Return ONLY valid JSON array of objects. Example:
[
  {{
    "title": "Software Engineer III",
    "sin": "54151S",
    "education": "Bachelors",
    "experience": "5",
    "rates_by_year": {{"1": 125.50, "2": 129.06, "3": 132.71}}
  }},
  {{
    "title": "Project Manager Senior",
    "sin": "54151S",
    "education": "Masters",
    "experience": "10",
    "rates_by_year": {{"1": 185.75, "2": 190.98}}
  }}
]

TEXT CHUNK:
{text_chunk}

Return ONLY the JSON array, no other text:"""

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
        print(f"     ⚠️  Chunk {chunk_index + 1}: JSON parse error: {e}")
        return []
    except Exception as e:
        print(f"     ⚠️  Chunk {chunk_index + 1}: Extraction error: {e}")
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

    api_key = settings.LLAMA_CLOUD_API_KEY
    if not api_key:
        raise ValueError("LLAMA_CLOUD_API_KEY not found")

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
        import concurrent.futures

        # Development SSL workaround
        disable_ssl = os.getenv("DISABLE_SSL_VERIFY", "false").lower() == "true"

        if disable_ssl:
            print("  ⚠️ SSL verification disabled (development mode)")
            extractor = LlamaExtract(api_key=api_key, verify=False)
        else:
            extractor = LlamaExtract(api_key=api_key)

        # ========================================================================
        # PARALLEL EXTRACTION
        # ========================================================================
        print("  🚀 Starting parallel extraction:")
        print("     Task 1: LlamaExtract → Document metadata")
        print("     Task 2: GPT-4 Chunking → Labor categories")

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
            return metadata

        def extract_labor_categories_llm():
            """Extract labor categories using intelligent chunking + GPT-4 with parallel processing."""
            import concurrent.futures as cf
            import threading

            print("     [Labor] Starting...")

            # Extract and chunk based on file type (PDF→pages, DOCX→paragraphs, CSV→rows, TXT→chars)
            chunks = _extract_and_chunk_by_file_type(file_path)

            # Thread-safe storage
            all_labor_categories = []
            seen_titles = set()
            lock = threading.Lock()

            def process_chunk(args):
                """Process a single chunk and return categories."""
                chunk_idx, chunk_text = args
                return chunk_idx, _extract_labor_categories_with_llm(chunk_text, chunk_idx)

            # Process chunks in parallel (5 at a time using semaphore pattern)
            print(f"     [Labor] Processing {len(chunks)} chunks (5 parallel)...")
            with cf.ThreadPoolExecutor(max_workers=5) as chunk_executor:
                # Submit all chunks
                futures = {
                    chunk_executor.submit(process_chunk, (i, chunk)): i
                    for i, chunk in enumerate(chunks)
                }

                # Collect results as they complete
                for future in cf.as_completed(futures):
                    chunk_idx, chunk_categories = future.result()

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
                                    "education": cat.get('education'),
                                    "experience": cat.get('experience'),
                                    "rates_by_year": rates_by_year
                                })

            print(f"     [Labor] ✓ Complete: {len(all_labor_categories)} categories")
            return all_labor_categories

        # Run both tasks in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            metadata_future = executor.submit(extract_metadata)
            labor_future = executor.submit(extract_labor_categories_llm)

            # Wait for both to complete
            metadata = metadata_future.result()
            labor_categories = labor_future.result()

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
