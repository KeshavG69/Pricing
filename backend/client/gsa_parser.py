"""GSA Contract parsing using LlamaExtract API."""

import re
from typing import List, Optional
from pydantic import BaseModel, Field
import json

from client.jd_parser import _convert_excel_to_csv
from client.llm_client import get_chat_llm
from client.llama_client import get_llama_extract

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


def _extract_and_chunk_by_file_type(file_path: str, chunk: bool = True) -> List[str]:
    """
    Extract text from file, optionally chunk it.

    Chunking Strategy (when chunk=True):
    - PDF: By pages (1 page = 1 chunk)
    - DOCX: By paragraphs (5-10 paragraphs or 4000 chars = 1 chunk)
    - CSV: By rows (50 rows = 1 chunk)
    - TXT/RTF: By character count (4000 chars = 1 chunk)

    Args:
        file_path: Path to file
        chunk: If True, chunk text. If False, return full text as single item.

    Returns:
        List with 1 item (full text) if chunk=False, or list of chunks if chunk=True
    """
    import os
    file_ext = os.path.splitext(file_path)[1].lower()

    # =========================================================================
    # PDF: Extract pages, optionally chunk
    # =========================================================================
    if file_ext == '.pdf':
        try:
            import PyPDF2
            pages = []
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text = page.extract_text()
                    if text.strip():
                        pages.append(text)

            if not chunk:
                full_text = '\n\n'.join(pages)
                print(f"     [PDF] Extracted full document: {len(full_text)} characters")
                return [full_text]
            else:
                print(f"     [PDF] Extracted {len(pages)} pages as chunks")
                return pages
        except ImportError:
            raise ImportError("PyPDF2 not installed. Run: pip install PyPDF2")

    # =========================================================================
    # DOCX: Extract content, optionally chunk
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

            if not chunk:
                full_text = '\n'.join(all_content)
                print(f"     [DOCX] Extracted full document: {len(full_text)} characters")
                return [full_text]

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
    # CSV: Extract rows, optionally chunk
    # =========================================================================
    elif file_ext == '.csv':
        import csv
        all_lines = []

        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            for row in reader:
                line = ' | '.join([cell.strip() for cell in row if cell.strip()])
                if line:
                    all_lines.append(line)

        if not chunk:
            full_text = '\n'.join(all_lines)
            print(f"     [CSV] Extracted full document: {len(full_text)} characters")
            return [full_text]

        # Chunk by rows (50 rows per chunk)
        chunks = []
        for i in range(0, len(all_lines), 50):
            chunk_lines = all_lines[i:i+50]
            chunks.append('\n'.join(chunk_lines))

        print(f"     [CSV] Created {len(chunks)} chunks from {len(all_lines)} rows")
        return chunks

    # =========================================================================
    # TXT/RTF: Extract text, optionally chunk
    # =========================================================================
    else:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            full_text = f.read()

        if not chunk:
            print(f"     [TXT] Extracted full document: {len(full_text)} characters")
            return [full_text]

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


def _extract_descriptions_with_llm(text_chunk: str, chunk_index: int) -> List[dict]:
    """
    Extract ONLY job descriptions, qualifications, and experience (NO RATES).

    Args:
        text_chunk: Text content from a page/chunk
        chunk_index: Index of the chunk (for debugging)

    Returns:
        List of dicts with title, sin, description, experience
    """
    llm = get_chat_llm(max_tokens=30000)

    prompt = f"""Extract job descriptions and qualifications from this GSA contract document.

EXTRACTION RULES:
1. Extract ALL job titles you find
2. Extract descriptions and experience/education requirements
3. IGNORE dollar amounts and rates - we only want qualifications

FIELDS TO EXTRACT:
- title: Job title/position name (REQUIRED)
- sin: SIN code if present (e.g., "541330ENG", "541611")
- description: Job description, duties, responsibilities. Look for:
  * Text paragraphs describing what the position does
  * Duty statements or role descriptions
  * Required skills or competencies
  * If NO description exists, omit this field
- experience: Years of experience or education required. Look for:
  * Text like "5 years", "3-5 years minimum", "10+ years"
  * Education: "Bachelor's degree", "Master's required", "PhD preferred"
  * Level indicators: "Senior" (5+ years), "Junior" (1-3 years), "Lead" (7+ years)
  * Roman numerals: "I" = Entry, "II" = 2-4 years, "III" = 5-7 years, "IV" = 8+ years
  * If NO experience info exists, omit this field

OUTPUT FORMAT:
[
  {{
    "title": "Senior Systems Engineer",
    "sin": "541330",
    "description": "Designs and implements enterprise infrastructure solutions...",
    "experience": "5+ years with Bachelor's degree"
  }},
  {{
    "title": "Administrative Specialist",
    "sin": "541611",
    "description": "Provides administrative support including scheduling..."
  }}
]

TEXT CHUNK:
{text_chunk}

Return ONLY valid JSON array. If no job descriptions found, return empty array []:"""

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
        descriptions = json.loads(response_text)

        if not isinstance(descriptions, list):
            descriptions = [descriptions]

        print(f"     [Descriptions] Chunk {chunk_index + 1}: Extracted {len(descriptions)} job descriptions")
        return descriptions

    except Exception as e:
        print(f"     [Descriptions] ❌ Chunk {chunk_index + 1}: Error: {e}")
        return []


def _extract_rates_with_llm(text_chunk: str, chunk_index: int, year_columns: Optional[List[str]] = None) -> List[dict]:
    """
    Extract ONLY rate tables with dollar amounts (NO DESCRIPTIONS).

    Args:
        text_chunk: Text content from a page/chunk
        chunk_index: Index of the chunk (for debugging)
        year_columns: List of year column headers from metadata

    Returns:
        List of dicts with title, sin, rates_by_year
    """
    llm = get_chat_llm(max_tokens=30000)

    # Build year context from metadata
    if year_columns and len(year_columns) > 0:
        year_nums = []
        for col in year_columns:
            match = re.search(r'\d+', col)
            if match:
                year_nums.append(match.group())

        year_context = f"""
🎯 IMPORTANT: This document has year columns: {', '.join(year_columns)}
Use these EXACT year numbers as keys in rates_by_year: {', '.join(year_nums)}
"""
    else:
        year_context = """
Look at the table header row to find year columns (e.g., "Year 1", "Year 6", etc.)
Use the EXACT year numbers from headers as keys in rates_by_year.
"""

    prompt = f"""Extract ONLY rate/pricing tables from this GSA contract document.
{year_context}

🎯 YOUR TASK: Find tables with job titles and dollar amounts (hourly rates).

EXTRACTION RULES:
1. Look for TABLE FORMAT with:
   - Column 1: Job titles (e.g., "Senior Systems Engineer", "Administrative Specialist")
   - Other columns: Dollar amounts per year (e.g., "$125.50", "$45.00")
2. ONLY extract rows that have BOTH:
   - A clear job title/labor category name
   - At least one dollar rate (hourly or annual)
3. IGNORE completely:
   - Job descriptions and duty statements
   - Qualifications, experience, education requirements
   - Table headers and SIN category descriptions
   - Rows without any dollar amounts

DOLLAR AMOUNT HANDLING:
- If you see hourly rates (e.g., "$125.50/hr", "$45.00"), use them directly
- If you see annual salaries (e.g., "$95,000"), convert to hourly: annual ÷ 2080
- Remove any "$" signs and commas from the numbers
- Store rates as plain numbers (e.g., 125.50, not "$125.50")

YEAR COLUMN DETECTION:
- Look at the table header row to identify year columns
- Common formats: "Year 1", "Year 6", "Yr 1", "Option Year 2", "Base Year"
- Extract the year NUMBER from the header (e.g., "Year 6" → use key "6")
- If no year numbers visible, use sequential numbers: "1", "2", "3"...

FIELDS TO EXTRACT:
- title: Exact job title from the table (REQUIRED)
- sin: SIN code if visible in same row (e.g., "541330ENG", "541611") - optional
- rates_by_year: Dictionary with year numbers as STRING keys and rates as NUMBERS
  Example: {{"1": 125.50, "2": 128.00, "3": 130.56}}

OUTPUT FORMAT EXAMPLES:

Example 1 - Hourly rates:
[
  {{
    "title": "Senior Systems Engineer",
    "sin": "541330",
    "rates_by_year": {{"1": 125.50, "2": 128.00, "3": 130.56}}
  }}
]

Example 2 - Annual salary converted:
[
  {{
    "title": "Administrative Specialist",
    "rates_by_year": {{"1": 45.67, "2": 46.35}}
  }}
]

Example 3 - Multiple years:
[
  {{
    "title": "Program Manager",
    "sin": "541611",
    "rates_by_year": {{"6": 175.00, "7": 180.25, "8": 185.65, "9": 191.22, "10": 197.00}}
  }}
]

IMPORTANT:
- Focus ONLY on finding rate tables (rows with $ amounts)
- Ignore any text paragraphs, descriptions, or qualifications
- If this chunk has no rate tables, return empty array: []

TEXT CHUNK TO ANALYZE:
{text_chunk}

Return ONLY valid JSON array:"""

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
        rates = json.loads(response_text)

        if not isinstance(rates, list):
            rates = [rates]

        print(f"     [Rates] Chunk {chunk_index + 1}: Extracted {len(rates)} rate entries")
        return rates

    except Exception as e:
        print(f"     [Rates] ❌ Chunk {chunk_index + 1}: Error: {e}")
        return []


def _merge_descriptions_and_rates(descriptions: List[dict], rates: List[dict]) -> List[dict]:
    """
    Merge job descriptions with rate tables by matching title + SIN.

    Args:
        descriptions: List of dicts with {title, sin, description, experience}
        rates: List of dicts with {title, sin, rates_by_year}

    Returns:
        Merged list with complete labor category data
    """
    from difflib import SequenceMatcher

    def normalize_title(title: str) -> str:
        """Normalize title for fuzzy matching."""
        return title.lower().strip().replace('-', ' ').replace('/', ' ')

    def fuzzy_match_score(str1: str, str2: str) -> float:
        """Calculate similarity score between two strings (0.0 to 1.0)."""
        return SequenceMatcher(None, normalize_title(str1), normalize_title(str2)).ratio()

    # Build lookup for rates by (title, sin) and by title only
    rates_by_key = {}
    rates_by_title = {}

    for rate in rates:
        title = rate.get('title', '').strip()
        sin = rate.get('sin', '').strip()

        if not title:
            continue

        # Index by (title, sin) if SIN exists
        if sin:
            key = (normalize_title(title), sin.upper())
            rates_by_key[key] = rate

        # Index by title only
        rates_by_title[normalize_title(title)] = rate

    # Merge descriptions with rates
    merged = []
    matched_rate_indices = set()  # Track indices of matched rates

    for desc in descriptions:
        title = desc.get('title', '').strip()
        sin = desc.get('sin', '').strip()

        if not title:
            continue

        # Try exact match by (title, sin)
        matched_rate = None
        if sin:
            key = (normalize_title(title), sin.upper())
            matched_rate = rates_by_key.get(key)

        # Try exact match by title only
        if not matched_rate:
            matched_rate = rates_by_title.get(normalize_title(title))

        # Try fuzzy match if no exact match
        matched_rate_index = None
        if not matched_rate:
            best_score = 0.0
            best_match = None
            best_match_index = None

            for idx, rate in enumerate(rates):
                rate_title = rate.get('title', '').strip()
                if not rate_title:
                    continue

                score = fuzzy_match_score(title, rate_title)
                if score > best_score and score >= 0.85:  # 85% similarity threshold
                    best_score = score
                    best_match = rate
                    best_match_index = idx

            if best_match:
                matched_rate = best_match
                matched_rate_index = best_match_index
                print(f"     [Merge] Fuzzy matched: '{title}' → '{best_match.get('title')}' (score: {best_score:.2f})")
        else:
            # Find index of matched rate
            for idx, rate in enumerate(rates):
                if rate == matched_rate:
                    matched_rate_index = idx
                    break

        # Merge data
        if matched_rate:
            merged_entry = {
                'title': title,  # Use description's title (usually cleaner)
                'sin': sin or matched_rate.get('sin'),
                'description': desc.get('description'),
                'experience': desc.get('experience'),
                'rates_by_year': matched_rate.get('rates_by_year', {})
            }
            merged.append(merged_entry)
            if matched_rate_index is not None:
                matched_rate_indices.add(matched_rate_index)
        else:
            # Keep description even without rates
            merged.append(desc)
            print(f"     [Merge] ⚠️  No rates found for: '{title}'")

    # Add unmatched rates (rates without descriptions)
    for idx, rate in enumerate(rates):
        if idx not in matched_rate_indices:
            title = rate.get('title', '').strip()
            if title:
                merged.append({
                    'title': title,
                    'sin': rate.get('sin'),
                    'rates_by_year': rate.get('rates_by_year', {})
                })
                print(f"     [Merge] ⚠️  No description found for: '{title}'")

    return merged


# =====================================================================
# PAGE COUNTING FOR ADAPTIVE ROUTING
# =====================================================================

def estimate_page_count(file_path: str) -> int:
    """
    Estimate page count for routing decision.
    Returns: Estimated page count (±20% accuracy is acceptable)
    """
    import os
    ext = os.path.splitext(file_path)[1].lower()

    try:
        if ext == '.pdf':
            import PyPDF2
            with open(file_path, 'rb') as f:
                return len(PyPDF2.PdfReader(f).pages)

        elif ext == '.docx':
            import docx
            doc = docx.Document(file_path)
            word_count = sum(len(p.text.split()) for p in doc.paragraphs)
            return max(1, word_count // 500)  # ~500 words/page

        elif ext == '.rtf':
            from striprtf.striprtf import rtf_to_text
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = rtf_to_text(f.read())
            return max(1, len(text) // 3000)  # ~3000 chars/page

        elif ext == '.txt':
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return max(1, len(f.read()) // 3000)  # ~3000 chars/page

        elif ext in ['.csv', '.xlsx', '.xls']:
            if ext == '.csv':
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    row_count = sum(1 for _ in f)
            else:
                file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
                row_count = int(file_size_mb * 1000)
            return max(1, row_count // 50)  # ~50 rows/page

        else:
            return 100  # Unknown format → force chunking

    except Exception:
        return 100  # Error → force chunking


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
        # ========================================================================
        # STEP 0: Adaptive routing based on document size
        # ========================================================================
        page_count = estimate_page_count(file_path)
        use_full_doc = page_count < 50
        strategy = "Full Document" if use_full_doc else "Chunking"
        print(f"  📊 Document size: ~{page_count} pages → {strategy} strategy")

        # Get singleton LlamaExtract instance
        extractor = get_llama_extract()

        # ========================================================================
        # PARALLEL STEP 1: Metadata + Text Extraction (in parallel)
        # ========================================================================
        import concurrent.futures as cf

        print("  🚀 Starting parallel preparation:")
        print("     Task 1: LlamaExtract → Document metadata (including year columns)")
        print(f"     Task 2: Text extraction → {strategy}")

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
            """Extract text based on file type and routing decision."""
            # Pass chunk=False for full doc, chunk=True for chunking
            return _extract_and_chunk_by_file_type(file_path, chunk=not use_full_doc)

        # Run metadata extraction and chunking in parallel
        with cf.ThreadPoolExecutor(max_workers=2) as executor:
            metadata_future = executor.submit(extract_metadata)
            chunks_future = executor.submit(extract_and_chunk)

            # Wait for both to complete
            metadata = metadata_future.result()
            chunks = chunks_future.result()

        year_columns = metadata.year_columns or []

        # ========================================================================
        # STEP 2: TWO-PARSER EXTRACTION (Descriptions + Rates in parallel)
        # ========================================================================
        chunk_info = f"{len(chunks)} chunk(s)" if len(chunks) == 1 else f"{len(chunks)} chunks"
        print(f"  🎯 Step 2: Dual-Parser Extraction ({chunk_info})")

        def extract_with_two_parsers(chunks: List[str], year_cols: List[str]):
            """
            Extract labor categories using TWO separate parsers:
            1. Description parser (titles, SINs, descriptions, experience)
            2. Rate parser (titles, SINs, rates_by_year)
            Then merge results by matching title + SIN.
            """
            import concurrent.futures as chunk_cf

            print("     [Dual-Parser] Starting parallel extraction...")
            if len(chunks) == 1:
                print(f"     [Dual-Parser] Processing full document")
            else:
                print(f"     [Dual-Parser] Processing {len(chunks)} chunks")
            print(f"     [Dual-Parser] Using 5 dedicated workers for descriptions + 5 for rates (10 total)")

            # Storage for both parsers
            all_descriptions = []
            all_rates = []

            # ================================================================
            # Run BOTH parsers on ALL chunks in parallel (DEDICATED WORKERS)
            # ================================================================
            def process_chunk_descriptions(args):
                """Extract descriptions from a chunk."""
                chunk_idx, chunk_text = args
                return _extract_descriptions_with_llm(chunk_text, chunk_idx)

            def process_chunk_rates(args):
                """Extract rates from a chunk."""
                chunk_idx, chunk_text = args
                return _extract_rates_with_llm(chunk_text, chunk_idx, year_cols)

            # TWO SEPARATE EXECUTORS: 5 workers for descriptions + 5 workers for rates
            # This ensures TRUE parallel processing with dedicated resources for each parser
            with chunk_cf.ThreadPoolExecutor(max_workers=5) as desc_executor, \
                 chunk_cf.ThreadPoolExecutor(max_workers=5) as rate_executor:

                # Submit description extraction for all chunks (5 parallel workers)
                desc_futures = [
                    desc_executor.submit(process_chunk_descriptions, (i, chunk))
                    for i, chunk in enumerate(chunks)
                ]

                # Submit rate extraction for all chunks (5 parallel workers)
                rate_futures = [
                    rate_executor.submit(process_chunk_rates, (i, chunk))
                    for i, chunk in enumerate(chunks)
                ]

                # Collect descriptions as they complete
                for future in chunk_cf.as_completed(desc_futures):
                    chunk_descriptions = future.result()
                    all_descriptions.extend(chunk_descriptions)

                # Collect rates as they complete
                for future in chunk_cf.as_completed(rate_futures):
                    chunk_rates = future.result()
                    all_rates.extend(chunk_rates)

            print(f"     [Dual-Parser] Description parser: {len(all_descriptions)} entries")
            print(f"     [Dual-Parser] Rate parser: {len(all_rates)} entries")

            # ================================================================
            # MERGE descriptions + rates by title/SIN matching
            # ================================================================
            print(f"     [Merge] Matching descriptions with rates...")
            merged = _merge_descriptions_and_rates(all_descriptions, all_rates)
            print(f"     [Merge] ✓ Complete: {len(merged)} labor categories")

            # ================================================================
            # Convert to storage format with deduplication
            # ================================================================
            seen_titles = set()
            final_categories = []

            for cat in merged:
                title = cat.get('title', '').strip()
                title_lower = title.lower()

                if title and title_lower not in seen_titles:
                    seen_titles.add(title_lower)

                    final_categories.append({
                        "lcat_id": f"lcat_{len(final_categories)}",
                        "sin": cat.get('sin'),
                        "title": title,
                        "description": cat.get('description'),
                        "experience": cat.get('experience'),
                        "rates_by_year": cat.get('rates_by_year', {})
                    })

            return final_categories

        labor_categories = extract_with_two_parsers(chunks, year_columns)

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
