# MongoDB Schema Design Documentation

**Last Updated:** 2025-11-21
**Status:** Design Phase - Pending UI Mockup Review

---

## Table of Contents

1. [Current State](#current-state)
2. [Proposed Schema Design](#proposed-schema-design)
3. [Data Storage Decisions](#data-storage-decisions)
4. [Query Patterns](#query-patterns)
5. [Pending Decisions](#pending-decisions)
6. [Future Enhancements](#future-enhancements)

---

## Current State

### Existing MongoDB Collections

Currently, the system has these collections:

```
pricing_db/
├── users               # User authentication (Google OAuth)
├── wage_data           # BLS OEWS wage lookup data
├── areas               # Geographic areas (National, State, Metro)
├── occupations         # SOC codes and descriptions
└── blacklist           # Auth token blacklist
```

### Current Data Flow

```
Document Upload → Parse → Enrich with OEWS Wages → Return JSON
                                                   ↓
                                        (NOT saved to MongoDB)
```

**Key Finding:** Currently NO pricing/project data is saved to MongoDB. Everything is calculated on-demand and returned to frontend.

---

## Proposed Schema Design

### Industry Standard Approach (Recommended)

Based on research of production SaaS applications, the recommended approach is:

**2-3 Collections with Embedded Data**

```
pricing_db/
├── users               # Existing - no changes
├── projects            # NEW - Main collection with embedded data
└── excel_exports       # OPTIONAL - Audit trail (add if needed)
```

---

## Collection 1: `projects` (Main Collection)

### Schema Structure

```javascript
{
  // === Ownership & Identity ===
  "_id": ObjectId("507f1f77bcf86cd799439011"),
  "user_id": ObjectId("507f191e810c19729de860ea"),  // Multi-tenancy key
  "created_at": ISODate("2025-11-21T10:30:00Z"),
  "updated_at": ISODate("2025-11-21T15:45:00Z"),

  // === Project Info ===
  "project_name": "Intprepix Volume III",
  "status": "draft",  // draft, finalized, archived

  // === Document Source ===
  "document_name": "Intprepix_Volume_III.pdf",
  "document_s3_url": "s3://pricing-bucket/users/507f.../intprepix.pdf",  // Future
  "parsed_at": ISODate("2025-11-21T10:31:00Z"),  // null if not parsed yet

  // === Contract Metadata (from document parsing) ===
  "location": "Virginia",
  "base_years": 1,
  "option_years": 4,
  "total_years": 5,

  // === EMBEDDED: Labor Positions Array ===
  "positions": [
    {
      "labor_category": "Program Manager, Senior",
      "description": "Leads strategic planning and execution...",
      "experience": 10,
      "location": "Virginia",

      // Multi-year hours
      "hours": 1880,  // Legacy field (single year)
      "hours_per_year": {
        "1": 1880,
        "2": 1880,
        "3": 0,      // Not working Year 3
        "4": 1880,
        "5": 1880
      },

      // Position classification
      "position_type": "prime",  // "prime" or "subcontractor"

      // Wage data (from OEWS MongoDB lookup)
      "soc_code": "11-3021",
      "occupation_name": "Computer and Information Systems Managers",
      "bls_description": "Plan, direct, or coordinate activities...",
      "wages": {
        "10th": 95000,
        "25th": 135000,
        "50th": 169000,  // median
        "75th": 210000,
        "90th": 265000
      },
      "selected_wage": 169000,      // User picks which wage
      "selected_percentile": "50th"  // Which percentile selected
    }
    // ... more positions
  ],

  // === EMBEDDED: All Rates (user inputs from frontend) ===
  "rates": {
    // Indirect/Wrap Rates
    "fringe": 0.247,      // 24.7% - Fringe benefits
    "overhead": 0.0711,   // 7.11% - Overhead
    "ga": 0.2243,         // 22.43% - General & Administrative

    // ODC Rate
    "odc_ga_adder": 0.2212,  // 22.12% - G&A adder for ODCs

    // Fee Rates (profit)
    "prime_fee": 0.08,    // 8% - Fee on prime labor
    "sub_fee": 0.0126,    // 1.26% - Fee on subcontractor labor

    // Subcontractor Markup
    "sub_markup_fee": 0.10,   // 10% - Fee markup
    "sub_markup_smh": 0.0665, // 6.65% - S&MH (Subcontractor & Material Handling)

    // Escalation Rates (year-over-year)
    "escalation": {
      "1_to_2": 0.0272,  // 2.72% - Year 1 to Year 2
      "2_to_3": 0.0299,  // 2.99% - Year 2 to Year 3
      "3_to_4": 0.0263,  // 2.63% - Year 3 to Year 4
      "4_to_5": 0.0340   // 3.40% - Year 4 to Year 5
      // Supports up to Year 10 if needed
    }
  },

  // === EMBEDDED: ODCs (Other Direct Costs) Array ===
  "odcs": [
    {
      "description": "Travel",
      "category": "travel",  // travel, materials, equipment, other
      "amount_year_1": 54844.05,
      "escalate": true  // Whether to apply escalation rates
    },
    {
      "description": "Materials",
      "category": "materials",
      "amount_year_1": 12000.00,
      "escalate": true
    }
  ],

  // === EMBEDDED: Calculated Results (cached) ===
  "calculations": {
    "calculated_at": ISODate("2025-11-21T10:33:00Z"),
    "version": 1,  // Increment when recalculated

    // Grand totals
    "grand_total": 108690122.34,
    "total_labor_all_years": 102345678.90,
    "total_odcs_all_years": 356789.12,
    "total_fees_all_years": 5987654.32,

    // Year-by-year breakdown
    "yearly_totals": [
      {
        "year": 1,
        "prime_labor": 13031095.70,
        "sub_labor": 6378650.33,
        "total_labor": 19409746.03,
        "odcs": 66975.55,
        "prime_fee": 1042487.66,
        "sub_fee": 80370.99,
        "total": 20599580.23
      },
      {
        "year": 2,
        "prime_labor": 13385467.89,
        "sub_labor": 6552036.11,
        "total_labor": 19937503.99,
        "odcs": 68800.89,
        "prime_fee": 1070837.43,
        "sub_fee": 82555.66,
        "total": 21159698.97
      }
      // ... years 3-5
    ]
  }
}
```

### MongoDB Indexes

```javascript
// List all projects for a user (sorted by most recent)
db.projects.createIndex({ "user_id": 1, "created_at": -1 })

// Filter projects by status
db.projects.createIndex({ "user_id": 1, "status": 1 })

// Check if document already parsed (prevent duplicates)
db.projects.createIndex(
  { "document_s3_url": 1 },
  { unique: true, sparse: true }
)
```

---

## Collection 2: `excel_exports` (Optional - Audit Trail)

**Only create this if you need export history tracking.**

```javascript
{
  "_id": ObjectId("507f1f77bcf86cd799439016"),
  "user_id": ObjectId("507f191e810c19729de860ea"),
  "project_id": ObjectId("507f1f77bcf86cd799439011"),
  "exported_at": ISODate("2025-11-21T10:35:00Z"),
  "file_name": "Intprepix_Volume_III_Pricing_2025-11-21.xlsx",
  "calculation_version": 1  // Links to project.calculations.version
}
```

### Index

```javascript
db.excel_exports.createIndex({ "user_id": 1, "exported_at": -1 })
```

---

## Data Storage Decisions

### What Gets Stored & Source

| Data | Source | Stored In |
|------|--------|-----------|
| **From Document Parsing** | | |
| - project_name, location | Backend parser | `projects.project_name`, `projects.location` |
| - base_years, option_years | Backend parser | `projects.base_years`, `projects.option_years` |
| - labor_category, description | Backend parser | `projects.positions[]` |
| - hours_per_year | Backend parser | `projects.positions[].hours_per_year` |
| **From OEWS Wage Lookup** | | |
| - soc_code, occupation_name | Backend (MongoDB query) | `projects.positions[].soc_code` |
| - wage percentiles | Backend (MongoDB query) | `projects.positions[].wages` |
| **From Frontend User Input** | | |
| - Indirect rates (fringe, OH, G&A) | User input | `projects.rates.fringe/overhead/ga` |
| - Escalation rates | User input | `projects.rates.escalation` |
| - Fee rates (prime, sub) | User input | `projects.rates.prime_fee/sub_fee` |
| - ODCs | User input | `projects.odcs[]` |
| - Subcontractor markup | User input | `projects.rates.sub_markup_*` |
| - Selected wage percentile | User selection | `projects.positions[].selected_wage` |
| **Generated by Backend** | | |
| - Calculated totals | Calculator class | `projects.calculations` |
| - Year-by-year breakdowns | Calculator class | `projects.calculations.yearly_totals` |
| **NOT Stored** | | |
| - Excel file itself | Generated on-demand | (not stored, returned as download) |

---

## Query Patterns

### Common Operations

#### 1. List All Projects for User

```python
# Get all projects, most recent first
projects = db.projects.find(
    {"user_id": user_id}
).sort("created_at", -1)
```

#### 2. Get Single Project (All Data)

```python
# One query returns everything: positions, rates, ODCs, calculations
project = db.projects.find_one({
    "_id": project_id,
    "user_id": user_id  # Security: only user's own projects
})

# Access embedded data:
positions = project["positions"]
rates = project["rates"]
odcs = project["odcs"]
calculations = project["calculations"]
```

#### 3. Create New Project

```python
new_project = {
    "user_id": user_id,
    "created_at": datetime.utcnow(),
    "updated_at": datetime.utcnow(),
    "project_name": "New Project",
    "status": "draft",
    "document_name": "file.pdf",
    "parsed_at": None,  # Not parsed yet
    "positions": [],
    "rates": {},
    "odcs": [],
    "calculations": None
}

result = db.projects.insert_one(new_project)
project_id = result.inserted_id
```

#### 4. Update Rates

```python
db.projects.update_one(
    {"_id": project_id, "user_id": user_id},
    {
        "$set": {
            "rates": new_rates,
            "updated_at": datetime.utcnow()
        }
    }
)
```

#### 5. Add Position

```python
db.projects.update_one(
    {"_id": project_id, "user_id": user_id},
    {
        "$push": {"positions": new_position},
        "$set": {"updated_at": datetime.utcnow()}
    }
)
```

#### 6. Update Calculations (After Recalculation)

```python
db.projects.update_one(
    {"_id": project_id, "user_id": user_id},
    {
        "$set": {
            "calculations": {
                "calculated_at": datetime.utcnow(),
                "version": existing_version + 1,
                "grand_total": total,
                "yearly_totals": yearly_data
            },
            "updated_at": datetime.utcnow()
        }
    }
)
```

#### 7. Check if Document Already Parsed

```python
# Prevent re-parsing same document
existing = db.projects.find_one({
    "document_s3_url": s3_url,
    "parsed_at": {"$ne": None}
})

if existing:
    return existing  # Use cached data
else:
    # Parse document and save results
    pass
```

---

## Pending Decisions

**⚠️ To Be Finalized After UI Mockup Review**

### 1. Project Status Field

**Options:**
- Simple: `"draft"`, `"finalized"`
- Extended: `"draft"`, `"in_review"`, `"finalized"`, `"archived"`

**Question:** Does UI have multiple status states?

---

### 2. Position Ordering

**Current:** No explicit order field in positions array

**Question:** Does UI allow user to reorder positions? If yes, add `"order": 1` field.

---

### 3. ODC Escalation

**Current:** ODCs have `"escalate": true/false` flag

**Question:** Should ALL ODCs escalate year-over-year, or user-configurable per ODC?

---

### 4. Wage Percentile Selection

**Current:** User must select which wage percentile (10th, 25th, 50th, 75th, 90th) for each position

**Question:** How does UI present this? Dropdown? Auto-select 50th as default?

---

### 5. Subcontractor vs Prime Positions

**Current:** Position has `"position_type": "prime"` or `"subcontractor"`

**Questions:**
- How does user mark a position as subcontractor in UI?
- Do subcontractors have different form fields?
- Should we store subcontractor company name?

---

### 6. Excel Export History

**Current:** Optional `excel_exports` collection for audit trail

**Question:** Do we need to track who exported what and when? Or just generate on-demand?

---

### 7. Multi-Year Flexibility

**Current:** Supports 1 base year + up to 4 option years (total 5)

**Question:** Should system support up to 10 years? Government contracts sometimes extend.

---

### 8. Rate Templates/Presets

**Question:** Should we support saving rate templates (fringe, OH, G&A, etc.) for reuse across projects?

**If YES:** Add new collection `rate_templates`:
```javascript
{
  "_id": ObjectId("..."),
  "user_id": ObjectId("..."),
  "template_name": "Standard SeaPort-e Rates",
  "rates": { /* same structure as projects.rates */ }
}
```

---

### 9. Calculation Caching Strategy

**Current:** Store calculations in `projects.calculations`

**Questions:**
- Recalculate on every frontend request, or only when rates/positions change?
- Add `"needs_recalculation": true` flag when positions/rates updated?

---

### 10. Document Storage (S3)

**Future Feature:**

**Flow:**
1. User uploads file → Frontend uploads to S3 → Gets URL
2. Frontend calls `POST /api/projects/create` with `document_s3_url`
3. Backend checks if URL already exists in MongoDB
4. If exists and `parsed_at` is not null → Return cached data
5. If new → Download from S3 → Parse → Store results

**Questions:**
- S3 bucket name?
- File retention policy (delete after X days)?
- Access control (pre-signed URLs)?

---

## Future Enhancements

### Phase 2 Features

1. **Project Templates**
   - Save complete project as template
   - Clone projects with all positions/rates

2. **Collaboration**
   - Share projects with other users
   - Add `"shared_with": [user_ids]` array
   - Update indexes to query shared projects

3. **Version History**
   - Track changes to positions/rates over time
   - Implement change log

4. **Bulk Import**
   - Import positions from CSV/Excel
   - Map columns to position fields

5. **Advanced Filtering**
   - Filter projects by location, date range, total value
   - Add compound indexes for common filters

6. **Export Formats**
   - PDF export (in addition to Excel)
   - Word document export

---

## Pydantic Models Structure

### Recommended File Organization

```
models/
├── __init__.py
├── job_description.py      # Existing - already has JobDescription
├── project.py              # NEW - Project, ProjectCreate, ProjectUpdate
├── position.py             # NEW - Position model
├── rates.py                # NEW - Rates model
├── odc.py                  # NEW - ODC model
└── calculation.py          # NEW - Calculation models
```

### Example: Project Model

```python
# models/project.py
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime
from bson import ObjectId

class Position(BaseModel):
    labor_category: str
    description: Optional[str] = None
    experience: Optional[int] = None
    location: Optional[str] = None
    hours: Optional[int] = None
    hours_per_year: Optional[Dict[str, int]] = None
    position_type: str = "prime"  # "prime" or "subcontractor"

    # Wage data
    soc_code: Optional[str] = None
    occupation_name: Optional[str] = None
    wages: Optional[Dict[str, float]] = None
    selected_wage: Optional[float] = None
    selected_percentile: Optional[str] = None

class Rates(BaseModel):
    fringe: float = 0.0
    overhead: float = 0.0
    ga: float = 0.0
    odc_ga_adder: float = 0.0
    prime_fee: float = 0.0
    sub_fee: float = 0.0
    sub_markup_fee: float = 0.0
    sub_markup_smh: float = 0.0
    escalation: Dict[str, float] = Field(default_factory=dict)

class ODC(BaseModel):
    description: str
    category: str = "other"
    amount_year_1: float
    escalate: bool = True

class YearlyTotal(BaseModel):
    year: int
    prime_labor: float
    sub_labor: float
    total_labor: float
    odcs: float
    prime_fee: float
    sub_fee: float
    total: float

class Calculations(BaseModel):
    calculated_at: datetime
    version: int = 1
    grand_total: float
    total_labor_all_years: float
    total_odcs_all_years: float
    total_fees_all_years: float
    yearly_totals: List[YearlyTotal]

class Project(BaseModel):
    id: Optional[ObjectId] = Field(alias="_id", default=None)
    user_id: ObjectId
    created_at: datetime
    updated_at: datetime

    project_name: str
    status: str = "draft"

    document_name: Optional[str] = None
    document_s3_url: Optional[str] = None
    parsed_at: Optional[datetime] = None

    location: Optional[str] = None
    base_years: Optional[int] = None
    option_years: Optional[int] = None
    total_years: Optional[int] = None

    positions: List[Position] = Field(default_factory=list)
    rates: Rates = Field(default_factory=Rates)
    odcs: List[ODC] = Field(default_factory=list)
    calculations: Optional[Calculations] = None

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
```

---

## Implementation Checklist

**Before Implementation:**
- [ ] Review UI mockup from boss
- [ ] Finalize pending decisions (see section above)
- [ ] Confirm data fields needed in frontend
- [ ] Decide on excel_exports collection (yes/no)
- [ ] Confirm multi-year support (5 years vs 10 years)

**Implementation Tasks:**
- [ ] Create Pydantic models (project.py, position.py, rates.py, odc.py, calculation.py)
- [ ] Create MongoDB service (services/project_service.py)
- [ ] Create API endpoints (routers/projects.py)
- [ ] Add MongoDB indexes
- [ ] Update existing /process endpoint to save to MongoDB
- [ ] Create Excel generator service
- [ ] Test end-to-end flow

---

## Notes

- **Multi-Tenancy:** Every query MUST filter by `user_id` for security
- **Atomic Updates:** MongoDB atomic operations prevent race conditions
- **Embedding vs References:** Embedded approach chosen for simplicity and performance
- **Indexes:** Critical for performance at scale (especially `{user_id, created_at}`)
- **S3 Integration:** Future enhancement for document storage and parsing cache

---

**Document Status:** Living document - update as requirements evolve after UI mockup review.
