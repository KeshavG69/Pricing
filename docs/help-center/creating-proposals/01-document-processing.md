# How Document Processing Works

**Article Type:** Explainer with Diagram | **Priority:** P0 | **Reading Time:** 5 minutes

Understand the AI pipeline that transforms your RFP documents into structured pricing data.

---

## Overview

PriceIQ uses a sophisticated AI pipeline to automatically extract job positions from your RFP documents. This article explains each step of the process, from document upload to final pricing workspace.

**Processing Steps:**
1. Document Upload
2. Parsing (LlamaExtract + GPT-4)
3. Parallel Agent Processing (10 concurrent workers)
4. SOC Code Matching (FAISS Vector Search)
5. BLS Wage Data Lookup (MongoDB, 6M+ records)
6. FBLR Calculation
7. Position Splitting & Finalization
8. Results Delivered to Pricing Workspace

**Total Time:** 30 seconds to 5 minutes (depending on document size and complexity)

---

## Step 1: Document Upload

**What Happens:**
- User uploads PDF, DOCX, or XLSX files via web interface
- Files transmitted to backend server (FastAPI)
- Stored temporarily in memory for processing
- Original files saved to MongoDB for reference (viewable in Source Files tab)

**Supported Formats:**
- PDF (.pdf)
- Microsoft Word (.docx)
- Microsoft Excel (.xlsx, .xls)

**Size Limit:** 2MB per file

**See Also:** [Uploading Documents & Tracking Progress](02-uploading-documents.md)

---

## Step 2: Document Parsing

**Technology:** LlamaExtract (LlamaCloud API) + GPT-4

### LlamaExtract Phase

**What It Does:**
- Converts PDF/DOCX/XLSX to structured JSON
- Extracts text while preserving document structure
- Identifies tables, lists, sections
- Performs OCR on scanned documents
- Handles multi-column layouts

**Output:** JSON representation of document with hierarchical structure

**Example JSON:**
```json
{
  "sections": [
    {
      "title": "Labor Requirements",
      "content": "The contractor shall provide the following positions...",
      "tables": [
        {
          "headers": ["Labor Category", "Hours", "Experience"],
          "rows": [
            ["Software Engineer III", "2080", "5+ years"],
            ["Project Manager", "1920", "3-5 years"]
          ]
        }
      ]
    }
  ]
}
```

**Processing Time:** 10-20 seconds (depends on page count and complexity)

---

### GPT-4 Extraction Phase

**What It Does:**
- Analyzes structured JSON from LlamaExtract
- Identifies job positions and labor categories
- Extracts hours per position
- Infers experience levels from descriptions
- Cleans and normalizes data

**AI Prompt Strategy:**
The system uses a specialized prompt that instructs GPT-4 to:
1. Find all labor category names
2. Extract hours (annual, FTE, or by period)
3. Determine experience level (Junior, Mid-Level, Senior)
4. Extract job descriptions for SOC matching
5. Handle multi-year contracts (Base Period, Option Years)

**Output:** Array of position objects

**Example Position Object:**
```json
{
  "labor_category": "Software Engineer III",
  "job_description": "Develops web applications using React and Node.js. Requires 5+ years experience.",
  "experience_level": "Senior",
  "hours": {
    "Base Period": 2080,
    "Option Year 1": 2080,
    "Option Year 2": 2080
  }
}
```

**Processing Time:** 20-40 seconds (10 parallel agents, 2-4 seconds per position)

---

## Step 3: Parallel Agent Processing

**Architecture:** 10 Concurrent Workers using asyncio.gather()

**Why Parallel Processing?**
- **Speed**: 50 positions processed in ~5 minutes (vs 25 minutes serial)
- **Efficiency**: Maximizes GPU utilization for AI models
- **Scalability**: Handles large RFPs with 100+ positions

**How It Works:**
1. Extracted positions (from Step 2) split into batches
2. Each batch assigned to an agent (worker)
3. Agents process 2-3 positions each concurrently
4. Semaphore limits to 10 concurrent agents (prevents API rate limiting)
5. Results collected via asyncio.gather()

**Agent Responsibilities:**
- SOC code matching (FAISS vector search)
- Wage data lookup (MongoDB query)
- FBLR calculation
- Error handling and retries

---

## Step 4: SOC Code Matching (FAISS Vector Search)

**Technology:** FAISS (Facebook AI Similarity Search)

**Purpose:** Match job descriptions to Standard Occupational Classification (SOC) codes

### How Vector Search Works

**1. Embedding Generation:**
- Job description converted to 1536-dimension vector
- Uses OpenAI text-embedding-ada-002 model
- Vector represents semantic meaning of text

**Example:**
- "Software Engineer" → [0.032, -0.015, 0.089, ..., 0.021] (1536 numbers)
- "Application Developer" → [0.029, -0.012, 0.091, ..., 0.019] (similar vector)

**2. Similarity Search:**
- Query vector compared to 1,100 SOC code vectors (pre-computed, cached in FAISS index)
- Cosine similarity calculated for each SOC code
- Top 5 most similar SOC codes returned with similarity scores

**3. Best Match Selection:**
- Highest similarity score selected (typically >0.75 for good matches)
- SOC code and title stored with position

**Example Match:**
- Job description: "Develops software applications using Java and Python"
- Matched SOC: 15-1252 (Software Developers, Applications)
- Similarity score: 0.89 (excellent match)

**Accuracy:** 85-95% on first match

**Fallback:** If no good match (similarity <0.60), defaults to generic code or prompts for manual selection

**Processing Time:** <100ms per position (after FAISS index pre-warm)

**See Also:** [How SOC Matching Works](../data-sources/04-soc-matching-faiss.md)

---

## Step 5: BLS Wage Data Lookup

**Technology:** MongoDB Query (6M+ wage records)

**Purpose:** Retrieve accurate wage data for matched SOC code

### Query Parameters

**Required:**
- SOC Code (e.g., "15-1252")
- Area Code (default: national or user-selected MSA)

**Query Example:**
```python
wage_data = db.wage_data.find_one({
    "soc_code": "15-1252",
    "area_code": "0000"  # National
})
```

**Result:**
```json
{
  "soc_code": "15-1252",
  "soc_title": "Software Developers, Applications",
  "area_code": "0000",
  "area_title": "U.S. National",
  "percentile_25": 78630,
  "percentile_50": 107510,
  "percentile_75": 136320,
  "percentile_90": 168570,
  "employment": 1847900
}
```

### Percentile Selection

**Auto-Selection Logic:**
- **< 3 years experience** → 25th percentile
- **3-5 years experience** → 50th percentile (median)
- **> 5 years experience** → 75th percentile

**Example:**
- Position: "Software Engineer III, Senior (5+ years)"
- Experience: Senior
- Selected: 75th percentile ($136,320 annual)

**Processing Time:** <50ms per position (MongoDB indexed query)

**See Also:** [Understanding BLS OEWS Data](../data-sources/01-bls-oews-explained.md)

---

## Step 6: FBLR Calculation

**Technology:** Backend Calculation Service (Python)

**Purpose:** Apply indirect rates to calculate Fully Burdened Labor Rate

### Cascade Formula

```
Direct Labor (DL) = Annual Wage ÷ Standard FTE Hours
Fringe = DL × Fringe Rate
Overhead (OH) = (DL + Fringe) × OH Rate
G&A = (DL + Fringe + OH) × G&A Rate
Fee = (DL + Fringe + OH + G&A) × Fee Rate
FBLR = DL + Fringe + OH + G&A + Fee
```

**Example Calculation:**
```
Annual Wage: $136,320 (75th percentile)
Standard FTE: 2080 hours

Direct Labor: $136,320 ÷ 2080 = $65.54/hour
Fringe (24.7%): $65.54 × 0.247 = $16.19
OH (7.11%): ($65.54 + $16.19) × 0.0711 = $5.81
G&A (22.43%): ($65.54 + $16.19 + $5.81) × 0.2243 = $19.62
Fee (8%): ($65.54 + $16.19 + $5.81 + $19.62) × 0.08 = $8.89
FBLR: $115.25/hour
```

**Indirect Rates Source:**
- Organization settings (default or customized by admin)
- Default: Fringe 24.7%, OH 7.11%, G&A 22.43%, Fee 8%

**Location Type:**
- **On-Site**: Uses oh_onsite rate
- **Off-Site**: Uses oh_offsite rate
- Default: On-Site

**Processing Time:** <10ms per position (simple arithmetic)

**See Also:** [Understanding FBLR Calculations](../advanced-workspace/02-fblr-calculations.md)

---

## Step 7: Position Splitting & Finalization

**Purpose:** Handle positions with >1920 hours (FTE threshold)

### Position Splitting Algorithm

**Threshold:** 1920 hours (standard FTE: 40 hours/week × 48 weeks)

**Logic:**
```python
if hours > 1920:
    num_positions = ceil(hours / 1920)
    base_hours = floor(hours / num_positions)
    remainder = hours % num_positions
    # Create num_positions, distribute remainder
```

**Example 1:**
- Input: Software Engineer, 5760 hours
- Split: 3 positions × 1920 hours each

**Example 2:**
- Input: Project Manager, 5800 hours
- Split: 4 positions (1450, 1450, 1450, 1450 hours)

**Why Split?**
- Government contracts price by FTE
- Easier to understand and verify
- Aligns with standard contracting practices

**Result:** Multiple position rows in pricing workspace

**See Also:** [Position Splitting (>1920 Hours)](../advanced-workspace/10-position-splitting.md)

---

## Step 8: Results Delivered

**Final Steps:**
1. All positions saved to MongoDB (proposals collection)
2. Proposal status set to "Analyzed"
3. Frontend redirected to pricing workspace
4. Positions loaded into Excel-like grid
5. User can review, edit, and export

**What's Included:**
- Labor Category name
- SOC Code and title
- Experience level
- Hours per year (Base Period + Option Years)
- FBLR (Fully Burdened Labor Rate)
- Total cost per position

**Next Steps for User:**
- Review SOC codes (use "Change SOC Code" if needed)
- Verify hours match RFP
- Adjust indirect rates if needed
- Add subcontractors, ODCs, travel
- Export to Excel

---

## Processing Status Indicators

**What You See During Processing:**

### Progress Bar

**Location:** Center of status page

**States:**
- 0-20%: "Parsing documents..."
- 20-60%: "Extracting positions..." (longest phase)
- 60-80%: "Matching SOC codes..."
- 80-95%: "Calculating pricing..."
- 95-100%: "Finalizing proposal..."

---

### Estimated Time Remaining

**Location:** Below progress bar

**Calculation:** Based on document size and current phase

**Examples:**
- "About 30 seconds remaining"
- "About 2 minutes remaining"

**Note:** Estimate may adjust as processing progresses

---

## Error Handling & Recovery

### Parsing Errors

**Problem:** LlamaExtract cannot parse document

**Possible Causes:**
- Corrupted PDF
- Password-protected file
- Unsupported format
- Document too complex

**System Response:**
- Error message: "Failed to parse document"
- User can retry or upload different format

---

### Extraction Errors

**Problem:** GPT-4 finds no positions

**Possible Causes:**
- Document doesn't contain labor categories
- Format not recognized by AI
- Text too ambiguous

**System Response:**
- Warning: "No positions found"
- User redirected to empty pricing workspace
- Can add positions manually

---

### SOC Matching Errors

**Problem:** No good SOC code match

**System Response:**
- Uses fallback generic SOC code
- User can change SOC code later

---

### Wage Data Missing

**Problem:** MongoDB has no wage data for SOC code + area

**System Response:**
- Error logged
- Position excluded from results
- User notified in processing results

---

## Technical Architecture

**Backend Stack:**
- FastAPI (Python 3.13)
- MongoDB (6M+ wage records)
- FAISS (vector search index)
- OpenAI API (embeddings, GPT-4)
- LlamaCloud API (document parsing)

**Frontend:**
- Next.js 16 (React 19)
- Real-time status updates (polling)
- Auto-redirect on completion

**Optimization:**
- FAISS index pre-warmed on startup (~30s)
- MongoDB connection pool
- Parallel agent processing (10 workers)
- Caching of frequently used wage data

**See Also:** [FAISS Vector Search for SOC Matching](../advanced-concepts/01-faiss-soc-matching.md)

---

## Related Articles

**Next Steps:**
- [Uploading Documents & Tracking Progress](02-uploading-documents.md)
- [Understanding Processing Results](03-understanding-results.md)
- [Reviewing Extracted Positions](04-reviewing-positions.md)

**Data Sources:**
- [Understanding BLS OEWS Data](../data-sources/01-bls-oews-explained.md)
- [What Are SOC Codes?](../data-sources/02-soc-codes-explained.md)
- [How SOC Matching Works](../data-sources/04-soc-matching-faiss.md)

**Troubleshooting:**
- [Document Processing Failed](../troubleshooting/01-processing-errors.md)
- [Handling Processing Errors](05-handling-errors.md)

---

**Last Updated**: January 15, 2026
