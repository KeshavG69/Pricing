# GSA Wage Repository - Implementation Plan

## Overview

This feature allows companies to upload their GSA contract rate sheets and use those rates (instead of BLS rates) when creating proposals.

### Key Points

- **GSA rates are final rates** - No indirect rates (fringe, OH, G&A, fee) applied
- **Year calculation is automatic** - Based on current year vs contract start date
- **Discounts per position** - User can apply different discount % to each position
- **Subcontractors** - Use their rate + S&MH (same as current)
- **Admin only upload** - Only admins can upload/delete GSA contracts
- **Multiple files per org** - One organization can have many GSA contract files

---

## How It Works

### Admin Flow (One-time Setup)

1. Admin goes to Wage Repository page
2. Uploads GSA contract (PDF or Excel)
3. System parses and extracts labor categories with rates
4. If contract date not found, admin enters it manually
5. File is now available for all users in the organization

### User Flow (Creating Proposal)

1. User uploads solicitation document
2. User selects wage source:
   - BLS Government Data (default)
   - "GSA MAS 2020-2030" (uploaded file)
   - "OASIS+ Contract 2023" (another file)
3. Agent matches positions to GSA labor categories (same pattern as BLS)
4. System calculates which GSA year based on current date
5. User can apply discounts per position
6. Final rate = GSA rate × (1 - discount)

### Year Calculation

```
GSA Contract started: January 15, 2020
Current date: December 24, 2024

2020 = Year 1
2021 = Year 2
2022 = Year 3
2023 = Year 4
2024 = Year 5  ← Current year

For multi-year proposal:
- Proposal Year 1 → GSA Year 5
- Proposal Year 2 → GSA Year 6
- Proposal Year 3 → GSA Year 7

If proposal needs Year 11+ but contract only has 10 years → Show error
```

---

## Database Schema

### Collection: `wage_repositories`

```python
{
    "_id": ObjectId,
    "organization_id": ObjectId,
    "file_id": str,  # Unique identifier for this file
    "name": str,  # "GSA MAS Contract 2020-2030"
    "contract_number": str,  # "GS-35F-1234" (optional)

    # Contract dates (for year calculation)
    "contract_start_date": datetime,
    "contract_end_date": datetime,  # optional
    "total_years": int,  # How many years of rates available

    # Original file reference
    "original_file": {
        "filename": str,
        "idrive_key": str,
        "idrive_url": str
    },

    # Labor categories with rates
    "labor_categories": [
        {
            "lcat_id": str,
            "title": str,  # "Program Manager"
            "description": str,  # Job description
            "education": str,  # "Bachelor's Degree" (optional)
            "experience": str,  # "7-10 years" (optional)
            "rates_by_year": {
                "1": float,  # Year 1 rate
                "2": float,  # Year 2 rate
                "3": float,
                # ... up to year 10
            }
        }
    ],

    # Status
    "status": str,  # "processing", "needs_date", "active", "error"
    "error_message": str,  # If status is "error"

    # Metadata
    "created_by": ObjectId,
    "created_at": datetime,
    "updated_at": datetime
}
```

### Pinecone Vector Storage

```python
{
    "id": "org123_file456_lcat001",
    "values": [0.123, 0.456, ...],  # Embedding of title + description
    "metadata": {
        "organization_id": "org123",
        "file_id": "file456",
        "lcat_id": "lcat001",
        "title": "Program Manager"
    }
}
```

---

## API Endpoints

### New Router: `/api/wage-repository`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/upload` | Upload GSA contract file | Admin |
| GET | `/` | List all files for org | User |
| GET | `/{file_id}` | Get file details | User |
| GET | `/{file_id}/status` | Check processing status | User |
| PATCH | `/{file_id}` | Update contract dates | Admin |
| DELETE | `/{file_id}` | Delete file | Admin |

### Modified Endpoint: `POST /api/proposals/upload`

New parameter `wage_source`:

```json
{
    "files": ["..."],
    "name": "CISA Proposal",
    "wage_source": {
        "type": "gsa",
        "file_id": "abc123"
    }
}
```

If `wage_source.type` is "bls" or not provided, use current BLS flow.
If `wage_source.type` is "gsa", use GSA flow with specified file.

---

## Agent Tools

### Factory Functions

Tools are created with `organization_id` and `file_id` baked in:

```python
def create_search_gsa_labor_categories(organization_id: str, file_id: str):
    """Factory function that returns search tool with org/file pre-configured"""

    def search_gsa_labor_categories(query: str) -> List[dict]:
        """Search for matching GSA labor categories.

        Args:
            query: Job description or title to search for

        Returns:
            List of matching labor categories with similarity scores
        """
        results = pinecone_search(
            query=query,
            filter={
                "organization_id": organization_id,
                "file_id": file_id
            }
        )
        return results

    return search_gsa_labor_categories


def create_get_gsa_rate(organization_id: str, file_id: str):
    """Factory function that returns rate lookup tool with org/file pre-configured"""

    def get_gsa_rate(lcat_id: str, year: int) -> dict:
        """Get GSA rate for a labor category and contract year.

        Args:
            lcat_id: Labor category ID
            year: Contract year (1, 2, 3, etc.)

        Returns:
            Rate information including hourly rate
        """
        rate = lookup_rate_from_db(organization_id, file_id, lcat_id, year)
        return rate

    return get_gsa_rate
```

### Agent Usage

```python
# When setting up agent for GSA proposal
org_id = current_user["organization_id"]
file_id = wage_source["file_id"]

# Create tools with org/file baked in
search_tool = create_search_gsa_labor_categories(org_id, file_id)
rate_tool = create_get_gsa_rate(org_id, file_id)

# Add tools to agent
agent.add_tool(search_tool)
agent.add_tool(rate_tool)

# Agent calls tools without needing org/file - already configured
```

---

## Document Parsing

### Excel Files

1. Convert Excel to CSV
2. Pass CSV to LlamaParse
3. LLM extracts structured data

### PDF Files

1. Pass PDF to LlamaParse directly
2. LLM extracts structured data

### LLM Extraction Schema

```python
class GSAContractExtraction(BaseModel):
    contract_number: Optional[str]
    contract_start_date: Optional[str]
    contract_end_date: Optional[str]

    labor_categories: List[LaborCategoryExtraction]

class LaborCategoryExtraction(BaseModel):
    title: str
    description: Optional[str]
    education: Optional[str]
    experience: Optional[str]
    year_1_rate: Optional[float]
    year_2_rate: Optional[float]
    year_3_rate: Optional[float]
    year_4_rate: Optional[float]
    year_5_rate: Optional[float]
    year_6_rate: Optional[float]
    year_7_rate: Optional[float]
    year_8_rate: Optional[float]
    year_9_rate: Optional[float]
    year_10_rate: Optional[float]
```

---

## Calculation Logic

### BLS Mode (Current)

```
Hourly Rate = Annual Wage ÷ Hours
+ Fringe (rate × fringe_rate)
+ OH (rate × oh_rate)
+ G&A (rate × ga_rate)
+ Fee (rate × fee_rate)
= FBLR (Fully Burdened Labor Rate)
```

### GSA Mode (New)

```
Hourly Rate = GSA rate from contract for current year
Final Rate = Hourly Rate × (1 - discount)

No fringe, no OH, no G&A, no fee.
GSA rate is already the final billable rate.
```

### Subcontractors

Same as current for both modes:
```
Final Rate = Subcontractor Rate + S&MH
```

### Discount Per Position

```python
# User sets discount per position
position = {
    "labor_category": "Program Manager",
    "gsa_rate": 131.68,
    "discount": 0.10,  # 10%
    "final_rate": 131.68 * (1 - 0.10)  # = 118.51
}
```

---

## Implementation Phases

### Phase 1: Database Setup

**What:** Create MongoDB collection and models.

**Files to create:**
- `backend/models/wage_repository.py` - Pydantic models
- `backend/utils/wage_repository.py` - CRUD functions

**Tasks:**
- [ ] Create `WageRepository` Pydantic model
- [ ] Create `LaborCategory` Pydantic model
- [ ] Create `WageRepositoryCRUD` class
- [ ] Create MongoDB indexes

---

### Phase 2: Upload Endpoint

**What:** API endpoint for admin to upload files.

**Files to create:**
- `backend/routers/wage_repository.py` - Router with upload endpoint

**Files to modify:**
- `backend/app/server.py` - Register new router

**Tasks:**
- [ ] Create POST `/upload` endpoint
- [ ] Save file to iDrive
- [ ] Create MongoDB record with status "processing"
- [ ] Start background job for parsing
- [ ] Register router in server.py

---

### Phase 3: Document Parsing

**What:** Extract labor categories and rates from uploaded files.

**Files to create:**
- `backend/client/gsa_parser.py` - Parsing logic

**Tasks:**
- [ ] Excel to CSV conversion
- [ ] LlamaParse integration for CSV
- [ ] LlamaParse integration for PDF
- [ ] LLM schema for extraction
- [ ] Handle missing contract dates (status: "needs_date")
- [ ] Update MongoDB record on completion

---

### Phase 4: Pinecone Setup

**What:** Store labor categories in Pinecone for vector search.

**Files to create:**
- `backend/client/gsa_pinecone.py` - Pinecone client

**Tasks:**
- [ ] Setup Pinecone index (or use existing with namespace)
- [ ] Function to embed and store labor categories
- [ ] Function to search with org_id + file_id filter
- [ ] Function to delete vectors when file is deleted

---

### Phase 5: API Endpoints

**What:** Remaining endpoints for managing files.

**Files to modify:**
- `backend/routers/wage_repository.py` - Add more endpoints

**Tasks:**
- [ ] GET `/` - List all files for org
- [ ] GET `/{file_id}` - Get file details
- [ ] GET `/{file_id}/status` - Check processing status
- [ ] PATCH `/{file_id}` - Update contract dates
- [ ] DELETE `/{file_id}` - Delete file (admin only)

---

### Phase 6: Agent Tools

**What:** Create tools for agent to search and get rates.

**Files to create:**
- `backend/agent/tools/gsa_tools.py` - Agent tools

**Tasks:**
- [ ] `create_search_gsa_labor_categories` factory function
- [ ] `create_get_gsa_rate` factory function
- [ ] Year calculation helper function

---

### Phase 7: Proposal Flow Changes

**What:** Add wage source selection to proposal creation.

**Files to modify:**
- `backend/routers/proposals.py` - Add wage_source parameter
- `backend/utils/pipeline.py` - Add GSA processing path
- `backend/agent/pricing_agent.py` - Add GSA tools when source is GSA

**Tasks:**
- [ ] Add `wage_source` to upload endpoint
- [ ] Route to GSA flow when type is "gsa"
- [ ] Calculate current GSA year from contract date
- [ ] Error if proposal needs more years than contract has
- [ ] Add GSA tools to agent when GSA source selected

---

### Phase 8: Calculation Changes

**What:** GSA mode calculations (no indirect rates).

**Files to modify:**
- `backend/client/calculation_service.py` - Add GSA mode

**Tasks:**
- [ ] Add GSA calculation method (rate only, no indirect)
- [ ] Detect wage source type and use appropriate calculation
- [ ] Keep subcontractor calculation same (rate + S&MH)

---

### Phase 9: Discount Support

**What:** Apply discounts per position.

**Files to modify:**
- `backend/models/` - Add discount field to position
- `backend/client/calculation_service.py` - Apply discount

**Tasks:**
- [ ] Add `discount` field to position model
- [ ] Apply discount in GSA calculation
- [ ] Store discount in proposal

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `backend/models/wage_repository.py` | Pydantic models |
| `backend/utils/wage_repository.py` | CRUD functions |
| `backend/routers/wage_repository.py` | API endpoints |
| `backend/client/gsa_parser.py` | Parse PDF/Excel |
| `backend/client/gsa_pinecone.py` | Vector search |
| `backend/agent/tools/gsa_tools.py` | Agent tools |

### Modified Files

| File | Changes |
|------|---------|
| `backend/app/server.py` | Register wage_repository router |
| `backend/routers/proposals.py` | Add wage_source parameter |
| `backend/utils/pipeline.py` | Add GSA processing path |
| `backend/agent/pricing_agent.py` | Add GSA tools |
| `backend/client/calculation_service.py` | Add GSA mode, discounts |

---

## Testing Checklist

- [ ] Admin can upload PDF GSA contract
- [ ] Admin can upload Excel GSA contract
- [ ] System extracts labor categories and rates correctly
- [ ] System prompts for contract date if not found
- [ ] User can list all GSA files in org
- [ ] User can select GSA source when creating proposal
- [ ] Agent matches positions to GSA labor categories
- [ ] Correct GSA year is calculated
- [ ] Error shown if proposal exceeds contract years
- [ ] Discounts applied correctly
- [ ] No indirect rates applied to GSA positions
- [ ] Subcontractors still use rate + S&MH
- [ ] Admin can delete GSA files
