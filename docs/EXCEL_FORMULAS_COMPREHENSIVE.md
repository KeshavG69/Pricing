# Excel Formula Guide - Complete Breakdown

**Last Updated:** December 15, 2025
**Purpose:** This document explains every Excel formula used in government contract cost proposals, in simple language with step-by-step examples.

---

## Table of Contents

1. [What is FBLR and Why It Matters](#what-is-fblr-and-why-it-matters)
2. [The FBLR Cascade Formula](#the-fblr-cascade-formula)
3. [Escalation (Year-over-Year Increases)](#escalation-year-over-year-increases)
4. [Excel Cell Formulas](#excel-cell-formulas)
5. [Pass-Through Calculations](#pass-through-calculations)
6. [Fee Calculations](#fee-calculations)
7. [ODC Calculations](#odc-calculations)
8. [Averaged FBLR](#averaged-fblr)
9. [Subcontractor Rate Table](#subcontractor-rate-table)
10. [Dynamic Year Columns](#dynamic-year-columns)

---

## What is FBLR and Why It Matters

### What is FBLR?

**FBLR** = **Fully Burdened Labor Rate**

It's the **total cost per hour** to employ someone, including:
- **Base salary** (what they get paid)
- **Fringe benefits** (healthcare, retirement, paid time off)
- **Overhead** (rent, utilities, computers, office costs)
- **G&A** (General & Administrative - management, HR, accounting)
- **Fee** (profit the company makes)

### Simple Example

**Scenario:** You want to hire a software developer

```
Base Salary: $100,000/year
Hours worked: 2,080 hours/year (40 hrs/week × 52 weeks)

Base hourly rate = $100,000 ÷ 2,080 = $48.08/hour
```

**But that's not the full cost!** You also pay for:

```
Healthcare insurance: $12,000/year
Retirement (401k match): $5,000/year
Paid vacation (2 weeks): $3,846/year
Office rent (their portion): $6,000/year
Laptop and equipment: $2,000/year
Management overhead: $15,000/year
Your profit: $7,000/year
─────────────────────────────────
TOTAL REAL COST: $150,846/year

FBLR = $150,846 ÷ 2,080 hours = $72.52/hour
```

**So when you bill the government:**
- They pay $72.52/hour (FBLR)
- You pay the employee $48.08/hour
- The difference ($24.44/hour) covers benefits, overhead, management, and profit

### Why Government Contracts Need FBLR

Government contracts require you to show:
1. How much you pay the employee (Direct Labor)
2. What benefits you provide (Fringe)
3. Your company's overhead costs (OH)
4. Your management costs (G&A)
5. Your profit (Fee)

They want to see that you're not overcharging. FBLR breaks down every cost transparently.

---

## The FBLR Cascade Formula

### The Core Concept: Cascading Rates

**Key Insight:** Each rate applies to the **cumulative total**, not just the base wage.

Think of it like a waterfall:
```
Direct Labor (base)
  ↓ + 24.7% Fringe
  ↓ = Subtotal 1
  ↓ + 7.11% Overhead (applied to Subtotal 1, not just base)
  ↓ = Subtotal 2
  ↓ + 22.43% G&A (applied to Subtotal 2, not just base)
  ↓ = Subtotal 3
  ↓ + 7% Fee (applied to Subtotal 3, not just base)
  ↓ = Final FBLR
```

**This is CRITICAL:** Later rates are calculated on the **growing total**, not the original base.

### Step-by-Step FBLR Calculation

Let's calculate FBLR for a Program Manager with detailed examples.

#### Given Information

```
Annual Salary: $115,000
Hours per year: 1,880 (some people work less than 2,080)
Fringe Rate: 24.7%
Overhead Rate: 7.11%
G&A Rate: 22.43%
Fee Rate: 7%
```

#### Step 1: Calculate Direct Labor (DL) Rate

**Formula:** `DL = Annual Salary ÷ Hours`

```
DL = $115,000 ÷ 1,880
DL = $61.17 per hour
```

**What this means:** If there were no benefits, overhead, or profit, you'd charge $61.17/hour.

#### Step 2: Calculate Fringe

**Formula:** `Fringe = DL × Fringe Rate`

```
Fringe = $61.17 × 0.247
Fringe = $15.11 per hour
```

**What this means:** Healthcare, retirement, vacation, etc. cost $15.11/hour per employee.

**Subtotal 1:** `DL + Fringe = $61.17 + $15.11 = $76.28/hour`

#### Step 3: Calculate Overhead (OH)

**Formula:** `OH = (DL + Fringe) × OH Rate`

**IMPORTANT:** Overhead is **NOT** applied to just DL. It's applied to **DL + Fringe**.

```
OH = $76.28 × 0.0711
OH = $5.42 per hour
```

**What this means:** Rent, utilities, equipment cost $5.42/hour per employee.

**Why OH is calculated this way:** Overhead costs (rent, utilities) are needed to support **fully-loaded employees** (including their benefits), not just their base salary.

**Subtotal 2:** `DL + Fringe + OH = $76.28 + $5.42 = $81.70/hour`

#### Step 4: Calculate G&A

**Formula:** `G&A = (DL + Fringe + OH) × G&A Rate`

**IMPORTANT:** G&A is applied to **Subtotal 2**, not just DL.

```
G&A = $81.70 × 0.2243
G&A = $18.32 per hour
```

**What this means:** Management, HR, accounting, legal, finance departments cost $18.32/hour per employee.

**Why G&A is calculated this way:** Management overhead is needed to run the **entire burdened operation** (employees + benefits + facilities), not just pay salaries.

**Subtotal 3:** `DL + Fringe + OH + G&A = $81.70 + $18.32 = $100.02/hour`

#### Step 5: Calculate Fee (Profit)

**Formula:** `Fee = (DL + Fringe + OH + G&A) × Fee Rate`

**IMPORTANT:** Fee is applied to **Subtotal 3**, not just DL.

```
Fee = $100.02 × 0.07
Fee = $7.00 per hour
```

**What this means:** Your company's profit is $7/hour per employee.

**Why Fee is calculated this way:** Profit is earned on the **total cost of delivering the service** (fully burdened employee), not just the salary.

#### Step 6: Calculate Final FBLR

**Formula:** `FBLR = DL + Fringe + OH + G&A + Fee`

```
FBLR = $61.17 + $15.11 + $5.42 + $18.32 + $7.00
FBLR = $107.02 per hour
```

**Final Result:** You charge the government **$107.02/hour** for this Program Manager.

**Breakdown:**
- $61.17 (57%) = Employee's actual wage
- $15.11 (14%) = Benefits
- $5.42 (5%) = Overhead
- $18.32 (17%) = Management
- $7.00 (7%) = Profit

### Why the Cascade Matters

**Common Mistake:** Applying all rates to just the base wage

```
WRONG WAY:
DL = $61.17
Fringe = $61.17 × 0.247 = $15.11
OH = $61.17 × 0.0711 = $4.35    ← WRONG! Should be $5.42
G&A = $61.17 × 0.2243 = $13.72  ← WRONG! Should be $18.32
Fee = $61.17 × 0.07 = $4.28     ← WRONG! Should be $7.00

Wrong Total = $98.63/hour       ← Undercharges by $8.39/hour!
```

**Over a 1-year contract:**
```
Wrong rate: $98.63/hour × 1,880 hours = $185,424
Correct rate: $107.02/hour × 1,880 hours = $201,198

You lose $15,774 per employee per year!
```

**The cascade ensures:**
- Overhead covers rent for employees **with their benefits** (not just bare salary)
- G&A covers management for **fully burdened operation** (not just salaries)
- Fee provides profit on **total delivered value** (not just labor cost)

---

## Escalation (Year-over-Year Increases)

### What is Escalation?

**Escalation** = Annual wage increases to account for inflation and cost of living.

Government contracts typically last 5+ years. Salaries increase each year, so your rates must increase too.

### Simple Escalation Example

**Scenario:** 3-year contract with 3% annual escalation

```
Year 1 Rate: $100.00/hour
Escalation: 3% per year

Year 2 Rate = Year 1 × (1 + 0.03) = $100.00 × 1.03 = $103.00/hour
Year 3 Rate = Year 2 × (1 + 0.03) = $103.00 × 1.03 = $106.09/hour
```

**Key Point:** Escalation **compounds** (Year 3 is based on Year 2, not Year 1).

### Real-World Escalation (Different Rates Each Year)

**Scenario:** 5-year Navy contract with varying escalation rates

```
Given Escalation Rates:
- Year 1 → Year 2: 2.72%
- Year 2 → Year 3: 2.99%
- Year 3 → Year 4: 2.63%
- Year 4 → Year 5: 3.40%
```

**Calculation:**

```
Base Year 1 FBLR: $107.02/hour

Year 2 = $107.02 × 1.0272 = $109.93/hour
Year 3 = $109.93 × 1.0299 = $113.22/hour
Year 4 = $113.22 × 1.0263 = $116.20/hour
Year 5 = $116.20 × 1.0340 = $120.15/hour
```

**Alternative Formula (Direct Calculation):**

```
Year 5 = Year 1 × (1.0272) × (1.0299) × (1.0263) × (1.0340)
Year 5 = $107.02 × 1.1226
Year 5 = $120.15/hour
```

**Total Escalation over 5 years:** 12.26%

### Escalation Logic in Code

```python
def calculate_escalated_rate(base_rate, escalation_rates, target_year):
    """
    Calculate escalated rate for any year

    Args:
        base_rate: Year 1 FBLR (e.g., $107.02)
        escalation_rates: {"1_to_2": 0.0272, "2_to_3": 0.0299, ...}
        target_year: Which year to calculate (e.g., 3)

    Returns:
        Escalated rate for target year
    """
    rate = base_rate

    for year in range(1, target_year):
        escalation_key = f"{year}_to_{year+1}"
        escalation_rate = escalation_rates.get(escalation_key, 0.03)  # Default 3%
        rate = rate * (1 + escalation_rate)

    return rate

# Example
base_rate = 107.02
escalation_rates = {
    "1_to_2": 0.0272,
    "2_to_3": 0.0299,
    "3_to_4": 0.0263,
    "4_to_5": 0.0340
}

year_3_rate = calculate_escalated_rate(base_rate, escalation_rates, 3)
print(year_3_rate)  # $113.22
```

### Prorated Escalation for Partial Years

**Scenario:** Year 2 is only 8 months (not full 12 months)

**Logic:** Apply partial escalation based on months worked

```python
def calculate_prorated_escalation(escalation_rate, months):
    """
    Prorate escalation for partial years

    Args:
        escalation_rate: Full year escalation (e.g., 0.03 for 3%)
        months: Number of months worked (e.g., 8)

    Returns:
        Prorated escalation rate
    """
    return escalation_rate * (months / 12.0)

# Example: 3% annual escalation, but only 8 months
full_escalation = 0.03
prorated_escalation = calculate_prorated_escalation(full_escalation, 8)
print(prorated_escalation)  # 0.02 (2%)

# Apply to wage
year_1_wage = 115000
year_2_wage = year_1_wage * (1 + prorated_escalation)
print(year_2_wage)  # $117,300 (not full $118,450)
```

**When to use prorated escalation:**
- Contract starts mid-year
- Option year is only 6-10 months
- Partial year at end of contract

---

## Excel Cell Formulas

### Overview of Excel Structure

**The Excel file has this layout:**

```
     A           B              C         D      E       F      G    H    I
Row  Cost       Labor          BLS      BLS    Total   Total  Year 1
     Elements   Category       Category Code   Hours   Amount Rate Hours Amount

8    [Headers]
9    Prime Contractor Labor Cost
10   Prime Contractor Direct Labor
11   John Doe   Program Mgr    Comp Mgr  11-... 1880   $201K  $107  1880  $201K
12   Jane Smith Software Dev   Soft Dev  15-... 1880   $195K  $104  1880  $195K
13   ...
30   Total Direct Labor                          5640   $585K        5640  $585K
31   Fringe                                             $144K               $144K
32   Subtotal (DL + Fringe)                             $729K               $729K
33   Overhead                                           $52K                $52K
34   Subtotal (DL + Fringe + OH)                        $781K               $781K
35   G&A                                                $175K               $175K
36   Total Prime Labor Cost (FBLR)                      $956K               $956K
```

**Key Features:**
- **Columns A-F:** Summary info (name, category, totals)
- **Columns G-I:** Year 1 details (Rate, Hours, Amount)
- **Columns J-L:** Year 2 details (Rate, Hours, Amount)
- **Columns M-O:** Year 3 details (Rate, Hours, Amount)
- ...and so on for each year

### Individual Position Row Formulas

**Example Row 11 (Program Manager):**

```excel
Cell A11: "John Doe"                    (Name - input)
Cell B11: "Program Manager"             (Labor Category - input)
Cell C11: "Computer and Information..." (BLS Category - from database)
Cell D11: "11-3021"                     (SOC Code - from database)
Cell E11: =SUM(H11, K11, N11, ...)     (Total Hours - sum all years)
Cell F11: =SUM(I11, L11, O11, ...)     (Total Amount - sum all years)

Year 1 columns:
Cell G11: $107.02                       (Year 1 Rate - calculated)
Cell H11: 1880                          (Year 1 Hours - input)
Cell I11: =G11*H11                      (Year 1 Amount = Rate × Hours)

Year 2 columns:
Cell J11: $109.93                       (Year 2 Rate - escalated)
Cell K11: 1880                          (Year 2 Hours - input)
Cell L11: =J11*K11                      (Year 2 Amount = Rate × Hours)

Year 3 columns:
Cell M11: $113.22                       (Year 3 Rate - escalated)
Cell N11: 1880                          (Year 3 Hours - input)
Cell O11: =M11*N11                      (Year 3 Amount = Rate × Hours)
```

**Generic Formula Pattern:**

```excel
For Year N starting at column offset C:
  Rate column (C+0): Calculated value (FBLR with escalation)
  Hours column (C+1): Input value (user enters)
  Amount column (C+2): =(C+0)row * (C+1)row
```

### Total Direct Labor Row Formula

**Example Row 30 (Total Direct Labor):**

```excel
Cell A30: "Total Direct Labor"          (Label)
Cell E30: =SUM(E11:E29)                 (Total hours - all positions)
Cell F30: =SUM(F11:F29)                 (Total amount - all positions)

Year 1:
Cell I30: =SUM(I11:I29)                 (Year 1 total amount)

Year 2:
Cell L30: =SUM(L11:L29)                 (Year 2 total amount)

Year 3:
Cell O30: =SUM(O11:O29)                 (Year 3 total amount)
```

**Key Point:** SUM ranges from first position (row 11) to last position (row 29).

### Indirect Cost Rows with Rate References

**Special Feature:** Rates are stored in editable cells on the right side of the sheet.

**Rate Reference Section (far right columns, e.g., columns AB-AC):**

```excel
Cell AB1: "RATES REFERENCE"             (Header)
Cell AB2: "Edit these values to update all calculations"
Cell AB3: "Fringe Rate:"
Cell AC3: 0.247                         (24.7% - EDITABLE)
Cell AB4: "OH Rate:"
Cell AC4: 0.0711                        (7.11% - EDITABLE)
Cell AB5: "G&A Rate:"
Cell AC5: 0.2243                        (22.43% - EDITABLE)
Cell AB6: "Prime Labor Fee:"
Cell AC6: 0.07                          (7% - EDITABLE)
```

**These cells are:**
- Highlighted in **yellow** (indicates user can edit)
- Formatted as **percentages** (0.247 displays as 24.7%)
- Referenced by **absolute cell references** (e.g., `$AC$3`)

### Fringe Row Formula

**Example Row 31 (Fringe):**

```excel
Cell A31: "Fringe"                      (Label)
Cell F31: =F30*$AC$3                    (Total Fringe = Total DL × Fringe Rate)

Year 1:
Cell I31: =I30*$AC$3                    (Year 1 Fringe = Year 1 DL × Fringe Rate)

Year 2:
Cell L31: =L30*$AC$3                    (Year 2 Fringe = Year 2 DL × Fringe Rate)

Year 3:
Cell O31: =O30*$AC$3                    (Year 3 Fringe = Year 3 DL × Fringe Rate)
```

**Key Points:**
- `$AC$3` is an **absolute reference** (dollar signs lock the cell)
- Even if you copy the formula down, it always points to AC3
- User can edit AC3 (change from 24.7% to 25%), and ALL fringe calculations update instantly

**What happens when user changes fringe rate:**

```
Before: AC3 = 0.247
  Year 1 DL = $585,000
  Year 1 Fringe = $585,000 × 0.247 = $144,495

User changes AC3 to 0.250 (25%)

After: AC3 = 0.250
  Year 1 DL = $585,000 (unchanged)
  Year 1 Fringe = $585,000 × 0.250 = $146,250 (auto-updated!)
```

### Subtotal Row Formulas

**Example Row 32 (Subtotal: DL + Fringe):**

```excel
Cell A32: "Subtotal (DL + Fringe)"      (Label)
Cell F32: =F30+F31                      (Total = DL + Fringe)

Year 1:
Cell I32: =I30+I31                      (Year 1 = DL + Fringe)

Year 2:
Cell L32: =L30+L31                      (Year 2 = DL + Fringe)

Year 3:
Cell O32: =O30+O31                      (Year 3 = DL + Fringe)
```

### Overhead Row Formula

**Example Row 33 (Overhead):**

```excel
Cell A33: "Overhead"                    (Label)
Cell F33: =F32*$AC$4                    (Total OH = Subtotal1 × OH Rate)

Year 1:
Cell I33: =I32*$AC$4                    (Year 1 OH = Subtotal1 × OH Rate)

Year 2:
Cell L33: =L32*$AC$4                    (Year 2 OH = Subtotal1 × OH Rate)

Year 3:
Cell O33: =O32*$AC$4                    (Year 3 OH = Subtotal1 × OH Rate)
```

**CRITICAL:** Overhead is applied to **Subtotal 1** (DL + Fringe), not just DL!

### Second Subtotal Row Formula

**Example Row 34 (Subtotal: DL + Fringe + OH):**

```excel
Cell A34: "Subtotal (DL + Fringe + OH)" (Label)
Cell F34: =F32+F33                      (Total = Subtotal1 + OH)

Year 1:
Cell I34: =I32+I33                      (Year 1 = Subtotal1 + OH)

Year 2:
Cell L34: =L32+L33                      (Year 2 = Subtotal1 + OH)

Year 3:
Cell O34: =O32+O33                      (Year 3 = Subtotal1 + OH)
```

### G&A Row Formula

**Example Row 35 (G&A):**

```excel
Cell A35: "G&A"                         (Label)
Cell F35: =F34*$AC$5                    (Total G&A = Subtotal2 × G&A Rate)

Year 1:
Cell I35: =I34*$AC$5                    (Year 1 G&A = Subtotal2 × G&A Rate)

Year 2:
Cell L35: =L34*$AC$5                    (Year 2 G&A = Subtotal2 × G&A Rate)

Year 3:
Cell O35: =O34*$AC$5                    (Year 3 G&A = Subtotal2 × G&A Rate)
```

**CRITICAL:** G&A is applied to **Subtotal 2** (DL + Fringe + OH), not just DL!

### Total Prime Labor Row Formula

**Example Row 36 (Total Prime Labor Cost - FBLR):**

```excel
Cell A36: "Total Prime Labor Cost (FBLR)" (Label)
Cell F36: =F34+F35                      (Total = Subtotal2 + G&A)

Year 1:
Cell I36: =I34+I35                      (Year 1 = Subtotal2 + G&A)

Year 2:
Cell L36: =L34+L35                      (Year 2 = Subtotal2 + G&A)

Year 3:
Cell O36: =O34+O35                      (Year 3 = Subtotal2 + G&A)
```

**This is the fully burdened cost** (before Fee).

---

## Pass-Through Calculations

### What are Pass-Through Costs?

**Pass-through costs** = Prime contractor's costs for **managing subcontractors**.

**Scenario:** You (prime contractor) hire a subcontractor company to provide 5 software developers.

**Your costs:**
- **S&MH** (Subcontractor & Material Handling): Administrative overhead to manage the subcontractor (insurance, paperwork, oversight)
- **G&A Passthrough**: Your management costs to oversee subcontractor work

### S&MH (Subcontractor & Material Handling)

**What it is:** Cost to manage subcontractors

**Typical Rate:** 6.5% to 10% of subcontractor costs

**Formula:** `S&MH = Subcontractor Total × S&MH Rate`

**Example:**

```
Subcontractor Year 1 Cost: $500,000
S&MH Rate: 6.65%

S&MH = $500,000 × 0.0665 = $33,250
```

**What this covers:**
- Insurance for subcontractor work
- Paperwork and contract management
- Quality oversight and reviews
- Coordination meetings
- Risk management

**Excel Formula (Row 50, assuming subcontractor total is in row 48):**

```excel
Cell A50: "Handling"                    (Label - S&MH)
Cell F50: =F48*$AC$8                    (Total S&MH = Sub Total × S&MH Rate)

Year 1:
Cell I50: =I48*$AC$8                    (Year 1 S&MH = Sub Total × S&MH Rate)

Year 2:
Cell L50: =L48*$AC$8                    (Year 2 S&MH = Sub Total × S&MH Rate)

Year 3:
Cell O50: =O48*$AC$8                    (Year 3 S&MH = Sub Total × S&MH Rate)
```

Where `$AC$8` is the cell containing the S&MH rate (0.0665).

### G&A Passthrough

**What it is:** Your management overhead for overseeing subcontractor work

**Typical Rate:** 2% to 5% of subcontractor costs

**Formula:** `G&A Passthrough = Subcontractor Total × G&A Passthrough Rate`

**Example:**

```
Subcontractor Year 1 Cost: $500,000
G&A Passthrough Rate: 2.5%

G&A Passthrough = $500,000 × 0.025 = $12,500
```

**What this covers:**
- Your management team's time overseeing subcontractor
- Your accounting/finance tracking subcontractor invoices
- Your legal reviewing subcontractor agreements
- Your HR coordinating with subcontractor personnel

**Excel Formula (Row 51):**

```excel
Cell A51: "G&A"                         (Label)
Cell F51: =F48*$AC$9                    (Total G&A = Sub Total × G&A Pass Rate)

Year 1:
Cell I51: =I48*$AC$9                    (Year 1 G&A = Sub Total × G&A Pass Rate)

Year 2:
Cell L51: =L48*$AC$9                    (Year 2 G&A = Sub Total × G&A Pass Rate)

Year 3:
Cell O51: =O48*$AC$9                    (Year 3 G&A = Sub Total × G&A Pass Rate)
```

Where `$AC$9` is the cell containing the G&A Passthrough rate (0.025).

### Total Pass-Through

**Excel Formula (Row 54):**

```excel
Cell A54: "Total pass through (not including fee)" (Label)
Cell F54: =F50+F51+F52                  (Total = S&MH + G&A + Other)

Year 1:
Cell I54: =I50+I51+I52                  (Year 1 = S&MH + G&A + Other)
```

**Complete Example:**

```
Subcontractor Labor Cost: $500,000
  S&MH (6.65%):              $33,250
  G&A Passthrough (2.5%):    $12,500
  Other (if any):            $0
  ─────────────────────────
  Total Pass-Through:        $45,750

Total Subcontractor Cost = $500,000 + $45,750 = $545,750
```

---

## Fee Calculations

### What is Fee?

**Fee** = **Profit** your company makes on the contract

Government allows reasonable profit on:
- **Prime labor** (your employees)
- **Subcontractor labor** (subcontractor's employees)

**Typical Fee Rates:**
- **Prime Labor:** 7% to 10% (higher because you take more risk)
- **Subcontractor Labor:** 1% to 5% (lower because subcontractor takes the risk)

### Prime Contractor Fee (on Prime Labor)

**Formula:** `Prime Fee = Total Prime Labor × Prime Fee Rate`

**Example:**

```
Total Prime Labor (FBLR): $2,500,000
Prime Fee Rate: 8%

Prime Fee = $2,500,000 × 0.08 = $200,000
```

**What this represents:**
- Your company's profit for delivering direct labor
- Includes risk premium (you're liable if employees underperform)
- Covers opportunity cost (could do other contracts)

**Excel Formula (Row 65):**

```excel
Cell A65: "Prime Contractor Fee for Prime Contractor Labor" (Label)
Cell F65: =F36*$AC$6                    (Total Fee = Prime Labor × Fee Rate)

Year 1:
Cell I65: =I36*$AC$6                    (Year 1 Fee = Year 1 Labor × Fee Rate)

Year 2:
Cell L65: =L36*$AC$6                    (Year 2 Fee = Year 2 Labor × Fee Rate)

Year 3:
Cell O65: =O36*$AC$6                    (Year 3 Fee = Year 3 Labor × Fee Rate)
```

Where:
- `F36` = Total Prime Labor Cost (FBLR)
- `$AC$6` = Prime Fee Rate (0.08 for 8%)

### Prime Contractor Fee (on Subcontractor Labor)

**Formula:** `Sub Fee = Total Subcontractor Cost × Sub Fee Rate`

**Example:**

```
Total Subcontractor Cost: $545,750 (including pass-through)
Sub Fee Rate: 1.26%

Sub Fee = $545,750 × 0.0126 = $6,876
```

**Why it's lower:**
- Subcontractor takes performance risk (not you)
- You're just managing/coordinating
- Government limits profit on pass-through work

**Excel Formula (Row 66):**

```excel
Cell A66: "Prime Contractor Fee for Subcontractor Labor *" (Label)
Cell F66: =F55*$AC$7                    (Total Fee = Sub Total × Sub Fee Rate)

Year 1:
Cell I66: =I55*$AC$7                    (Year 1 Fee = Year 1 Sub × Sub Fee Rate)

Year 2:
Cell L66: =L55*$AC$7                    (Year 2 Fee = Year 2 Sub × Sub Fee Rate)

Year 3:
Cell O66: =O55*$AC$7                    (Year 3 Fee = Year 3 Sub × Sub Fee Rate)
```

Where:
- `F55` = Total Subcontractor Cost (including pass-through)
- `$AC$7` = Sub Fee Rate (0.0126 for 1.26%)

### Total Fee

**Excel Formula (Row 67):**

```excel
Cell A67: "Total Fee (for Prime and Subcontractor Labor)" (Label)
Cell F67: =F65+F66                      (Total = Prime Fee + Sub Fee)

Year 1:
Cell I67: =I65+I66                      (Year 1 = Prime Fee + Sub Fee)
```

**Complete Example:**

```
Prime Labor Cost:        $2,500,000
  Prime Fee (8%):        $200,000

Sub Labor Cost:          $545,750
  Sub Fee (1.26%):       $6,876
  ─────────────────────
Total Fee:               $206,876

Grand Total:             $3,252,626
```

---

## ODC Calculations

### What are ODCs?

**ODC** = **Other Direct Costs** (not labor)

**Common ODCs:**
- **Travel:** Flights, hotels, meals for on-site work
- **Materials:** Office supplies, software licenses
- **Equipment:** Laptops, monitors, specialized tools
- **Training:** Certifications, courses
- **Facilities:** Conference room rentals

### ODC Types: Fixed vs. Escalating

**Fixed ODC:** Same amount every year

```
Example: Annual software license
Year 1: $10,000
Year 2: $10,000
Year 3: $10,000
```

**Escalating ODC:** Increases with inflation each year

```
Example: Travel costs
Year 1: $15,000
Year 2: $15,000 × 1.03 = $15,450
Year 3: $15,450 × 1.03 = $15,914
```

### G&A Adder on ODCs

**What it is:** Management overhead to handle ODCs

**Typical Rate:** 22% to 24% of ODC base cost

**Formula:** `ODC Total = ODC Base + (ODC Base × G&A Adder)`

**Example:**

```
Travel Base Cost: $15,000
G&A Adder Rate: 22.12%

G&A Adder = $15,000 × 0.2212 = $3,318
ODC Total = $15,000 + $3,318 = $18,318
```

**What G&A Adder covers:**
- Accounting team processing travel expenses
- Management approving travel requests
- Finance tracking ODC budgets
- Procurement ordering materials/equipment

### Fixed ODC Example (No Escalation)

**Scenario:** Annual software licenses (doesn't escalate)

```
Base Amount: $10,000
G&A Adder: 22.12%
Escalate: No

Year 1:
  Base: $10,000
  G&A Adder: $10,000 × 0.2212 = $2,212
  Total: $12,212

Year 2:
  Base: $10,000 (same)
  G&A Adder: $10,000 × 0.2212 = $2,212
  Total: $12,212 (same as Year 1)

Year 3:
  Base: $10,000 (same)
  G&A Adder: $10,000 × 0.2212 = $2,212
  Total: $12,212 (same as Year 1)
```

**Excel Formula (Row 75, assuming this is Software Licenses ODC):**

```excel
Cell A75: "Software Licenses"           (Description)
Cell F75: =12212*3                      (Total = $12,212 × 3 years = $36,636)

Year 1:
Cell I75: 12212                         (Year 1 total - hardcoded value)

Year 2:
Cell L75: 12212                         (Year 2 total - same as Year 1)

Year 3:
Cell O75: 12212                         (Year 3 total - same as Year 1)
```

**Why hardcoded?** Fixed ODCs don't change, so values are pre-calculated.

### Escalating ODC Example (With Inflation)

**Scenario:** Travel costs (escalates with inflation)

```
Base Amount Year 1: $15,000
G&A Adder: 22.12%
Escalate: Yes
Escalation Rates: 3% (Year 1→2), 3% (Year 2→3)

Year 1:
  Base: $15,000
  G&A Adder: $15,000 × 0.2212 = $3,318
  Total: $18,318

Year 2:
  Base: $15,000 × 1.03 = $15,450
  G&A Adder: $15,450 × 0.2212 = $3,417
  Total: $18,867

Year 3:
  Base: $15,450 × 1.03 = $15,914
  G&A Adder: $15,914 × 0.2212 = $3,520
  Total: $19,434
```

**Python Calculation Logic:**

```python
def calculate_odc_years(base_amount, ga_adder_rate, escalation_rates, total_years, escalate=True):
    """
    Calculate ODC costs for all years

    Args:
        base_amount: Year 1 base cost (e.g., $15,000)
        ga_adder_rate: G&A adder rate (e.g., 0.2212)
        escalation_rates: {"1_to_2": 0.03, "2_to_3": 0.03, ...}
        total_years: Number of contract years
        escalate: Whether to apply escalation

    Returns:
        Dictionary with year-by-year breakdown
    """
    results = {}
    current_base = base_amount

    for year in range(1, total_years + 1):
        # Calculate G&A adder
        ga_adder = current_base * ga_adder_rate
        total = current_base + ga_adder

        results[f'year_{year}'] = {
            'base': current_base,
            'ga_adder': ga_adder,
            'total': total
        }

        # Escalate for next year
        if escalate and year < total_years:
            escalation_key = f"{year}_to_{year+1}"
            escalation_rate = escalation_rates.get(escalation_key, 0.03)
            current_base = current_base * (1 + escalation_rate)

    return results

# Example usage
results = calculate_odc_years(
    base_amount=15000,
    ga_adder_rate=0.2212,
    escalation_rates={"1_to_2": 0.03, "2_to_3": 0.03},
    total_years=3,
    escalate=True
)

print(results)
# {
#   'year_1': {'base': 15000, 'ga_adder': 3318, 'total': 18318},
#   'year_2': {'base': 15450, 'ga_adder': 3417, 'total': 18867},
#   'year_3': {'base': 15914, 'ga_adder': 3520, 'total': 19434}
# }
```

**Excel Formula (Row 76, assuming this is Travel ODC):**

```excel
Cell A76: "Travel"                      (Description)
Cell F76: =SUM(I76, L76, O76)           (Total = sum of all years)

Year 1:
Cell I76: 18318                         (Year 1 - calculated by backend)

Year 2:
Cell L76: 18867                         (Year 2 - escalated)

Year 3:
Cell O76: 19434                         (Year 3 - escalated)
```

### Total ODCs Row

**Excel Formula (Row 80):**

```excel
Cell A80: "Total Other Direct Costs"   (Label)
Cell F80: =SUM(F75:F79)                 (Total = sum of all ODC rows)

Year 1:
Cell I80: =SUM(I75:I79)                 (Year 1 total ODCs)

Year 2:
Cell L80: =SUM(L75:L79)                 (Year 2 total ODCs)

Year 3:
Cell O80: =SUM(O75:O79)                 (Year 3 total ODCs)
```

---

## Averaged FBLR

### What is Averaged FBLR?

**Problem:** When hours vary by year, what's the "average" hourly rate across the entire contract?

**Scenario:**

```
Program Manager:
- Year 1: 1,880 hours at $107.02/hour
- Year 2: 50 hours at $109.93/hour
- Year 3: 1,880 hours at $113.22/hour
```

**Question:** What's the average FBLR across all 3 years?

**Wrong Answer:** Just average the rates

```
WRONG: ($107.02 + $109.93 + $113.22) ÷ 3 = $110.06/hour
```

**Why it's wrong:** Year 2 only has 50 hours! It shouldn't count equally with the other years.

**Correct Answer:** Weighted average based on hours worked

### Correct Averaged FBLR Calculation

**Formula:**

```
Averaged FBLR = Total Salary Earned ÷ Total Hours Worked
```

**Step-by-Step:**

#### Step 1: Calculate Salary Earned Each Year

**Year 1:**
```
Base Wage: $115,000
Hours: 1,880
Standard FTE Hours: 1,880

Hourly Rate = $115,000 ÷ 1,880 = $61.17/hour
Salary Earned = $61.17 × 1,880 = $115,000
```

**Year 2:**
```
Escalated Wage: $115,000 × 1.0272 = $118,128
Hours: 50
Standard FTE Hours: 1,880

Hourly Rate = $118,128 ÷ 1,880 = $62.83/hour
Salary Earned = $62.83 × 50 = $3,142
```

**Year 3:**
```
Escalated Wage: $118,128 × 1.0299 = $121,660
Hours: 1,880
Standard FTE Hours: 1,880

Hourly Rate = $121,660 ÷ 1,880 = $64.71/hour
Salary Earned = $64.71 × 1,880 = $121,655
```

#### Step 2: Sum Totals

```
Total Salary Earned = $115,000 + $3,142 + $121,655 = $239,797
Total Hours Worked = 1,880 + 50 + 1,880 = 3,810
```

#### Step 3: Calculate Average DL Rate

```
Average DL Rate = $239,797 ÷ 3,810 = $62.94/hour
```

**Key Insight:** The average ($62.94/hour) is closer to Year 1 ($61.17/hour) than Year 3 ($64.71/hour) because Year 2 only had 50 hours.

#### Step 4: Apply FBLR Cascade to Average

Now apply fringe, OH, G&A, and Fee to the average DL rate:

```
Average DL = $62.94/hour

Fringe = $62.94 × 0.247 = $15.55
Subtotal 1 = $78.49

OH = $78.49 × 0.0711 = $5.58
Subtotal 2 = $84.07

G&A = $84.07 × 0.2243 = $18.86
Subtotal 3 = $102.93

Fee = $102.93 × 0.07 = $7.21

Average FBLR = $110.14/hour
```

**Final Answer:** Average FBLR = $110.14/hour

### Python Implementation

```python
def calculate_averaged_fblr(
    base_wage,
    hours_per_year,
    escalation_rates,
    fringe_rate,
    oh_rate,
    ga_rate,
    fee_rate,
    standard_fte_hours,
    total_years
):
    """
    Calculate averaged FBLR across all contract years

    Args:
        base_wage: Year 1 annual salary (e.g., $115,000)
        hours_per_year: {"1": 1880, "2": 50, "3": 1880}
        escalation_rates: {"1_to_2": 0.0272, "2_to_3": 0.0299}
        fringe_rate: 0.247
        oh_rate: 0.0711
        ga_rate: 0.2243
        fee_rate: 0.07
        standard_fte_hours: 1880 (full-time baseline)
        total_years: 3

    Returns:
        Dictionary with averaged rates breakdown
    """
    total_salary = 0
    total_hours = 0
    current_wage = base_wage

    # Step 1: Calculate total salary and total hours
    for year in range(1, total_years + 1):
        # Get hours for this year
        hours = hours_per_year.get(str(year), 0)

        # Calculate hourly rate for this year
        hourly_rate = current_wage / standard_fte_hours

        # Calculate salary earned this year
        salary_earned = hourly_rate * hours

        total_salary += salary_earned
        total_hours += hours

        # Escalate wage for next year
        if year < total_years:
            escalation_key = f"{year}_to_{year+1}"
            escalation = escalation_rates.get(escalation_key, 0.03)
            current_wage = current_wage * (1 + escalation)

    # Step 2: Calculate average DL rate
    if total_hours == 0:
        return {'dl_rate': 0, 'fringe': 0, 'oh': 0, 'ga': 0, 'fee': 0, 'fblr': 0}

    avg_dl_rate = total_salary / total_hours

    # Step 3: Apply FBLR cascade
    fringe = avg_dl_rate * fringe_rate
    subtotal_1 = avg_dl_rate + fringe

    oh = subtotal_1 * oh_rate
    subtotal_2 = subtotal_1 + oh

    ga = subtotal_2 * ga_rate
    subtotal_3 = subtotal_2 + ga

    fee = subtotal_3 * fee_rate

    fblr = subtotal_3 + fee

    return {
        'dl_rate': round(avg_dl_rate, 2),
        'fringe': round(fringe, 2),
        'oh': round(oh, 2),
        'ga': round(ga, 2),
        'fee': round(fee, 2),
        'fblr': round(fblr, 2)
    }

# Example usage
result = calculate_averaged_fblr(
    base_wage=115000,
    hours_per_year={"1": 1880, "2": 50, "3": 1880},
    escalation_rates={"1_to_2": 0.0272, "2_to_3": 0.0299},
    fringe_rate=0.247,
    oh_rate=0.0711,
    ga_rate=0.2243,
    fee_rate=0.07,
    standard_fte_hours=1880,
    total_years=3
)

print(result)
# {
#   'dl_rate': 62.94,
#   'fringe': 15.55,
#   'oh': 5.58,
#   'ga': 18.86,
#   'fee': 7.21,
#   'fblr': 110.14
# }
```

### Where Averaged FBLR Appears in Excel

**Location:** Far-right columns (after all year columns)

**Example (assuming Year columns end at column O):**

```excel
Column P: "Averaged FBLR" (header - merged across 6 columns)

Row 8 headers:
Cell P8: "DL Rate ($/hr)"
Cell Q8: "Fringe ($/hr)"
Cell R8: "OH ($/hr)"
Cell S8: "G&A ($/hr)"
Cell T8: "Fee ($/hr)"
Cell U8: "FBLR ($/hr)"

Row 11 (Program Manager):
Cell P11: $62.94                        (Averaged DL Rate)
Cell Q11: $15.55                        (Averaged Fringe)
Cell R11: $5.58                         (Averaged OH)
Cell S11: $18.86                        (Averaged G&A)
Cell T11: $7.21                         (Averaged Fee)
Cell U11: $110.14                       (Averaged FBLR)
```

**These values are:**
- **Read-only** (calculated by backend, not editable in Excel)
- **For reference** (helps understand average cost per hour)
- **Useful for budget planning** (average cost across varying hours)

---

## Subcontractor Rate Table

### What is the Subcontractor Rate Table?

**Purpose:** Shows how subcontractor rates are **marked up** by prime contractor.

**Location:** Sheet 2 of Excel file (separate tab)

**What it does:** Demonstrates forward and backward calculations for subcontractor Fee and S&MH markup.

### The Problem

**Scenario:**

```
Subcontractor gives you a rate: $85/hour for a Software Developer

Question 1 (Forward):
  After you add your Fee (1.26%) and S&MH (6.65%), what do you charge the government?

Question 2 (Backward):
  If government wants to pay $100/hour max, what's the base rate you can pay subcontractor?
```

### Forward Calculation (Add Fee and S&MH)

**Step-by-Step:**

#### Step 1: Add Prime Contractor Fee

```
Base Rate (from subcontractor): $85.00/hour
Prime Contractor Fee Rate: 1.26%

Fee Amount = $85.00 × 0.0126 = $1.07/hour
Rate after Fee = $85.00 + $1.07 = $86.07/hour
```

#### Step 2: Add S&MH

```
Rate after Fee: $86.07/hour
S&MH Rate: 6.65%

S&MH Amount = $86.07 × 0.0665 = $5.72/hour
Final Billable Rate = $86.07 + $5.72 = $91.79/hour
```

**Result:** You charge government $91.79/hour

**Excel Formulas (Sheet 2, Rows 3-4):**

```excel
Row 2: Headers
Cell C2: "Base Rate"
Cell D2: "Markup %"
Cell E2: "Markup $"
Cell F2: "Total"

Row 3: FEE Forward
Cell B3: "FEE"
Cell C3: 85.00                          (Base rate input)
Cell D3: 0.0126                         (Fee rate 1.26%)
Cell E3: =C3*D3                         (Fee $ = $85 × 0.0126 = $1.07)
Cell F3: =C3+E3                         (Total = $85 + $1.07 = $86.07)

Row 4: S&MH Forward
Cell B4: "S&MH"
Cell C4: =F3                            (Start from previous total $86.07)
Cell D4: 0.0665                         (S&MH rate 6.65%)
Cell E4: =C4*D4                         (S&MH $ = $86.07 × 0.0665 = $5.72)
Cell F4: =C4+E4                         (Final = $86.07 + $5.72 = $91.79)
```

### Backward Calculation (Remove S&MH and Fee)

**Purpose:** Work backwards from final rate to find base rate.

**Step-by-Step:**

#### Step 1: Remove S&MH

**Formula for removing markup:**

```
When you add markup:  Final = Base × (1 + Rate)
When you remove markup:  Base = Final ÷ (1 + Rate)

Alternative formula:  Markup Amount = Final × Rate ÷ (1 + Rate)
                     Base = Final - Markup Amount
```

**Calculation:**

```
Final Rate (from forward): $91.79/hour
S&MH Rate: 6.65%

S&MH Amount = $91.79 × 0.0665 ÷ (1 + 0.0665)
            = $91.79 × 0.0665 ÷ 1.0665
            = $6.10 ÷ 1.0665
            = $5.72

Rate before S&MH = $91.79 - $5.72 = $86.07/hour
```

**Why divide by (1 + Rate)?**

```
Forward:  Start with $86.07, add 6.65% → $91.79
Backward: Start with $91.79, remove 6.65% → need to find $86.07

The 6.65% in forward is applied to $86.07 (the base)
The 6.65% in backward must be calculated relative to $91.79 (the total)

So: S&MH Amount = Total × Rate ÷ (1 + Rate)
```

#### Step 2: Remove Fee

```
Rate before S&MH: $86.07/hour
Fee Rate: 1.26%

Fee Amount = $86.07 × 0.0126 ÷ (1 + 0.0126)
           = $86.07 × 0.0126 ÷ 1.0126
           = $1.08 ÷ 1.0126
           = $1.07

Base Rate = $86.07 - $1.07 = $85.00/hour
```

**Result:** Base rate is $85.00/hour (matches our starting point!)

**Excel Formulas (Sheet 2, Rows 7-8):**

```excel
Row 7: S&MH Backward
Cell B7: "S&MH"
Cell C7: =F4                            (Start from final $91.79)
Cell D7: 0.0665                         (S&MH rate 6.65%)
Cell E7: =C7*D7/(1+D7)                  (Reverse S&MH = $91.79 × 0.0665 ÷ 1.0665)
Cell F7: =C7-E7                         (Total = $91.79 - $5.72 = $86.07)

Row 8: FEE Backward
Cell B8: "FEE"
Cell C8: =F7                            (Start from previous $86.07)
Cell D8: 0.0126                         (Fee rate 1.26%)
Cell E8: =C8*D8/(1+D8)                  (Reverse Fee = $86.07 × 0.0126 ÷ 1.0126)
Cell F8: =C8-E8                         (Base = $86.07 - $1.07 = $85.00)
```

### Labor Category Rate Table

**Purpose:** Apply forward/backward calculations to all subcontractor labor categories.

**Location:** Sheet 2, starting row 4, columns H-O

**Structure:**

```excel
Row 3: Headers
Cell H3: "Labor Category"
Cell I3: "Base FBLR"
Cell J3: "After removing FEE"
Cell K3: "After removing S&MH"  (This is your target pay rate)
Cell L3: "Target Rate"
Cell M3: "After adding S&MH"
Cell N3: "After adding FEE"
Cell O3: "Diff Check"

Row 4: Software Developer (example)
Cell H4: "Software Developer"
Cell I4: 100.00                         (Subcontractor's quoted rate)
Cell J4: =ROUND(I4-(I4*$J$2),0)         (Remove Fee: $100 - ($100 × 1.26% ÷ 1.0126) = $98.75)
Cell K4: =ROUND(J4-(J4*$K$2),0)         (Remove S&MH: $98.75 - ($98.75 × 6.65% ÷ 1.0665) = $92.60)
Cell L4: =ROUND(K4,0)                   (Target rate = $92.60)
Cell M4: =ROUND(L4+(L4*$M$2),0)         (Add S&MH: $92.60 + ($92.60 × 6.65%) = $98.76)
Cell N4: =ROUND(M4+(M4*$N$2),0)         (Add Fee: $98.76 + ($98.76 × 1.26%) = $100.00)
Cell O4: =I4-N4                         (Diff check: $100 - $100 = $0)
```

**Rate Reference Cells:**
- `$J$2` = Fee Rate (0.0126)
- `$K$2` = S&MH Rate (0.0665)
- `$M$2` = S&MH Rate (0.0665) for forward calc
- `$N$2` = Fee Rate (0.0126) for forward calc

**Why ROUND()?** Rounding to nearest dollar to match government accounting practices.

**What is "Diff Check"?**
- Subtracts forward result from starting rate
- Should be $0 or very close (due to rounding)
- If Diff Check is large ($5+), there's an error in the formulas

---

## Dynamic Year Columns

### The Challenge

**Problem:** Government contracts vary in length:
- Some are 3 years (1 base + 2 option years)
- Some are 5 years (1 base + 4 option years)
- Some are 10 years (1 base + 9 option years)

**Solution:** Dynamically generate year columns based on contract length.

### Column Structure

**Pattern:** Each year gets **3 columns**

```
Year 1: Columns G, H, I
  G = Rate
  H = Hours
  I = Amount

Year 2: Columns J, K, L
  J = Rate
  K = Hours
  L = Amount

Year 3: Columns M, N, O
  M = Rate
  N = Hours
  O = Amount

And so on...
```

### Column Offset Formula

**Formula:**

```python
def calculate_column_offset(year_num):
    """
    Calculate Excel column number for a given year

    Args:
        year_num: Year number (1, 2, 3, ...)

    Returns:
        Column number for Rate column (1-indexed)

    Example:
        Year 1 → Column 7 (G)
        Year 2 → Column 10 (J)
        Year 3 → Column 13 (M)
    """
    return 7 + ((year_num - 1) * 3)

# Examples
print(calculate_column_offset(1))  # 7 (Column G)
print(calculate_column_offset(2))  # 10 (Column J)
print(calculate_column_offset(5))  # 19 (Column S)
```

**Breakdown:**

```
Year 1:
  Start at column 7 (G)
  7 + ((1 - 1) × 3) = 7 + 0 = 7

Year 2:
  Skip 3 columns from Year 1
  7 + ((2 - 1) × 3) = 7 + 3 = 10

Year 5:
  Skip 4 sets of 3 columns
  7 + ((5 - 1) × 3) = 7 + 12 = 19
```

### Year Headers

**Row 7:** Year names

```excel
For 5-year contract:
Cell G7: "Base Period"
Cell J7: "Option Year 1"
Cell M7: "Option Year 2"
Cell P7: "Option Year 3"
Cell S7: "Option Year 4"
```

**Python code to generate headers:**

```python
def generate_year_headers(base_years, option_years):
    """
    Generate year column headers

    Args:
        base_years: Number of base years (usually 1)
        option_years: Number of option years (e.g., 4)

    Returns:
        List of header strings
    """
    headers = []
    total_years = base_years + option_years

    # Base period(s)
    for i in range(base_years):
        if base_years == 1:
            headers.append("Base Period")
        else:
            headers.append(f"Base Period {i+1}")

    # Option years
    for i in range(option_years):
        headers.append(f"Option Year {i+1}")

    return headers

# Example
headers = generate_year_headers(base_years=1, option_years=4)
print(headers)
# ["Base Period", "Option Year 1", "Option Year 2", "Option Year 3", "Option Year 4"]
```

### Partial Year Headers

**When year has non-standard months:**

```python
def generate_year_header_with_months(year_num, base_years, months):
    """
    Generate year header with month notation

    Args:
        year_num: Year number (1, 2, 3, ...)
        base_years: Number of base years
        months: Number of months for this year

    Returns:
        Header string
    """
    if year_num <= base_years:
        base_text = "Base Period" if base_years == 1 else f"Base Period {year_num}"
    else:
        option_num = year_num - base_years
        base_text = f"Option Year {option_num}"

    if months != 12:
        return f"{base_text} ({months} mo)"
    else:
        return base_text

# Examples
print(generate_year_header_with_months(1, 1, 12))  # "Base Period"
print(generate_year_header_with_months(2, 1, 8))   # "Option Year 1 (8 mo)"
print(generate_year_header_with_months(3, 1, 10))  # "Option Year 2 (10 mo)"
```

### Sub-Headers (Row 8)

**Pattern:** Rate, Hours, Amount for each year

```excel
Row 8:
Cell G8: "Rate"
Cell H8: "Hours"
Cell I8: "Amount"
Cell J8: "Rate"
Cell K8: "Hours"
Cell L8: "Amount"
... (repeat for each year)
```

**Python code:**

```python
def write_subheaders(worksheet, total_years):
    """
    Write Rate/Hours/Amount subheaders for all years

    Args:
        worksheet: Excel worksheet object
        total_years: Number of contract years
    """
    for year in range(1, total_years + 1):
        col_offset = calculate_column_offset(year)

        worksheet.cell(8, col_offset, "Rate")      # Rate column
        worksheet.cell(8, col_offset + 1, "Hours")  # Hours column
        worksheet.cell(8, col_offset + 2, "Amount") # Amount column
```

---

## Summary

This document covered:

✅ **FBLR Cascade** - How to calculate fully burdened labor rates step-by-step
✅ **Escalation** - Year-over-year wage increases with compounding
✅ **Excel Formulas** - Actual cell references and calculation logic
✅ **Pass-Through** - S&MH and G&A costs for managing subcontractors
✅ **Fee Calculations** - Profit on prime and subcontractor labor
✅ **ODC Calculations** - Fixed and escalating other direct costs
✅ **Averaged FBLR** - Weighted average rates across varying hours
✅ **Subcontractor Rate Table** - Forward and backward markup calculations
✅ **Dynamic Year Columns** - Flexible column generation for any contract length

All formulas work together to create accurate, government-compliant cost proposals with full transparency and traceability.
