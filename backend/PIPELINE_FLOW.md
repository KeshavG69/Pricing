# Multi-Year Government Pricing Pipeline - Complete Flow

## Overview

This document explains how the multi-year pricing system works from start to finish. Think of it as a factory assembly line with different stations, each doing a specific job.

---

## 🏭 The Complete Pipeline (9 Stations)

```
📄 Documents → 🔍 Parse → 💾 Create Project → 👥 Store Positions → 🏢 Add Subs → 📦 Add ODCs → 🧮 Calculate → 📊 Generate Excel
```

---

## Station 1: Document Upload & Parsing (ALREADY WORKING ✅)

**What happens**: User uploads job description documents (PDFs, Word docs, etc.)

**Current Code**: `utils/pipeline.py` + `client/jd_parser.py`

**Process**:
1. Documents are uploaded via API
2. LLM extracts information from each document:
   - Labor Category (e.g., "Senior Software Engineer")
   - Description of duties
   - Experience required (e.g., 5 years)
   - Location (e.g., "Arlington, VA")
   - Hours (e.g., 1880 hours/year)
3. Agent looks up BLS wage data for each position
4. System selects appropriate wage based on experience:
   - Less than 3 years → 25th percentile
   - 3-6 years → 50th percentile
   - More than 6 years → 75th percentile

**Example Output**:
```
Labor Category: Senior Software Engineer
Base Wage: $115,000/year
Hours: 1880
Location: Arlington, VA
Experience: 5 years
SOC Code: 15-1252
```

---

## Station 2: Create Pricing Project (NEW 🆕)

**What happens**: User sets up the project configuration

**Database**: `models/project.py` → `pricing_projects` table

**User provides**:
- Company name
- Solicitation number (government contract ID)
- Number of years:
  - Base period: 1 year (Year 1)
  - Option years: 4 years (Years 2-5)
  - Total: 5 years
- **Escalation rates** (different for each year transition):
  ```json
  {
    "1_to_2": 0.0272,  // Year 1 to Year 2: 2.72%
    "2_to_3": 0.0299,  // Year 2 to Year 3: 2.99%
    "3_to_4": 0.0263,  // Year 3 to Year 4: 2.63%
    "4_to_5": 0.0340   // Year 4 to Year 5: 3.40%
  }
  ```
- **Indirect rates** (same for all years):
  - Fringe: 25.1%
  - OH (Overhead): 8.1%
  - G&A: 19.5%
  - Fee: 9.1%
- **Subcontractor markup rates**:
  - Fee: 10%
  - S&MH (Subcontractor & Material Handling): 6.65%

**Why these decisions**:
- ✅ Store escalation per year (not global) → More flexible for real contracts
- ✅ Store indirect rates in project → Can change per project
- ✅ Store everything in database → Easy to modify later

**Database Record**:
```python
{
  "id": 1,
  "company_name": "Nexagen Solutions",
  "solicitation_number": "N00178-14-D-8116",
  "base_years": 1,
  "option_years": 4,
  "escalation_rates": {"1_to_2": 0.0272, "2_to_3": 0.0299, ...},
  "fringe_rate": 0.251,
  "oh_rate": 0.081,
  "ga_rate": 0.195,
  "fee_rate": 0.091,
  "sub_smh_rate": 0.0665,
  "sub_fee_rate": 0.10
}
```

---

## Station 3: Store Prime Contractor Positions (NEW 🆕)

**What happens**: Positions from document parsing are saved with year-by-year hours

**Database**: `models/position.py` → `positions` table

**Data stored**:
- Labor category
- SOC code (from BLS lookup)
- Base wage (Year 1 annual salary)
- **Hours per year** (JSON - flexible for any year structure):
  ```json
  {
    "1": 1880,  // Year 1: full time
    "2": 1880,  // Year 2: full time
    "3": 0,     // Year 3: not working
    "4": 1880,  // Year 4: back full time
    "5": 940    // Year 5: half time
  }
  ```

**Why JSON for hours**:
- ✅ Different positions can work different hours each year
- ✅ Some positions might not work in certain years (0 hours)
- ✅ Easy to add/remove years
- ✅ No need to know total years upfront

**Example Record**:
```python
{
  "id": 1,
  "project_id": 1,
  "labor_category": "Senior Software Engineer",
  "soc_code": "15-1252",
  "base_wage": 115000.00,  // Year 1 salary
  "hours_per_year": {"1": 1880, "2": 1880, "3": 1880, "4": 1880, "5": 1880}
}
```

---

## Station 4: Add Subcontractors (NEW 🆕)

**What happens**: User manually adds subcontractor companies and their positions

**Database**:
- `models/subcontractor.py` → `subcontractors` table
- `models/subcontractor.py` → `subcontractor_positions` table

**Important**: Subcontractors provide their own **Fully Burdened Labor Rate (FBLR)**. We don't calculate it from BLS - they tell us their rate!

**Their FBLR already includes**:
- Their direct labor
- Their fringe
- Their overhead
- Their G&A
- Their fee

**We only add our markup**:
- Prime contractor Fee (10%)
- Prime contractor S&MH (6.65%)

**Example Subcontractor**:
```python
# Subcontractor company
{
  "id": 1,
  "project_id": 1,
  "company_name": "TechPartner LLC",
  "smh_rate": 0.0665,  // Can override project default
  "fee_rate": 0.10      // Can override project default
}

# Their position
{
  "id": 1,
  "subcontractor_id": 1,
  "labor_category": "Database Administrator",
  "base_rate": 95.50,  // THEIR fully burdened rate ($/hour)
  "hours_per_year": {"1": 1880, "2": 1880, "3": 0, "4": 1880, "5": 1880}
}
```

---

## Station 5: Add ODCs (Other Direct Costs) (NEW 🆕)

**What happens**: User adds travel, materials, equipment, etc.

**Database**: `models/odc.py` → `odcs` table

**Data stored**:
- Category (Travel, Materials, Equipment, etc.)
- Description
- Base cost (Year 1)
- Should it escalate? (yes/no)
- Hours per year (for per-hour ODCs) or quantity

**Example**:
```python
{
  "id": 1,
  "project_id": 1,
  "category": "Travel",
  "description": "Client site visits",
  "base_cost": 5000.00,
  "escalate": true,  // Will apply escalation rates
  "costs_per_year": {"1": 5000, "2": 5000, "3": 5000, "4": 5000, "5": 5000}
}
```

---

## Station 6: Multi-Year Calculation Engine (NEW 🆕)

**What happens**: For each position, calculate costs for each year with escalation

**Code**: `services/calculation.py`

### 6A. Prime Contractor Position - Year by Year

Let's calculate **Senior Software Engineer** across 5 years:

**Given**:
- Base wage (Year 1): $115,000
- Hours per year: 1880 (all years)
- Escalation: 2.72%, 2.99%, 2.63%, 3.40%
- Indirect rates: Fringe 25.1%, OH 8.1%, G&A 19.5%, Fee 9.1%

**Year 1 Calculation**:
```
Escalation factor = 1.0 (no escalation in Year 1)
Escalated wage = $115,000 × 1.0 = $115,000

DL Rate = $115,000 / 1880 = $61.17/hr

Fringe = $61.17 × 0.251 = $15.35/hr
Subtotal after Fringe = $61.17 + $15.35 = $76.52/hr

OH = $76.52 × 0.081 = $6.20/hr
Subtotal after OH = $76.52 + $6.20 = $82.72/hr

G&A = $82.72 × 0.195 = $16.13/hr
Subtotal after G&A = $82.72 + $16.13 = $98.85/hr

Fee = $98.85 × 0.091 = $8.99/hr

FBLR = $98.85 + $8.99 = $107.84/hr
Total Year 1 Cost = $107.84 × 1880 = $202,739
```

**Year 2 Calculation**:
```
Escalation factor = 1.0 × 1.0272 = 1.0272 (2.72% increase)
Escalated wage = $115,000 × 1.0272 = $118,128

DL Rate = $118,128 / 1880 = $62.83/hr

Fringe = $62.83 × 0.251 = $15.77/hr
Subtotal = $62.83 + $15.77 = $78.60/hr

OH = $78.60 × 0.081 = $6.37/hr
Subtotal = $78.60 + $6.37 = $84.97/hr

G&A = $84.97 × 0.195 = $16.57/hr
Subtotal = $84.97 + $16.57 = $101.54/hr

Fee = $101.54 × 0.091 = $9.24/hr

FBLR = $101.54 + $9.24 = $110.78/hr
Total Year 2 Cost = $110.78 × 1880 = $208,266
```

**Year 3 Calculation**:
```
Escalation factor = 1.0272 × 1.0299 = 1.0579 (compound: 2.72% then 2.99%)
Escalated wage = $115,000 × 1.0579 = $121,659

DL Rate = $121,659 / 1880 = $64.71/hr

Fringe = $64.71 × 0.251 = $16.24/hr
Subtotal = $64.71 + $16.24 = $80.95/hr

OH = $80.95 × 0.081 = $6.56/hr
Subtotal = $80.95 + $6.56 = $87.51/hr

G&A = $87.51 × 0.195 = $17.06/hr
Subtotal = $87.51 + $17.06 = $104.57/hr

Fee = $104.57 × 0.091 = $9.52/hr

FBLR = $104.57 + $9.52 = $114.09/hr
Total Year 3 Cost = $114.09 × 1880 = $214,489
```

**Key Points**:
- ✅ Only the base wage escalates (gets multiplied by escalation factor)
- ✅ Indirect rate PERCENTAGES stay the same (25.1%, 8.1%, 19.5%, 9.1%)
- ✅ Each rate applies to the cumulative subtotal (wrap rates)
- ✅ Escalation compounds (Year 3 = Year 1 × 1.0272 × 1.0299)

### 6B. Subcontractor Position - With Markup

Let's calculate **Database Administrator** (subcontractor) for Year 1:

**Given**:
- Subcontractor's FBLR: $95.50/hr (Year 1)
- Hours: 1880
- Prime Fee: 10%
- Prime S&MH: 6.65%

**Year 1 Calculation**:
```
Subcontractor FBLR = $95.50/hr (they gave us this)

Prime Fee = $95.50 × 0.10 = $9.55/hr
Subtotal after Fee = $95.50 + $9.55 = $105.05/hr

Prime S&MH = $105.05 × 0.0665 = $6.99/hr

Final Rate = $105.05 + $6.99 = $112.04/hr
Total Year 1 Cost = $112.04 × 1880 = $210,635
```

**Year 2 Calculation** (with escalation):
```
Escalation factor = 1.0272
Escalated sub FBLR = $95.50 × 1.0272 = $98.10/hr

Prime Fee = $98.10 × 0.10 = $9.81/hr
Subtotal = $98.10 + $9.81 = $107.91/hr

Prime S&MH = $107.91 × 0.0665 = $7.18/hr

Final Rate = $107.91 + $7.18 = $115.09/hr
Total Year 2 Cost = $115.09 × 1880 = $216,369
```

**Key Points**:
- ✅ Subcontractor's rate ALSO escalates (we escalate their FBLR)
- ✅ We only apply our Fee + S&MH (not Fringe/OH/G&A)
- ✅ Fee applies first, then S&MH applies to (base + fee)

### 6C. ODCs - With Optional Escalation

**Travel costs** (escalates):
```
Year 1: $5,000
Year 2: $5,000 × 1.0272 = $5,136
Year 3: $5,000 × 1.0579 = $5,290
Year 4: $5,000 × 1.0857 = $5,429
Year 5: $5,000 × 1.1226 = $5,613
```

**Equipment purchase** (doesn't escalate - one-time cost):
```
Year 1: $10,000
Year 2: $0
Year 3: $0
Year 4: $0
Year 5: $0
```

---

## Station 7: Calculate Project Totals (NEW 🆕)

**What happens**: Sum up all positions + ODCs for each year

**Example Year 1 Total**:
```
Prime Positions:
  - Senior Software Engineer: $202,739
  - Systems Administrator: $156,480
  - Business Analyst: $178,920
  Prime Subtotal: $538,139

Subcontractor Positions:
  - Database Administrator (TechPartner): $210,635
  - Network Engineer (TechPartner): $198,400
  Sub Subtotal: $409,035

ODCs:
  - Travel: $5,000
  - Materials: $3,000
  ODC Subtotal: $8,000

YEAR 1 GRAND TOTAL: $955,174
```

**Do this for all 5 years** → Get 5 grand totals

---

## Station 8: Generate 2-Sheet Excel (NEW 🆕)

**Code**: `services/excel_generator.py`

### Sheet 1: "Multi-Year Pricing"

**Purpose**: Show year-by-year costs in a table

**Structure**:
```
                    Year 1      Year 2      Year 3      Year 4      Year 5
                    (Base)     (Opt 1)     (Opt 2)     (Opt 3)     (Opt 4)
Escalation Rate       -         2.72%       2.99%       2.63%       3.40%

PRIME CONTRACTOR
-----------------
Senior Software Eng  $202,739   $208,266   $214,489   $220,127   $227,613
Systems Admin        $156,480   $160,737   $165,543   $169,899   $175,677
Business Analyst     $178,920   $183,785   $189,280   $194,259   $200,866
                    ---------- ---------- ---------- ---------- ----------
Prime Subtotal       $538,139   $552,788   $569,312   $584,285   $604,156

SUBCONTRACTORS
--------------
DB Admin (TechPart)  $210,635   $216,369   $222,838   $228,698   $236,472
Network Eng (Tech)   $198,400   $203,797   $209,891   $215,413   $222,738
                    ---------- ---------- ---------- ---------- ----------
Sub Subtotal         $409,035   $420,166   $432,729   $444,111   $459,210

ODCs
----
Travel               $5,000     $5,136     $5,290     $5,429     $5,613
Materials            $3,000     $3,082     $3,174     $3,257     $3,368
                    ---------- ---------- ---------- ---------- ----------
ODC Subtotal         $8,000     $8,218     $8,464     $8,686     $8,981

==================== ========== ========== ========== ========== ==========
GRAND TOTAL          $955,174   $981,172   $1,010,505 $1,037,082 $1,072,347
==================== ========== ========== ========== ========== ==========
```

**Features**:
- ✅ Escalation rates shown in header
- ✅ Grouped by Prime/Sub/ODC
- ✅ Subtotals for each group
- ✅ Grand total at bottom
- ✅ Column for each year

### Sheet 2: "Rate Analysis"

**Purpose**: Show HOW rates are calculated (the math breakdown)

**Section A: Prime Contractor Rates**

Shows the "wrap rate" calculation for Year 1:

```
PRIME CONTRACTOR - YEAR 1 RATE BREAKDOWN
=========================================

Position: Senior Software Engineer
Base Wage: $115,000/year ÷ 1880 hours = $61.17/hr

Indirect Rate Application:
  Direct Labor                $61.17/hr
  + Fringe (25.1%)           $15.35/hr
  --------------------------------
  Subtotal                    $76.52/hr
  + OH (8.1%)                 $6.20/hr
  --------------------------------
  Subtotal                    $82.72/hr
  + G&A (19.5%)              $16.13/hr
  --------------------------------
  Subtotal                    $98.85/hr
  + Fee (9.1%)                $8.99/hr
  ================================
  Fully Burdened Rate        $107.84/hr

Total Cost: $107.84/hr × 1880 hours = $202,739
```

**Section B: Subcontractor Markup**

Shows how we mark up subcontractor rates:

```
SUBCONTRACTOR - YEAR 1 MARKUP BREAKDOWN
========================================

Company: TechPartner LLC
Position: Database Administrator
Subcontractor FBLR: $95.50/hr (provided by subcontractor)

Prime Markup:
  Subcontractor FBLR          $95.50/hr
  + Prime Fee (10%)           $9.55/hr
  --------------------------------
  Subtotal                    $105.05/hr
  + Prime S&MH (6.65%)        $6.99/hr
  ================================
  Final Billed Rate          $112.04/hr

Total Cost: $112.04/hr × 1880 hours = $210,635
```

**Section C: Escalation Summary**

Shows escalation rates and factors:

```
ESCALATION SCHEDULE
===================

Year 1 → Year 2:  2.72%  (Factor: 1.0272)
Year 2 → Year 3:  2.99%  (Factor: 1.0579 cumulative)
Year 3 → Year 4:  2.63%  (Factor: 1.0857 cumulative)
Year 4 → Year 5:  3.40%  (Factor: 1.1226 cumulative)

Example: Year 3 wage = Year 1 wage × 1.0579
```

**Section D: Indirect Rates Summary**

```
INDIRECT RATES (Applied to all prime positions)
================================================

Fringe:     25.1%  (Applied to Direct Labor)
Overhead:    8.1%  (Applied to DL + Fringe)
G&A:        19.5%  (Applied to DL + Fringe + OH)
Fee:         9.1%  (Applied to DL + Fringe + OH + G&A)

Note: These percentages remain constant across all years.
Only the base wage escalates.
```

---

## Station 9: API Endpoints (NEW 🆕)

**Code**: `routers/pricing_project.py` (new file)

**Endpoints needed**:

```
POST   /api/projects/                    Create new project
GET    /api/projects/{id}                Get project details
PUT    /api/projects/{id}                Update project
DELETE /api/projects/{id}                Delete project

POST   /api/projects/{id}/positions      Add prime position
PUT    /api/positions/{id}               Update position
DELETE /api/positions/{id}               Delete position

POST   /api/projects/{id}/subcontractors Add subcontractor
POST   /api/subcontractors/{id}/positions Add sub position
PUT    /api/subcontractor-positions/{id} Update sub position
DELETE /api/subcontractor-positions/{id} Delete sub position

POST   /api/projects/{id}/odcs           Add ODC
PUT    /api/odcs/{id}                    Update ODC
DELETE /api/odcs/{id}                    Delete ODC

GET    /api/projects/{id}/calculate      Calculate all costs
GET    /api/projects/{id}/excel          Download Excel
```

---

## 🔄 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER UPLOADS DOCUMENTS                                       │
│    ├─ Job descriptions (PDF, Word, etc.)                       │
│    └─ System parses → Extract positions, wages, hours          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. USER CREATES PROJECT                                         │
│    ├─ Company name                                              │
│    ├─ Years (base + options)                                    │
│    ├─ Escalation rates per year                                 │
│    ├─ Indirect rates (Fringe, OH, G&A, Fee)                    │
│    └─ Subcontractor markup rates (Fee, S&MH)                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. SYSTEM SAVES PRIME POSITIONS                                 │
│    ├─ From parsed documents                                     │
│    ├─ Labor category + SOC code                                 │
│    ├─ Base wage (Year 1)                                        │
│    └─ Hours per year (JSON)                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. USER ADDS SUBCONTRACTORS (Manual)                            │
│    ├─ Company name                                              │
│    ├─ Their positions                                           │
│    ├─ Their FBLR (they provide)                                 │
│    └─ Hours per year                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. USER ADDS ODCs (Manual)                                      │
│    ├─ Category (Travel, Materials, etc.)                        │
│    ├─ Base cost                                                 │
│    ├─ Should it escalate?                                       │
│    └─ Per-year costs                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. CALCULATION ENGINE RUNS                                      │
│    ├─ For each year (1 to 5):                                   │
│    │   ├─ Calculate escalation factor                           │
│    │   ├─ For each prime position:                              │
│    │   │   ├─ Escalate base wage                                │
│    │   │   ├─ Calculate DL rate                                 │
│    │   │   ├─ Apply indirect rates (wrap rates)                 │
│    │   │   └─ Calculate FBLR × hours                            │
│    │   ├─ For each subcontractor position:                      │
│    │   │   ├─ Escalate their FBLR                               │
│    │   │   ├─ Apply prime markup (Fee + S&MH)                   │
│    │   │   └─ Calculate final rate × hours                      │
│    │   └─ For each ODC:                                         │
│    │       ├─ Escalate if applicable                            │
│    │       └─ Get year cost                                     │
│    └─ Sum all costs per year → Grand totals                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. EXCEL GENERATOR CREATES 2-SHEET WORKBOOK                     │
│    ├─ Sheet 1: Multi-Year Pricing                               │
│    │   ├─ Year columns (Base + Options)                         │
│    │   ├─ Position rows with costs                              │
│    │   ├─ Grouped: Prime / Subs / ODCs                          │
│    │   └─ Grand totals                                          │
│    └─ Sheet 2: Rate Analysis                                    │
│        ├─ Prime contractor rate breakdown                       │
│        ├─ Subcontractor markup breakdown                        │
│        ├─ Escalation schedule                                   │
│        └─ Indirect rates summary                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. USER DOWNLOADS EXCEL                                         │
│    └─ Government-ready pricing proposal                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Design Decisions Explained

### Why store escalation rates per year?
**Problem**: Different years might have different inflation rates
**Solution**: Store `{"1_to_2": 0.0272, "2_to_3": 0.0299, ...}`
**Benefit**: Maximum flexibility, matches real government contracts

### Why use JSON for hours_per_year?
**Problem**: Some positions work different hours in different years
**Solution**: `{"1": 1880, "2": 1880, "3": 0, "4": 1880, "5": 940}`
**Benefit**:
- Can have 0 hours in some years
- Can have part-time in some years
- Easy to add/remove years
- No need for separate table

### Why calculate on-demand instead of storing calculated values?
**Problem**: If user changes indirect rates, all stored calculations are wrong
**Solution**: Store only raw data (base wage, hours, rates), calculate when needed
**Benefit**:
- Always accurate
- Easy to recalculate
- Less storage
- No sync issues

### Why separate prime and subcontractor positions?
**Problem**: They're calculated completely differently
**Solution**: Different database tables, different calculation methods
**Benefit**:
- Clear code
- No confusion
- Easy to explain to users
- Matches real business logic

### Why two Excel sheets?
**Problem**: Government contracts need to show both totals AND how you calculated them
**Solution**:
- Sheet 1: Summary (what they'll pay)
- Sheet 2: Details (how you calculated it)
**Benefit**:
- Transparency
- Audit trail
- Professional
- Matches government requirements

---

## 🚀 What's Already Working vs What's New

### Already Working ✅:
1. Document upload
2. Job description parsing (LLM extraction)
3. BLS wage lookup
4. Single-year FBLR calculation
5. Frontend dashboard with sliders
6. Excel export (single year)

### Need to Build 🆕:
1. Database models (project, position, subcontractor, odc)
2. Multi-year calculation engine
3. Escalation logic
4. Subcontractor markup logic
5. 2-sheet Excel generator
6. API endpoints
7. Integration with existing pipeline

---

## 📊 Example Real Numbers

Let's do ONE complete position to see final numbers:

**Senior Software Engineer - All 5 Years**

```
                Year 1    Year 2    Year 3    Year 4    Year 5
                ------    ------    ------    ------    ------
Escalation       -        2.72%     2.99%     2.63%     3.40%
Factor          1.0000   1.0272    1.0579    1.0857    1.1226

Base Wage       $115,000 $118,128  $121,659  $124,859  $129,101
Hours           1,880    1,880     1,880     1,880     1,880

DL Rate         $61.17   $62.83    $64.71    $66.41    $68.67
Fringe 25.1%    $15.35   $15.77    $16.24    $16.67    $17.24
OH 8.1%         $6.20    $6.37     $6.56     $6.73     $6.96
G&A 19.5%       $16.13   $16.57    $17.06    $17.51    $18.11
Fee 9.1%        $8.99    $9.24     $9.52     $9.76     $10.09

FBLR            $107.84  $110.78   $114.09   $117.08   $121.07
Total Cost      $202,739 $208,266  $214,489  $220,127  $227,613
```

**5-Year Total for this position**: $1,073,234

---

## 🎓 Key Concepts to Remember

1. **Escalation = Compound interest on wages**
   - Year 1: 100%
   - Year 2: 100% × 1.0272 = 102.72%
   - Year 3: 102.72% × 1.0299 = 105.79%
   - Keeps building up!

2. **Indirect rates = Percentages that stay constant**
   - Fringe is always 25.1%
   - But applied to escalated wage
   - So dollar amount goes up even though % is same

3. **Wrap rates = Each rate applies to running total**
   - DL = $61.17
   - DL + Fringe = $76.52 ← OH applies to THIS
   - DL + Fringe + OH = $82.72 ← G&A applies to THIS
   - And so on...

4. **Prime vs Sub = Different math**
   - Prime: We calculate everything from scratch
   - Sub: They give us FBLR, we just mark it up

5. **FBLR = Fully Burdened Labor Rate**
   - "Fully burdened" means all costs included
   - Direct labor + all indirect costs + fee
   - This is what you bill the government per hour

---

## 🔧 Next Steps to Implement

1. ✅ Create database models
2. ✅ Create calculation service
3. ✅ Create Excel generator
4. ✅ Create API endpoints
5. ✅ Test with real data
6. ✅ Integrate with existing document processing
7. ✅ Update frontend to support multi-year

---

## 📝 Summary

This pipeline takes job descriptions → looks up wages → lets you configure multi-year project settings → calculates escalated costs year by year → generates professional Excel that shows both summary and detailed breakdown.

The key innovation is **compound escalation** + **constant indirect rate percentages** + **separate handling of subcontractors** + **flexible JSON storage for variable data**.

Everything is designed to match real government contract pricing requirements while being flexible enough to handle different project structures.
