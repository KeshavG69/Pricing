# Boss Requirements Explained - Simple Version

**Date:** 2025-11-21
**Source:** Email with 4 PriceIQ files

---

## 📁 Files Provided

1. **Staffing Plan from PriceIQ.xlsx** - Shows how hours vary per year for each person
2. **PriceIQ Cost Proposal.xlsx** - Shows the cost breakdown structure
3. **PriceIQ Personnel Qualifications.pdf** - Personnel details
4. **PriceIQ Proposal Guidance.pdf** - Instructions for proposals

---

## 🎯 What Your Boss Is Saying (In Simple Terms)

### Requirement 1: **Different Hours Per Annum** ✅

**What it means:**
Each position can work different hours each year. For example:
- **Program Manager**: Works 1880 hours in Year 1, 1880 in Year 2, 0 in Year 3 (not working), 1880 in Year 4, 1880 in Year 5

**Status:** ✅ **Already done!** We support `hours_per_year` dict: `{"1": 1880, "2": 1880, "3": 0, "4": 1880, "5": 1880}`

---

### Requirement 2: **Escalation Rate Provided By Year** ✅

**What it means:**
Wages increase year-over-year, but the increase rate is different each year:
- Year 1 → Year 2: **2.72%** increase
- Year 2 → Year 3: **2.99%** increase
- Year 3 → Year 4: **2.63%** increase
- Year 4 → Year 5: **3.40%** increase

**Status:** ✅ **Already done!** We support `escalation_rates` dict with different rates per year.

---

### Requirement 3: **Subcontractor Max Pass-Through Rate (8% Cap)** ⚠️

**What it means:**
Government contracts sometimes have a **maximum markup** you can charge on subcontractor costs.

**Example scenario:**
- Subcontractor's rate: $100/hr
- You want to add:
  - **Fee (profit)**: 10% = $10
  - **M&H (Material & Handling)**: 6.65% = $6.65
  - **Total markup**: 16.65%

**BUT** the government says: "You can only charge 8% total on subcontractors!"

**The math:**
```
Max Pass-Through Rate = 8%
Your M&H Rate = 6.65%
Therefore, Fee you can charge = 8% - 6.65% = 1.35%
```

So instead of 10% fee, you can only charge **1.35% fee** to stay under the 8% cap.

**What we need to do:**
Add a question in the UI:
> ❓ "Is there a maximum pass-through rate requirement?
> (Some contracts like SeaPort-NxG limit this to 8%)"
>
> If YES:
>   - Enter max rate: __8%__
>   - System calculates: Fee = Max Rate - M&H Rate

**Status:** ⚠️ **Need to implement** - Add this logic to Calculator and UI

---

### Requirement 4: **Fixed ODC and Travel Cost** ⚠️

**What it means:**
Sometimes ODCs (travel, materials) have **fixed costs** that don't increase each year.

**Example:**
- **Travel**: $50,000 in Year 1 → **doesn't escalate** → stays $50,000 all years
- **Equipment Rental**: $20,000 in Year 1 → **escalates** with inflation → becomes $20,544 in Year 2

**Current structure:**
We already have an `escalate: true/false` flag in our MongoDB schema!

```json
"odcs": [
  {
    "description": "Travel",
    "amount_year_1": 50000.00,
    "escalate": false   // ← Fixed, doesn't escalate
  },
  {
    "description": "Equipment",
    "amount_year_1": 20000.00,
    "escalate": true    // ← Escalates year-over-year
  }
]
```

**Status:** ⚠️ **Need to implement** - Calculator needs to handle `escalate` flag in ODC calculations

---

### Requirement 5: **Change Fee Rate Per RFP (Especially FFP Bids)** ⚠️

**What it means:**
Different types of contracts have different fee structures:

- **CPFF (Cost Plus Fixed Fee)**: Government pays costs + fixed profit (e.g., 8%)
- **FFP (Firm Fixed Price)**: You quote a total price, you keep any savings (higher risk, higher fee like 12%)

**What we need:**
Make fee rates **configurable per project**, not hardcoded.

**Current approach:**
```json
"rates": {
  "prime_fee": 0.08,    // 8% - should be user input per project
  "sub_fee": 0.0126     // 1.26% - should be user input per project
}
```

**Status:** ✅ **Already in design!** We store fee rates per project. Just need UI inputs.

---

### Requirement 6: **Select Wage Percentile - Critical for Narrative** ⚠️

**What it means:**
For each position, we get 5 wage options from BLS data:
- 10th percentile: $95,000
- 25th percentile: $135,000
- **50th percentile (median)**: $169,000 ← Most common choice
- 75th percentile: $210,000
- 90th percentile: $265,000

**Why it matters for narrative:**
The proposal narrative needs to justify why you picked that wage:
- "We selected the **50th percentile** ($169,000) for the Senior Program Manager position because it reflects the **average market rate** for this level of experience in Virginia."
- vs
- "We selected the **75th percentile** ($210,000) because this is a **highly specialized role** requiring extensive security clearance."

**What we need:**
1. **UI**: Dropdown or slider to select percentile per position
2. **Store selection**: Save which percentile was chosen
3. **Display in narrative**: Show "Selected: 50th percentile ($169,000)"

**Current structure:**
```json
"positions": [
  {
    "labor_category": "Program Manager, Senior",
    "wages": {
      "10th": 95000,
      "25th": 135000,
      "50th": 169000,
      "75th": 210000,
      "90th": 265000
    },
    "selected_wage": 169000,        // ← User picks this
    "selected_percentile": "50th"   // ← Store which one
  }
]
```

**Status:** ✅ **Already in design!** Just need UI to let user pick.

---

## 📊 Excel File Structure Analysis

### Cost Proposal Structure (What They Want):

```
SOLICITATION NO. N0017825R3013 - ATTACHMENT J.8
COST PROPOSAL SPREADSHEET

                                    Total       Base    Option  Option  Option  Option
                                   All Years   Year     Year 1  Year 2  Year 3  Year 4
Cost Elements          Category    Hours Amt   Rate Hours Amt  Rate... (repeat)

Prime Contractor Labor Cost
  Prime Direct Labor
    Employee Name 1    Category1   XXX   $XX   $X/hr  XXX  $XX  $X/hr...
    Employee Name 2    Category2   XXX   $XX   $X/hr  XXX  $XX  $X/hr...
  Total Direct Labor Cost           XXX   $XX

  Prime Indirect Labor Cost
    Overhead                              $XX
    Fringe Benefits                       $XX
    G&A                                   $XX
  Total Indirect Labor Cost               $XX

  Total Direct and Indirect              $XX
  COM (Cost of Money)                    $XX
Total Prime Contractor Labor Cost        $XX

Subcontractor Labor Cost
  Subcontractor proposed cost and fee
    Subcontractor 1                      $XX
    Subcontractor 2                      $XX
  Total proposed subcontractor           $XX

  Prime contractor pass through (not including fee)
    Handling                             $XX
    G&A                                  $XX
    Other                                $XX
  Total pass through                     $XX

Total Subcontractor Cost                 $XX

TOTAL LABOR COST (Prime + Sub)           $XX

Fixed Fee
  Prime Contractor Fee for Prime Labor   $XX   (8%)
  Prime Contractor Fee for Sub Labor *   $XX   (1.26% or 8% cap)
Total Fee                                $XX

TOTAL LABOR COST PLUS FIXED FEE          $XX

Other Direct Costs
  ODCs                                   $XX
  Any adders to ODCs (G&A cost only)     $XX
Total ODCs                               $XX

TOTAL COST                               $XXXXX
```

### Staffing Plan Structure (Employee Details):

```
Solicitation # N0017825R3013 - Attachment J.7 - Staffing Plan

NAME | EMPLOYER | LABOR CATEGORY | ... | LABOR HOURS PROPOSED                      | EXPERIENCE | ...
                                           Base Yr | Opt Yr 1 | Opt Yr 2 | Opt Yr 3 | Opt Yr 4

Employee 1 | Prime    | Program Manager | ...| 1880    | 1880     | 0        | 1880     | 1880      | 15 years | ...
Employee 2 | SubK     | Software Dev    | ...| 2080    | 2080     | 2080     | 2080     | 2080      | 10 years | ...
```

---

## 🔧 What We Need to Implement

### High Priority:

1. **Subcontractor Max Pass-Through Rate Logic**
   - Add "max_passthrough_rate" field (e.g., 0.08 for 8%)
   - If set, calculate: `fee = max_passthrough_rate - smh_rate`
   - Add validation: if `fee < 0`, show error

2. **Fixed vs Escalating ODCs**
   - Update `Calculator.calculate_odc_years()` to respect `escalate` flag
   - If `escalate=false`, use `amount_year_1` for all years
   - If `escalate=true`, apply escalation rates

3. **Wage Percentile Selection UI**
   - Dropdown per position: "10th, 25th, 50th, 75th, 90th"
   - Default to 50th percentile
   - Store selection with reason (for narrative)

### Medium Priority:

4. **Fee Rate Per Project**
   - UI inputs for prime_fee and sub_fee per project
   - Different defaults for CPFF (8%) vs FFP (12%)

5. **Contract Type Selection**
   - Dropdown: CPFF, FFP, T&M, etc.
   - Auto-fill common rate templates

---

## 💡 Boss's Key Point

> **"These are the nuances that we must provide as questions and incorporate into the design and implementation."**

**Translation:** Don't hardcode values. Ask the user questions in the UI:
- ❓ "Is there a max pass-through rate requirement?"
- ❓ "Should this ODC escalate year-over-year?"
- ❓ "What wage percentile do you want for this position?"
- ❓ "What contract type is this? (CPFF/FFP/T&M)"

---

## 📝 Summary for Implementation

### Already Done ✅:
- ✅ Different hours per year per position
- ✅ Escalation rates per year
- ✅ Fee rates stored per project
- ✅ ODC structure with escalate flag

### Need to Build ⚠️:
1. ⚠️ **Max pass-through rate logic** (8% cap calculation)
2. ⚠️ **Fixed vs escalating ODC calculation**
3. ⚠️ **Wage percentile selection** (UI + storage)
4. ⚠️ **Contract type templates** (CPFF/FFP/T&M presets)
5. ⚠️ **UI questions/prompts** for all configurable values

### Excel Generation Must Include:
- Multi-year columns (Base + 4 Option Years)
- Position rows with rates per year
- Prime labor section with wrap rates
- Subcontractor section with markup
- ODC section (fixed vs escalating)
- Fee section (8% cap logic if applicable)
- Year totals and grand total

---

## 🎯 Next Steps

1. **Review this document** - Make sure you understand each requirement
2. **Update Calculator** - Add max_passthrough_rate and fixed ODC logic
3. **Update MongoDB Schema** - Add missing fields (max_passthrough_rate, contract_type)
4. **Plan UI Questions** - List all questions we need to ask users
5. **Build Excel Generator** - Generate file matching PriceIQ format
6. **Test with real data** - Use PriceIQ files as test cases

---

**Questions?** Let me know what's unclear and I'll explain further!
