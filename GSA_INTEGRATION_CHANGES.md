# GSA Integration - API Changes & Frontend Requirements

## Overview

This document describes the backend API changes for GSA contract rate support and what the frontend needs to implement.

---

## API Changes

### 1. New Endpoint: Company Repository

**Base URL:** `/api/company-repository`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/upload` | Admin | Upload GSA contract file |
| `GET` | `/` | User | List all GSA contracts for org |
| `GET` | `/{file_id}` | User | Get GSA contract details |
| `GET` | `/{file_id}/status` | User | Check processing status |
| `PATCH` | `/{file_id}` | Admin | Update contract dates/name |
| `DELETE` | `/{file_id}` | Admin | Delete GSA contract |

#### POST /upload

Upload a GSA contract file (PDF, Excel, RTF, etc.)

**Request (multipart/form-data):**
```
file: <file>
name: "GSA MAS Contract 2020-2030"
```

**Response:**
```json
{
  "file_id": "abc123",
  "status": "processing",
  "message": "File uploaded, processing started"
}
```

#### GET /

List all GSA contracts for the organization.

**Response:**
```json
[
  {
    "id": "abc123",
    "file_id": "abc123",
    "name": "GSA MAS Contract 2020-2030",
    "contract_number": "GS-35F-1234",
    "contract_start_date": "2020-01-15",
    "contract_end_date": "2030-01-14",
    "labor_category_count": 136,
    "status": "active",
    "created_at": "2024-12-24T10:00:00Z"
  }
]
```

#### GET /{file_id}

Get full details including all labor categories.

**Response:**
```json
{
  "id": "abc123",
  "file_id": "abc123",
  "name": "GSA MAS Contract 2020-2030",
  "contract_number": "GS-35F-1234",
  "contract_start_date": "2020-01-15",
  "labor_categories": [
    {
      "lcat_id": "LC001",
      "title": "Program Manager",
      "sin": "54151S",
      "education": "Bachelor's Degree",
      "experience": "10+ years",
      "rates_by_year": {
        "1": 185.50,
        "2": 190.25,
        "3": 195.00,
        "4": 200.00,
        "5": 205.50
      }
    }
  ],
  "status": "active"
}
```

#### GET /{file_id}/status

Poll for processing status after upload.

**Response:**
```json
{
  "file_id": "abc123",
  "status": "processing",  // or "active", "needs_date", "error"
  "error_message": null,
  "labor_category_count": 136
}
```

**Status Values:**
- `processing` - Still parsing the document
- `active` - Ready to use
- `needs_date` - Contract start date couldn't be extracted (admin must set manually)
- `error` - Parsing failed

#### PATCH /{file_id}

Update contract details (admin only). Used when `status` is `needs_date`.

**Request:**
```json
{
  "contract_start_date": "2020-01-15",
  "contract_end_date": "2030-01-14"
}
```

---

### 2. Modified Endpoint: Proposal Upload

**Endpoint:** `POST /api/proposals/upload`

**New Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `wage_source_type` | string | `"bls"` | `"bls"` or `"gsa"` |
| `wage_source_file_id` | string | null | GSA contract file_id (required if type is "gsa") |

**Request (multipart/form-data):**
```
files: <file[]>
name: "CISA Proposal"
solicitation_number: "N00000-24-R-0001"
wage_source_type: "gsa"
wage_source_file_id: "abc123"
```

**Response:** Same as before, but positions will have GSA data instead of BLS data.

---

### 3. Position Data Changes

When `wage_source_type` is `"gsa"`, positions will have different fields:

**BLS Position (existing):**
```json
{
  "labor_category": "Software Developer",
  "wage_source": "bls",
  "BLS Code": "15-1252",
  "BLS Labour Category Mapping": "Software Developers",
  "selected_wage": 169000,
  "wage_10th": 95000,
  "wage_25th": 135000,
  "wage_50th": 169000,
  "wage_75th": 210000,
  "wage_90th": 265000,
  "selected_percentile": "50th"
}
```

**GSA Position (new):**
```json
{
  "labor_category": "Software Developer",
  "wage_source": "gsa",
  "gsa_lcat_id": "LC042",
  "gsa_title": "Software Developer III",
  "gsa_sin": "54151S",
  "gsa_rate": 145.50,
  "gsa_contract_year": 5,
  "selected_wage": 145.50,
  "BLS Code": null,
  "BLS Labour Category Mapping": null,
  "wage_10th": null,
  "wage_25th": null,
  "wage_50th": null,
  "wage_75th": null,
  "wage_90th": null,
  "selected_percentile": null
}
```

---

## Frontend Requirements

### 1. Company Repository Page (Admin Only)

Create a new page for admins to manage GSA contracts.

**Features needed:**
- File upload form (accepts PDF, Excel, RTF)
- List of uploaded contracts with status
- Status polling while processing
- Form to set contract dates if `status` is `needs_date`
- Delete confirmation dialog

**UI Components:**
```
┌─────────────────────────────────────────────────────────┐
│ Company Repository                                       │
├─────────────────────────────────────────────────────────┤
│ [+ Upload GSA Contract]                                  │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ GSA MAS 2020-2030          136 categories   Active  │ │
│ │ GS-35F-1234                Started: Jan 2020        │ │
│ │                                          [Delete]   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ OASIS+ Contract            Processing...            │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 2. Proposal Upload - Wage Source Selector

Add wage source selection to the upload form.

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│ Create New Proposal                                      │
├─────────────────────────────────────────────────────────┤
│ Proposal Name: [________________________]                │
│                                                          │
│ Solicitation #: [________________________]               │
│                                                          │
│ Wage Source:                                             │
│   ○ BLS Government Data (default)                       │
│   ○ GSA MAS 2020-2030                                   │
│   ○ OASIS+ Contract 2023                                │
│                                                          │
│ Upload Documents: [Choose Files]                         │
│                                                          │
│                              [Cancel]  [Create Proposal] │
└─────────────────────────────────────────────────────────┘
```

**Logic:**
- Fetch available GSA contracts from `GET /api/company-repository`
- Show only contracts with `status: "active"`
- Pass selected `wage_source_type` and `wage_source_file_id` to upload

### 3. Pricing Workspace - GSA Mode

Detect `wage_source` field in positions and adjust display.

**For GSA positions:**
- Hide FBLR breakdown (no fringe, OH, G&A, fee)
- Show GSA rate directly as the hourly rate
- Add discount input field
- Show GSA labor category title instead of BLS mapping

**Calculation difference:**
```javascript
// BLS Mode
const hourlyRate = annualWage / hours;
const fblr = hourlyRate * (1 + fringe) * (1 + oh) * (1 + ga) * (1 + fee);

// GSA Mode - NO indirect rates!
const hourlyRate = position.gsa_rate;
const finalRate = hourlyRate * (1 - discount);
```

### 4. Discount Support (GSA Only)

Add per-position discount for GSA positions.

**UI:**
```
┌──────────────────────────────────────────────────────────────┐
│ Position: Program Manager                                     │
├──────────────────────────────────────────────────────────────┤
│ GSA Rate: $185.50/hr                                          │
│ Discount: [10] %                                              │
│ Final Rate: $166.95/hr                                        │
└──────────────────────────────────────────────────────────────┘
```

**Storage:**
Add `discount` field to position in `spreadsheet_data.positions`:
```json
{
  "labor_category": "Program Manager",
  "wage_source": "gsa",
  "gsa_rate": 185.50,
  "discount": 0.10,
  "final_rate": 166.95
}
```

### 5. Position Display Columns

Update the pricing grid columns based on wage source.

**BLS Mode Columns:**
- Labor Category
- BLS Code
- BLS Mapping
- Percentile
- Annual Wage
- DL Rate
- Fringe
- OH
- G&A
- Fee
- FBLR
- Hours
- Amount

**GSA Mode Columns:**
- Labor Category
- GSA Category
- GSA Rate
- Discount %
- Final Rate
- Hours
- Amount

---

## Calculation Reference

### BLS Mode (existing)
```
DL Rate = Annual Wage / Hours
Fringe = DL × fringe_rate
OH = (DL + Fringe) × oh_rate
G&A = (DL + Fringe + OH) × ga_rate
Fee = (DL + Fringe + OH + G&A) × fee_rate
FBLR = DL + Fringe + OH + G&A + Fee
Amount = FBLR × Hours
```

### GSA Mode (new)
```
Final Rate = GSA Rate × (1 - Discount)
Amount = Final Rate × Hours

// No fringe, OH, G&A, fee!
```

### Subcontractors (same for both)
```
Final Rate = Sub Rate + S&MH
Amount = Final Rate × Hours
```

---

## Testing Checklist

### Backend
- [ ] Admin can upload PDF GSA contract
- [ ] Admin can upload Excel GSA contract
- [ ] Admin can upload RTF GSA contract
- [ ] System extracts labor categories and rates correctly
- [ ] System prompts for contract date if not found (status: needs_date)
- [ ] User can list all GSA files in org
- [ ] Proposal upload accepts wage_source parameters
- [ ] Agent matches positions to GSA labor categories via Pinecone
- [ ] Correct GSA year is calculated from contract start date
- [ ] Admin can delete GSA files (removes from MongoDB + Pinecone)

### Frontend
- [ ] Company Repository page displays for admins
- [ ] File upload works with status polling
- [ ] Contract date form shown when status is needs_date
- [ ] Wage source selector appears on proposal upload
- [ ] Only active GSA contracts shown in selector
- [ ] GSA positions display without FBLR breakdown
- [ ] Discount input works for GSA positions
- [ ] Calculations correct (no indirect rates for GSA)
