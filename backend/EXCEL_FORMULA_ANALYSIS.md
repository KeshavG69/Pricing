# Excel Formula Analysis: Intprepix Volume III

Complete detailed analysis of all formulas and calculations for development reference.

**File:** `/Users/keshav/Developer/Others/Pricing/Intprepix Volume III.xlsx`

---

# Table of Contents

1. [Sheet 1: Cost Proposal Spreadsheet](#sheet-1-cost-proposal-spreadsheet)
   - [Header Structure](#1-header-structure-rows-1-10)
   - [Position Rows](#2-position-row-structure-rows-11-94)
   - [Direct Labor Totals](#3-direct-labor-totals-row-95)
   - [Indirect Labor Costs (Wrap Rates)](#4-indirect-labor-costs-wrap-rates-rows-96-103)
   - [Subcontractor Section](#5-subcontractor-section-rows-106-153)
   - [Total Labor Cost](#6-total-labor-cost-row-155)
   - [Fee Calculations](#7-fee-calculations-rows-157-160)
   - [ODC Section](#8-odc-section-rows-164-167)
   - [Grand Total](#9-grand-total-row-169)
2. [Sheet 2: Subcontractor Fee_MH Rate Table](#sheet-2-subcontractor-fee_mh-rate-table)

---

# SHEET 1: Cost Proposal Spreadsheet

**Dimensions:** A1:T192

## 1. Header Structure (Rows 1-10)

### Row 1: Solicitation Info
```
A1: SOLICITATION NO. N0017825R3013 - ATTACHMENT J.8
I1, L1, O1, R1: Escalation (labels)
```

### Row 2: Escalation Rates (CRITICAL)
```
I2: 0.0272  (2.72% - Year 1 to Year 2)
L2: 0.0299  (2.99% - Year 2 to Year 3)
O2: 0.0263  (2.63% - Year 3 to Year 4)
R2: 0.034   (3.40% - Year 4 to Year 5)
```

**These cells are referenced by ALL position escalation formulas!**

### Row 7: Year Headers
```
D7: Total for All Years
F7: Base Period
I7: Option Year 1
L7: Option Year 2
O7: Option Year 3
R7: Option Year 4
```

### Row 8: Column Headers

| Column | Header | Description |
|--------|--------|-------------|
| A | Cost Elements | Section identifier (Prime, Sub, ODC, etc.) |
| B | Company Labor Category | Job title |
| C | eCRAFT Labor Category | Government standard category |
| D | Hours | **Total** hours across all 5 years |
| E | Amount | **Total** amount across all 5 years |
| **F** | **Rate** | **Base Period FBLR ($/hr)** |
| G | Hours | Base Period hours |
| H | Amount | Base Period amount |
| **I** | **Rate** | **Option Year 1 FBLR ($/hr)** |
| J | Hours | Option Year 1 hours |
| K | Amount | Option Year 1 amount |
| **L** | **Rate** | **Option Year 2 FBLR ($/hr)** |
| M | Hours | Option Year 2 hours |
| N | Amount | Option Year 2 amount |
| **O** | **Rate** | **Option Year 3 FBLR ($/hr)** |
| P | Hours | Option Year 3 hours |
| Q | Amount | Option Year 3 amount |
| **R** | **Rate** | **Option Year 4 FBLR ($/hr)** |
| S | Hours | Option Year 4 hours |
| T | Amount | Option Year 4 amount |

---

## 2. Position Row Structure (Rows 11-94)

### Example: Row 11 (Program Manager, Senior)

**Row 11 Complete Breakdown:**

```
A11: Key - Individual 1
B11: Program Manager, Senior
C11: MANAGER, PROGRAM/PROJECT II
```

#### Total Columns (Sums across all years):
```
D11: =G11+J11+M11+P11+S11
     (Total hours = Base hours + Y2 hours + Y3 hours + Y4 hours + Y5 hours)

E11: =H11+K11+N11+Q11+T11
     (Total amount = Base amount + Y2 amount + Y3 amount + Y4 amount + Y5 amount)
```

#### Base Period (Year 1):
```
F11: 98.38723404255319  ← HARDCODED FBLR (already calculated with wrap rates!)
G11: 1880               ← Hours
H11: =F11*G11          → Amount = Rate × Hours
```

#### Option Year 1 (Year 2):
```
I11: =F11+(F11*$I$2)   → Escalated rate = F11 * (1 + 0.0272)
                       → 98.387 * 1.0272 = 101.063
J11: 1880              ← Hours
K11: =I11*J11         → Amount = Escalated rate × Hours
```

#### Option Year 2 (Year 3):
```
L11: =I11+(I11*$L$2)   → Escalated rate = I11 * (1 + 0.0299)
                       → Compounds on Year 2 rate!
M11: 1880              ← Hours
N11: =L11*M11         → Amount
```

#### Option Year 3 (Year 4):
```
O11: =L11+(L11*$O$2)   → Escalated rate = L11 * (1 + 0.0263)
P11: 1880              ← Hours
Q11: =O11*P11         → Amount
```

#### Option Year 4 (Year 5):
```
R11: =O11+(O11*$R$2)   → Escalated rate = O11 * (1 + 0.0340)
S11: 1880              ← Hours
T11: =R11*S11         → Amount
```

### KEY INSIGHT: Escalation Formula Pattern

```
Excel Formula:    =PreviousRate+(PreviousRate*$EscalationCell$)
Equivalent to:    =PreviousRate*(1+EscalationRate)

Year 1 Rate (F): HARDCODED (FBLR already includes DL + Fringe + OH + G&A)
Year 2 Rate (I): =F+(F*$I$2) → F × 1.0272
Year 3 Rate (L): =I+(I*$L$2) → I × 1.0299  ← Compounds!
Year 4 Rate (O): =L+(L*$O$2) → L × 1.0263  ← Compounds!
Year 5 Rate (R): =O+(O*$R$2) → O × 1.0340  ← Compounds!
```

**IMPORTANT:**
- The base rate (F) is already a Fully Burdened Labor Rate (FBLR)
- FBLR includes: Direct Labor + Fringe + Overhead + G&A
- Escalation applies to the ENTIRE FBLR (not just direct labor)
- Each year compounds on the previous year

### Row Pattern Repeats

Rows 11-94 all follow this same pattern. Each position has:
- Hardcoded FBLR in column F
- Hours for each year (columns G, J, M, P, S)
- Amount formulas: Rate × Hours
- Escalation formulas: PreviousRate × (1 + EscalationRate)

---

## 3. Direct Labor Totals (Row 95)

```
A95: Total Direct Labor Cost

G95: =SUM(G11:G94)   → Sum of all Base Period hours
H95: =SUM(H11:H94)   → Sum of all Base Period amounts

J95: =SUM(J11:J94)   → Sum of all Option Year 1 hours
K95: =SUM(K11:K94)   → Sum of all Option Year 1 amounts

... (pattern continues for all years)

D95: =G95+J95+M95+P95+S95  → Total hours across all years
E95: =H95+K95+N95+Q95+T95  → Total amounts across all years
```

---

## 4. Indirect Labor Costs (Wrap Rates) - Rows 96-103

### Row 96: Section Header
```
A96: Prime Contractor Indirect Labor Cost
```

### Row 97: Overhead (OH)

**Base Period (Columns F-H):**
```
F97: 0.07                ← OH rate (7%)
G97: =H95+H98            ← Base for OH = Direct Labor + Fringe
H97: =F97*G97            ← OH amount = 7% of (DL + Fringe)
```

**Option Year 1 (Columns I-K):**
```
I97: 0.07                ← OH rate (same 7%)
J97: =K95+K98            ← Base = Y2 DL + Y2 Fringe
K97: =I97*J97            ← OH amount
```

**KEY INSIGHT:** OH applies to (Direct Labor + Fringe), not just Direct Labor!

### Row 98: Fringe Benefits

**Base Period:**
```
F98: 0.25                ← Fringe rate (25%)
G98: =H95                ← Base for Fringe = Direct Labor only
H98: =F98*G98            ← Fringe amount = 25% of DL
```

**Option Year 1:**
```
I98: 0.25                ← Fringe rate (same 25%)
J98: =K95                ← Base = Y2 Direct Labor
K98: =I98*J98            ← Fringe amount
```

### Row 99: G&A

**Base Period:**
```
F99: 0.22                ← G&A rate (22%)
G99: =H95+H98+H97        ← Base for G&A = DL + Fringe + OH
H99: =F99*G99            ← G&A amount = 22% of (DL + Fringe + OH)
```

**Option Year 1:**
```
I99: 0.22                ← G&A rate (same 22%)
J99: =K95+K98+K97        ← Base = Y2 (DL + Fringe + OH)
K99: =I99*J99            ← G&A amount
```

### Wrap Rate Sequence Summary

```
Step 1: Direct Labor (DL)                    = $X
Step 2: Fringe (25% of DL)                   = $Y
        Subtotal                              = $X + $Y
Step 3: OH (7% of Subtotal)                  = $Z
        Subtotal                              = $X + $Y + $Z
Step 4: G&A (22% of Subtotal)                = $W
        Total                                 = $X + $Y + $Z + $W

Each indirect rate applies to the CUMULATIVE SUBTOTAL (wrap rates)!
```

### Row 100: Total Indirect Labor Cost
```
H100: =H97+H98+H99   → Sum of OH + Fringe + G&A
K100: =K97+K98+K99   → Same for each year
```

### Row 101: Total Direct and Indirect Labor Cost
```
H101: =H95+H100      → Direct Labor + Indirect Labor
K101: =K95+K100      → Same for each year
```

### Row 102: COM (Communications?)
```
E102: =H102+K102+N102+Q102+T102
(Appears to be zero or minimal)
```

### Row 103: Total Prime Contractor Labor Cost
```
H103: =ROUND(H101+H102,2)   → Total labor (rounded to 2 decimals)
K103: =ROUND(K101+K102,2)   → Same for each year

E103: =H103+K103+N103+Q103+T103  → Total across all years
```

---

## 5. Subcontractor Section (Rows 106-153)

### Row 106: Header
```
A106: Subcontractor proposed cost and fee
```

### Subcontractor Position Rows (Similar to Prime)

Rows 107+ follow same pattern as prime contractor:
- Column F: Subcontractor FBLR (their rate)
- Columns G-T: Hours and amounts per year
- Escalation formulas same as prime

**Key Difference:** Subcontractor rates are THEIR fully burdened rates (they calculated their own wrap rates). We just add our markup (Fee + S&MH) in the totals section.

### Row 147: Total Subcontractor Labor Cost
```
E147: =H147+K147+N147+Q147+T147  → Total sub labor across all years
```

### Row 148-152: Pass Through Costs

**Row 148: Prime contractor pass through (not including fee)**
```
E148: (Total subcontractor cost)
```

**Row 150: G&A on Subs**
```
E150: =H150+K150+N150+Q150+T150
(G&A applied to subcontractor costs - pass through)
```

**Row 152: Total pass through (not including fee)**
```
H152: =H149+H150+H151
E152: =H152+K152+N152+Q152+T152
```

### Row 153: Total Subcontractor Cost including pass through
```
H153: =ROUND(H147+H152,2)
E153: =H153+K153+N153+Q153+T153
```

---

## 6. Total Labor Cost (Row 155)

```
A155: Total Labor Cost (Prime and Subcontractor Labor)

H155: =ROUND(H103+H153,2)  → Base Period: Prime Labor + Sub Labor
E155: =H155+K155+N155+Q155+T155  → Total across all years
```

---

## 7. Fee Calculations (Rows 157-160)

### Row 158: Prime Contractor Fee for Prime Contractor Labor

**Base Period:**
```
F158: 0.08               ← Fee rate (8%)
G158: =H103              ← Base = Total Prime Labor Cost
H158: =F158*G158         ← Fee = 8% of Prime Labor
```

**Option Year 1:**
```
I158: 0.08
J158: =K103
K158: =I158*J158
```

### Row 159: Prime Contractor Fee for Subcontractor Labor

**Base Period:**
```
F159: 0.0126             ← Fee rate (1.26%)
G159: =H153              ← Base = Total Sub Cost (including pass through)
H159: =F159*G159         ← Fee = 1.26% of Sub Cost
```

### Row 160: Total Fee
```
H160: =ROUND(H158+H159,2)  → Prime Fee + Sub Fee
E160: =H160+K160+N160+Q160+T160
```

---

## 8. ODC Section (Rows 164-167)

### Row 165: Other Direct Costs (ODCs)

**Base Period:**
```
H165: 54844.05           ← HARDCODED ODC amount
```

**Option Year 1:**
```
K165: 42772.84           ← HARDCODED (different per year)
```

**Totals:**
```
E165: =H165+K165+N165+Q165+T165  → Total ODCs across all years
```

### Row 166: G&A Adder on ODCs

**Base Period:**
```
F166: 0.2212             ← G&A rate for ODCs (22.12%)
G166: =H165              ← Base = ODC amount
H166: =F166*G166         ← G&A adder = 22.12% of ODC
```

**Option Year 1:**
```
I166: 0.2212             ← Same G&A rate
J166: =K165              ← Base = Y2 ODC amount
K166: =I166*J166         ← G&A adder
```

### Row 167: Total ODCs
```
H167: =ROUND(H165+H166,2)  → ODC + G&A adder
E167: =H167+K167+N167+Q167+T167  → Total across all years
```

**KEY INSIGHT:** ODC has its own G&A adder (22.12%), separate from labor G&A (22%). No fee is applied to ODCs.

---

## 9. Grand Total (Row 169)

```
A169: Total CPFF all CLINs (Labor and ODCs)

H169: =H162+H167         → Labor + Fee + ODCs
     (Row 162 = Total Labor Cost Plus Fixed Fee)

G169: =G95+G147          → Total hours (Prime + Sub)
D169: =G169+J169+M169+P169+S169  → Total hours all years
E169: =H169+K169+N169+Q169+T169  → Total amount all years
```

---

# SHEET 2: Subcontractor Fee_MH Rate Table

**Dimensions:** B2:P165

## Purpose

This sheet shows the "reverse calculation" - how to work backwards from Nexagen's target FBLR to determine what subcontractor rates should be after removing prime markup.

## Section 1: Reverse Calculation Example (Rows 2-8)

### Row 3: Fee Removal

```
B3: FEE
C3: 140                  ← Target Nexagen FBLR
D3: 0.1                  ← Fee rate (10%)
E3: =C3*D3              → Fee amount = 140 * 0.1 = 14
F3: =C3+E3              → With fee = 140 + 14 = 154
```

**Wait, this seems backwards!** Let me re-analyze...

Actually, looking at Row 4-8, this appears to be working BACKWARDS:

### Row 3: Remove Fee (Going Backwards)
```
C3: 140                  ← Target rate (what we want to charge)
D3: 0.1                  ← Fee rate
E3: =C3*D3              → Fee amount
F3: =C3+E3              → Rate before fee
```

Actually, looking more carefully at the formulas:

### Rows 3-4: Forward Markup Calculation

```
Row 3 (FEE):
  C3: 140                ← Sub FBLR (starting point)
  D3: 0.1                ← Prime Fee (10%)
  E3: =C3*D3             → Fee = 140 * 0.1 = 14
  F3: =C3+E3             → With Fee = 140 + 14 = 154

Row 4 (S&MH):
  C4: =F3                ← Previous subtotal (154)
  D4: 0.0665             ← S&MH rate (6.65%)
  E4: =C4*D4             → S&MH = 154 * 0.0665 = 10.24
  F4: =C4+E4             → Final = 154 + 10.24 = 164.24
```

So the markup sequence is:
```
Sub FBLR                     = $140
+ Fee (10%)                  = $14
Subtotal                     = $154
+ S&MH (6.65%)               = $10.24
Final Billed Rate            = $164.24
```

### Rows 7-8: Reverse Calculation

```
Row 7 (S&MH - Reverse):
  C7: =F4                ← Start with final rate (164.24)
  D7: 0.06235...         ← Reverse S&MH rate
  E7: =C7*D7             → S&MH amount
  F7: =C7-E7             ← Remove S&MH (going backwards)

Row 8 (FEE - Reverse):
  C8: =F7                ← Previous result
  D8: 0.09090...         ← Reverse Fee rate
  E8: =C8*D8             → Fee amount
  F8: =C8-E8             ← Remove Fee → Back to Sub FBLR ($140)
```

## Section 2: Position Rate Table (Rows 3-17)

### Headers (Row 3):
```
H3: Labor Category
I3: Nexagen FBLR         ← Target rate to charge government
J3: FEE                   ← Calculated by removing fee
K3: S&MH                  ← Calculated by removing S&MH
L3: Target Rate           ← Should match sub FBLR
M3: S&MH                  ← Forward calculation
N3: FEE                   ← Forward calculation
O3: Diff Check            ← Verification (should be 0)
```

### Example Row 4 (Agile Scrum Master):

```
I4: 140                         ← Nexagen target FBLR
J4: =ROUND(I4-(I4*$J$2),0)     → Remove fee backwards
K4: =ROUND(J4-(J4*$K$2),0)     → Remove S&MH backwards
L4: =ROUND(K4,0)                → Target sub rate (what sub should charge)
M4: =ROUND(L4+(L4*$M$2),0)     → Add S&MH forward
N4: =ROUND(M4+(M4*$N$2),0)     → Add Fee forward
O4: =I4-N4                      → Check (should equal 0)
```

Where:
- `$J$2` = Reference to fee rate cell (10%)
- `$K$2` = Reference to S&MH rate cell (6.65%)
- `$M$2` = Forward S&MH rate
- `$N$2` = Forward Fee rate

---

# Key Formulas Summary

## Escalation (Year-over-Year)
```
NewRate = PreviousRate + (PreviousRate * EscalationRate)
        = PreviousRate * (1 + EscalationRate)

Excel: =PreviousCell+(PreviousCell*$EscalationRateCell$)
```

## Amount Calculation
```
Amount = Rate * Hours

Excel: =RateCell*HoursCell
```

## Wrap Rates (Indirect Costs)
```
Fringe  = DirectLabor * 0.25
OH      = (DirectLabor + Fringe) * 0.07
G&A     = (DirectLabor + Fringe + OH) * 0.22

Each applies to cumulative subtotal!
```

## Fee Calculation
```
PrimeFee = PrimeLaborCost * 0.08
SubFee   = SubLaborCost * 0.0126
TotalFee = PrimeFee + SubFee
```

## ODC with G&A Adder
```
ODC_GA = ODC_Base * 0.2212
TotalODC = ODC_Base + ODC_GA
```

## Subcontractor Markup
```
SubFBLR = Their rate (from subcontractor)
+ Fee (10%) = SubFBLR * 0.10
Subtotal = SubFBLR + Fee
+ S&MH (6.65%) = Subtotal * 0.0665
FinalRate = Subtotal + S&MH
```

---

# Implementation Notes

## What Gets Stored in Database

1. **Project Config:**
   - Escalation rates per year: `{1_to_2: 0.0272, 2_to_3: 0.0299, ...}`
   - Indirect rates: `{fringe: 0.25, oh: 0.07, ga: 0.22}`
   - Fee rates: `{prime_fee: 0.08, sub_fee: 0.0126}`
   - ODC G&A rate: `0.2212`
   - Sub markup rates: `{fee: 0.10, smh: 0.0665}`

2. **Positions:**
   - Labor category
   - Base year wage (annual) → Calculate to hourly FBLR
   - Hours per year: `{1: 1880, 2: 1880, 3: 1880, 4: 1880, 5: 1880}`

3. **ODCs:**
   - Base amounts per year: `{1: 54844.05, 2: 42772.84, ...}`
   - Whether to apply G&A adder

## What Gets Calculated

1. **Position FBLR (Base Year):**
   ```
   HourlyRate = AnnualWage / Hours
   Fringe = HourlyRate * 0.25
   OH = (HourlyRate + Fringe) * 0.07
   G&A = (HourlyRate + Fringe + OH) * 0.22
   FBLR = HourlyRate + Fringe + OH + G&A
   ```

2. **Escalated Rates (Each Year):**
   ```
   Year2Rate = Year1Rate * (1 + escalation_1_to_2)
   Year3Rate = Year2Rate * (1 + escalation_2_to_3)
   ...
   ```

3. **Amounts:**
   ```
   YearAmount = YearRate * YearHours
   ```

## Excel Generation

- **Cell F (Base rate):** Insert calculated FBLR value
- **Cell I (Year 2 rate):** Insert formula `=F11+(F11*$I$2)`
- **Cell L (Year 3 rate):** Insert formula `=I11+(I11*$L$2)`
- **Cell O (Year 4 rate):** Insert formula `=L11+(L11*$O$2)`
- **Cell R (Year 5 rate):** Insert formula `=O11+(O11*$R$2)`
- **Amount cells:** Insert formula `=RateCell*HoursCell`
- **Total cells:** Insert SUM formulas
- **Wrap rate cells:** Insert formula with proper base references
- **Fee cells:** Insert formula with proper percentage references

This allows users to edit escalation rates, hours, or indirect rate percentages in Excel and see recalculations!

---

# Critical Design Decisions

1. **FBLR is calculated BEFORE entering Excel** - The Excel file has hardcoded rates in column F because the wrap rates have already been applied

2. **Escalation applies to entire FBLR** - Not just direct labor, but the whole burdened rate

3. **Each year compounds** - Year 3 = Year 2 * escalation, not Year 1 * cumulative

4. **Indirect rates are percentages that stay constant** - Only the base values escalate

5. **ODC has separate G&A adder** - 22.12% vs 22% for labor

6. **Subcontractors provide their own FBLR** - We only add our markup (Fee + S&MH)

7. **Fee applies to labor only** - ODCs don't get fee applied

8. **Hours can vary per year** - Column G, J, M, P, S can have different values

---

# Questions for Development

✅ **Q: Where does the base FBLR come from?**
A: Calculated from BLS wage + wrap rates (Fringe 25% → OH 7% → G&A 22%)

✅ **Q: Do indirect rate percentages escalate?**
A: No, only the base wage escalates. Percentages stay constant.

✅ **Q: How does escalation compound?**
A: Each year multiplies previous year by (1 + rate). Year 3 = Year 2 * 1.0299, not Year 1 * combined rate.

✅ **Q: What's the ODC G&A rate?**
A: 22.12% (slightly different from labor G&A of 22%)

✅ **Q: Do we calculate subcontractor wrap rates?**
A: No, subs provide their FBLR. We only add our markup: Fee (10%) then S&MH (6.65%)

✅ **Q: Does fee apply to ODCs?**
A: No, only labor gets fee. ODCs only get G&A adder.

---

End of Analysis
