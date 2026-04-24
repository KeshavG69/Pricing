# PriceIQ Pricing Formulas — Canonical Reference

> **Purpose.** This document is the single source of truth for every formula PriceIQ uses to derive displayed values from stored inputs. It exists because **no computed values are persisted to MongoDB** — only raw inputs + a top-level `total_cost` grand total. Any tool, agent, or service that needs to answer questions about a proposal must recompute from these formulas.
>
> **Conventions.**
> - Citations: `path/file.ts:line` — exact location of the code.
> - `x ← y` means "x is computed from y".
> - All rates are **decimals** (e.g., `0.247` = 24.7%), never percentages.
> - "Frontend" = the source of truth for what the user sees. "Backend" = Excel export + legacy `/recalculate` endpoint.
> - **Divergences between frontend and backend are flagged in `§ 13`.** If you need to match UI exactly, implement the frontend version.

---

## 1. Data model (inputs only — what's stored in MongoDB)

`proposals.spreadsheet_data` contains:

| Field | Type | Notes |
|---|---|---|
| `positions` | `SpreadsheetPosition[]` | raw position inputs (see below) |
| `subcontractors` | `Subcontractor[]` | each has `positions: SubcontractorPosition[]` with a **frozen** `rate` |
| `travel` | `TravelItem[]` | `{amount_per_year, escalate}` |
| `odcs` | `ODCItem[]` | `{amount_per_year, escalate, category}` |
| `extensions` | `Extension[]` | partial-year periods after regular years |
| `surge` | `SurgeOption \| null` | `{percentage, description}` |
| `rates` | `IndirectRates` | see § 3 |
| `escalation_rates` | `Record<"1_to_2" \| "2_to_3" \| ..., number>` | year-to-year rates |
| `months_per_year` | `Record<string, number>` | for partial years |
| `advanced_mode`, `subcontractor_configured` | `boolean` | UI state |

Top level of proposal doc: `total_cost` (grand total; **only computed value persisted**).

`SpreadsheetPosition` key fields used by calculations ([types/index.ts:316](frontend/types/index.ts:316)):

- `labor_category`, `description`, `experience`, `location`, `location_type` (`'On-Site' | 'Off-Site'`)
- `hours_per_year: Record<string, number>` — per-year hours
- `ot_hours_per_year?: Record<string, number>` — overtime hours
- `standard_fte_hours: number` — contract FTE (1880 / 1920 / 2080 etc.)
- **BLS-specific**: `percentile`, `wage_{10,25,50,75,90}th`, `selected_wage`, `custom_salary`, `selected_salaries[]`
- **GSA-specific**: `wage_source='gsa'`, `gsa_rates_by_year`, `gsa_current_year`, `gsa_custom_rate`, `gsa_discount_rate`
- `assigned_subcontractor_id` — if set, position is counted under subcontractor, **not** prime labor
- `is_key_position`, `is_surge` — flags
- `soc_code`, `soc_title` — BLS occupation

`SubcontractorPosition` ([types/index.ts:382](frontend/types/index.ts:382)):
- `labor_category`, `rate` (**FROZEN at assignment time**), `original_base_rate`, `rates_per_year?`
- `hours_per_year`, `ot_hours_per_year?`, `location_type`
- `original_position_id` — links back to prime row; required for re-deriving GSA rates live

---

## 2. Classification of a position: BLS vs GSA

A position is GSA if ([salaryHelpers.ts:9](frontend/lib/utils/salaryHelpers.ts:9)):

```
isGSA ←
    position.wage_source === 'gsa'
    OR (position.gsa_rates_by_year is non-empty AND position.gsa_current_year is set)
```

Otherwise it's BLS. Calculations branch heavily on this distinction.

---

## 3. Rates (`IndirectRates`)

Fields on `state.rates` that formulas read:

| Key | Meaning | Typical | Notes |
|---|---|---|---|
| `fringe` | Fringe benefits rate | 0.247 | applied to DL |
| `oh_onsite` | Overhead rate for On-Site positions | 0.0711 | picked when `location_type === 'On-Site'` |
| `oh_offsite` | Overhead rate for Off-Site positions | 0.0711 | picked when `location_type === 'Off-Site'` |
| `oh` | **DEPRECATED** single OH rate | — | kept for back-compat, used only if `oh_onsite`/`oh_offsite` missing |
| `ga` | G&A rate (on prime labor) | 0.2243 | also reused for Travel G&A |
| `fee` | Prime labor fee (profit) | 0.07 | |
| `smh` | Subcontract & Material Handling rate | 0.065 | applied to ODCs **and** to sub labor (as passthrough component) |
| `ga_passthrough` | G&A-on-subs rate | 0.025 | used in sub passthrough alongside `smh` |
| `sub_fee` | Fee on subcontractor labor | 0.0 | separate from prime fee; orgs that charge fee on subs override this |
| `ot_multiplier` | Overtime multiplier | 1.5 | applies to OT hours for both prime and sub |
| `surge_multiplier` | Surge premium multiplier | 1.15 | multiplied into surge cost |

**OH rate selection (read this carefully)** — used in every BLS FBLR computation:

```
ohOnsite  ← rates.oh_onsite  !== undefined ? rates.oh_onsite  : (rates.oh !== undefined ? rates.oh : 0.0711)
ohOffsite ← rates.oh_offsite !== undefined ? rates.oh_offsite : (rates.oh !== undefined ? rates.oh : 0.0711)
locType   ← position.location_type || 'On-Site'                    # default when unset
ohRate    ← locType === 'On-Site' ? ohOnsite : ohOffsite
```
Source: [pricingStore.ts:574-577](frontend/lib/stores/pricingStore.ts:574), [PrimeLaborSection.tsx:126-129](frontend/components/pricing/PrimeLaborSection.tsx:126).

---

## 4. Effective base wage selection (BLS)

Priority order ([salaryHelpers.ts:194-223](frontend/lib/utils/salaryHelpers.ts:194)):

```
if isGSA(position):
    return getGSARateForYear(position, 1)      # hourly rate, not annual wage

if position.selected_salaries is non-empty:
    return mean(position.selected_salaries)    # multi-select averaging

if position.custom_salary:
    return position.custom_salary              # legacy single custom

if typeof position[`wage_${position.percentile}`] === 'number' > 0:
    return position[`wage_${position.percentile}`]

if position.selected_wage:
    return position.selected_wage              # final fallback

return 0
```

**Experience → percentile** (used to pre-select `percentile` at parse time; user can override in UI) [calculation_service.py:685](backend/client/calculation_service.py:685), [pipeline.py:217](backend/utils/pipeline.py:217), [pipeline.py:327](backend/utils/pipeline.py:327), [proposals.py:1938](backend/routers/proposals.py:1938):

```
experience < 3  → "25th"
3 <= exp < 6    → "50th"
experience >= 6 → "75th"
```

---

## 5. FBLR cascade (BLS, per-year)

This is the core formula. Produced per position, per year in `performTransformToAdvanced` ([pricingStore.ts:528-606](frontend/lib/stores/pricingStore.ts:528)).

### Inputs
- `baseWage` ← `getEffectiveSalary(position)` (annual $)
- `yearNum` (1-based proposal year)
- `position.hours_per_year[yearNum]` — actual hours for that year
- `position.standard_fte_hours` — contract FTE
- `position.location_type` — On-Site / Off-Site
- `rates`, `escalationRates`

### Formula (per year)

```
# Step 1: escalate wage from year 1 to target year (compound)
wage ← baseWage
for y in 1..(yearNum - 1):
    escRate ← escalationRates[f"{y}_to_{y+1}"] || 0
    wage   ← wage * (1 + escRate)

# Step 2: direct labor rate using STANDARD FTE hours (NOT actual hours)
dlRate ← wage / position.standard_fte_hours
dlAmount ← dlRate * hours

# Step 3: apply cascade
fringe ← dlRate * rates.fringe
oh     ← (dlRate + fringe) * ohRate                    # ohRate per § 3
ga     ← (dlRate + fringe + oh) * rates.ga
fee    ← (dlRate + fringe + oh + ga) * rates.fee

fblr        ← dlRate + fringe + oh + ga + fee          # INCLUDES fee in store
totalAmount ← fblr * hours
```

**Why standard FTE hours (not `hours`)?** Ensures consistent hourly rate across partial-year periods (6-month extension gets the same rate as a full year). Contract defines FTE; "actual hours" varies per year.

**Edge case** — if `baseWage === 0` OR `standard_fte_hours` missing/0, the entire breakdown is zeroed out ([pricingStore.ts:533-551](frontend/lib/stores/pricingStore.ts:533)).

### ⚠️ Canonical FBLR definition — rule for the agent

**FBLR is always fee-inclusive: `FBLR = dl + fringe + oh + ga + fee`.**

The frontend has two presentations of this number in the UI:

| Where | Formula as displayed | Purpose |
|---|---|---|
| `performTransformToAdvanced` per-year grid cells | `dlRate + fringe + oh + ga + fee` (**fee included**) | the fully-loaded billable rate shown in each year's cell |
| `calculateAveragedFBLR` averaged column ([PrimeLaborSection.tsx:135](frontend/components/pricing/sections/PrimeLaborSection.tsx:135)) | `dlRate + fringe + oh + ga` (**fee excluded** in that specific label) | cosmetic split: the averaged view lays out DL / Fringe / OH / G&A / **FBLR** / **Fee** as six side-by-side columns so the user sees the DCAA build-up. Fee is rendered in its own column next to FBLR per govt cost-proposal format (Intprepix / FAR 15.408 Table 15-2). Reading that column as "the FBLR" and then also adding the Fee column would double-count. |

**Agent rule:**

> When the user asks "what is the FBLR for X?", **always return fee-inclusive** `dl + fringe + oh + ga + fee`. The averaged column's pre-fee number is a UI presentation artifact for the proposal deliverable — it is not an independent rate. Do not surface it under the label "FBLR."
>
> If the user asks specifically about the labor build-up or "pre-fee loaded rate," compute `dl + fringe + oh + ga` and label it clearly (e.g., "loaded labor subtotal before fee"). Never quote that number as "FBLR" on its own.

The `calculateAveragedFBLR` helper returns **both** `fblr` (pre-fee per its column) and `fee` (separate) as sibling fields, so the agent can always reconstruct the full fee-inclusive number as `fblr + fee`.

---

## 6. GSA positions

### 6.1 Rate lookup for year ([salaryHelpers.ts:114-175](frontend/lib/utils/salaryHelpers.ts:114))

```
getGSARateForYear(position, proposalYear, escalationRates?):
    # Custom rate overrides everything (null/undefined = unset; 0 is a valid rate)
    if position.gsa_custom_rate != null:
        return position.gsa_custom_rate

    if not position.gsa_rates_by_year:
        return 0

    currentGsaYear ← position.gsa_current_year || 1
    contractYear   ← currentGsaYear + (proposalYear - 1)

    if position.gsa_rates_by_year[str(contractYear)] exists:
        return position.gsa_rates_by_year[str(contractYear)]

    availableYears ← sorted(int keys of gsa_rates_by_year)
    if availableYears is empty:
        return 0

    if contractYear > max(availableYears):
        # Beyond contract: start from last known rate and escalate
        rate ← gsa_rates_by_year[max(availableYears)]
        if not escalationRates:
            return rate                          # back-compat: last rate
        for cy in max(availableYears)..contractYear-1:
            propYear ← cy - currentGsaYear + 1
            escKey   ← f"{propYear}_to_{propYear+1}"
            rate    ← rate * (1 + (escalationRates[escKey] || 0))
        return rate

    # contractYear < min: use earliest known
    return gsa_rates_by_year[min(availableYears)]
```

**Note**: `gsa_custom_rate` uses `!= null` check — both `null` and `undefined` mean "unset", while literal `0` is a valid rate (e.g., free labor pass-through). The UI modals that load custom rates still use `|| null` for display convenience, so a stored `0` will present as cleared when re-opening the edit modal — that's an input-UX choice, not a calc bug.

### 6.2 Discount application ([pricingStore.ts:492-494](frontend/lib/stores/pricingStore.ts:492))

```
originalGsaRate ← getGSARateForYear(position, year, escalationRates)
discountRate    ← position.gsa_discount_rate || 0
gsaRate         ← originalGsaRate * (1 - discountRate)
```

### 6.3 Reverse-engineered breakdown (display only) ([salaryHelpers.ts:46-98](frontend/lib/utils/salaryHelpers.ts:46))

GSA rates are already fully burdened. To show DL/Fringe/OH/G&A/Fee in the UI, decompose with the same indirect rates as BLS:

```
multiplier ← (1 + rates.fringe) * (1 + ohRate) * (1 + rates.ga) * (1 + rates.fee)
dlRate     ← gsaRate / multiplier

# Apply cascade forward to get each component amount per hour
fringe ← dlRate * rates.fringe
oh     ← (dlRate + fringe) * ohRate                    # ohRate = rates.oh_onsite fallback chain
ga     ← (dlRate + fringe + oh) * rates.ga
fee    ← (dlRate + fringe + oh + ga) * rates.fee
fblr   ← dlRate + fringe + oh + ga + fee               # ≈ gsaRate (rounding drift OK)
```

**Critical invariant**: for GSA positions, **actual cost is always `gsaRate × hours`**, NEVER `fblr × hours` from this breakdown. The breakdown is cosmetic for UI row consistency only. Per-year totals [pricingStore.ts:507](frontend/lib/stores/pricingStore.ts:507):

```
totalAmount ← gsaRate * hours           # GSA total, ignores breakdown
```

### 6.4 GSA OH rate in reverse-engineering ([salaryHelpers.ts:46-68](frontend/lib/utils/salaryHelpers.ts:46))

Reverse-engineering picks OH based on `location_type` (passed in by callers — store, OverviewTab, PrimeLaborSection averaged-FBLR). On-Site uses `oh_onsite ?? oh_offsite ?? oh ?? 0.0711`; Off-Site uses `oh_offsite ?? oh_onsite ?? oh ?? 0.0711`. Matches the BLS per-position OH selection so Off-Site GSA rows no longer display the on-site OH by accident.

---

## 7. Averaged FBLR (for display column)

Two implementations — pick the one matching your caller.

### 7.1 Frontend — BLS ([PrimeLaborSection.tsx:29-138](frontend/components/pricing/PrimeLaborSection.tsx:29))

Weights by actual hours worked per year:

```
baseWage        ← getEffectiveSalary(position)       # 0 → return zeros
currentYearWage ← baseWage
fteHours        ← position.standard_fte_hours
totalSalary, totalHours ← 0, 0

for year in 1..totalYears:
    hoursThisYear ← position.breakdown[year].hours || 0
    if hoursThisYear > 0:
        hourlyRateThisYear ← currentYearWage / fteHours
        totalSalary        ← totalSalary + hourlyRateThisYear * hoursThisYear
        totalHours         ← totalHours + hoursThisYear

    # FULL escalation applied (NOT prorated by months_per_year — see § 13)
    if year < totalYears:
        escRate          ← escalationRates[f"{year}_to_{year+1}"] || 0
        currentYearWage  ← currentYearWage * (1 + escRate)

if totalHours === 0: return zeros

dlRate ← totalSalary / totalHours

# Cascade on averaged DL
fringe ← dlRate * rates.fringe
oh     ← (dlRate + fringe) * ohRate                   # ohRate per § 3
ga     ← (dlRate + fringe + oh) * rates.ga
fee    ← (dlRate + fringe + oh + ga) * rates.fee
fblr   ← dlRate + fringe + oh + ga                    # ← EXCLUDES fee (Intprepix format)

return { dlRate, fringe, oh, ga, fee, fblr, isGSA: false }
```

### 7.2 Frontend — GSA ([PrimeLaborSection.tsx:38-76](frontend/components/pricing/PrimeLaborSection.tsx:38))

```
totalAmount, totalHours ← 0, 0

for year in 1..totalYears:
    breakdown     ← position.breakdown[year]
    hoursThisYear ← breakdown?.hours || 0
    discountRate  ← position.gsa_discount_rate || 0

    # PRIMARY: use pre-computed discounted rate; FALLBACK: recompute
    gsaRate ← breakdown?.fblr ?? (getGSARateForYear(position, year, escalationRates) * (1 - discountRate))

    if hoursThisYear > 0 AND gsaRate > 0:
        totalAmount ← totalAmount + gsaRate * hoursThisYear
        totalHours  ← totalHours + hoursThisYear

if totalHours === 0: return zeros

avgGsaRate  ← totalAmount / totalHours
gsaBreakdown ← reverseEngineerGSARate(avgGsaRate, rates)
return { …gsaBreakdown, isGSA: true }     # fblr here includes fee
```

### 7.3 Backend — `calculate_averaged_fblr` ([calculation_service.py:890-1028](backend/client/calculation_service.py:890))

Identical year-over-year escalation behavior to 7.1 (full annual rate, not prorated). `months_per_year` is accepted for API compatibility but ignored:

```
for year in 1..total_years:
    hours_this_year ← hours_per_year[str(year)] || 0
    if hours_this_year > 0:
        total_salary += (current_year_wage / standard_fte_hours) * hours_this_year
        total_hours  += hours_this_year

    # Full-year escalation, same as frontend
    if year < total_years:
        esc_rate          ← escalation_rates[f"{year}_to_{year+1}"] || 0
        current_year_wage ← current_year_wage * (1 + esc_rate)

dl_rate ← total_salary / total_hours
fringe  ← dl_rate * fringe_rate
oh      ← (dl_rate + fringe) * actual_oh_rate
ga      ← (dl_rate + fringe + oh) * ga_rate
fee     ← (dl_rate + fringe + oh + ga) * fee_rate
fblr    ← dl_rate + fringe + oh + ga + fee          # ← INCLUDES fee (§ 7.1 excludes it for Intprepix format)
```

---

## 8. Escalation

### 8.1 Compound year-over-year (standard)

Applied everywhere except backend averaged FBLR (§ 7.3):

```
multiplier ← 1
for y in 1..(targetYear - 1):
    multiplier ← multiplier * (1 + (escalationRates[f"{y}_to_{y+1}"] || 0))
escalatedValue ← baseValue * multiplier
```

Note: the escalation key format is always `"{from}_to_{to}"`, e.g., `"1_to_2"`, `"2_to_3"`.

### 8.2 Subcontractor escalation ([pricingStore.ts:369-375](frontend/lib/stores/pricingStore.ts:369), [SubcontractorSection.tsx:61-70](frontend/components/pricing/SubcontractorSection.tsx:61))

Starts from `y=2`, cumulates `"{y-1}_to_{y}"` — **equivalent** to 8.1 (just re-indexed). Verified identical output.

### 8.3 Prorated (backend `calculate_averaged_fblr` only)

See § 7.3. The current year's `months_per_year / 12` scales the escalation going INTO the next year.

---

## 9. Subcontractor cost (prime-side)

All sub cost math happens in [pricingStore.ts:347-386](frontend/lib/stores/pricingStore.ts:347) and [SubcontractorSection.tsx:203-255, 598-615](frontend/components/pricing/SubcontractorSection.tsx:203).

### 9.1 Effective per-year rate for a sub position

```
markupDivisor ← 1 + (rates.smh || 0) + (rates.ga_passthrough || 0) + (rates.sub_fee || 0)

# Three branches:

# (A) GSA sub (position was originally a GSA prime, now converted):
origPrimePos ← positions.find(p => p.id === subPos.original_position_id)
if origPrimePos is GSA:
    gsaYearRate   ← getGSARateForYear(origPrimePos, year, escalationRates)
    discountRate  ← origPrimePos.gsa_discount_rate || 0
    effectiveRate ← (gsaYearRate * (1 - discountRate)) / markupDivisor

# (B) Sub has explicit per-year rates:
elif subPos.rates_per_year?.[year] !== undefined:
    effectiveRate ← subPos.rates_per_year[year]

# (C) Default: escalate frozen base rate
else:
    effectiveRate ← subPos.rate * escalationMultiplier(year)    # compound, § 8.1
```

**Why divide by `markupDivisor` for GSA subs?** The user-visible invariant is "GSA total = `gsaRate × (1 - discount) × hours`". Downstream, the pipeline adds `passthrough + sub_fee` **on top of** `subcontractorTotal`. So the base must be pre-markup: dividing by `(1 + smh + ga_passthrough + sub_fee)` cancels the later multiplication.

### 9.2 Position-level amount

```
subTotal += hours * effectiveRate
subTotal += otHours * effectiveRate * (rates.ot_multiplier || 1.5)   # OT
```

### 9.3 Passthrough (prime-side markup on sub labor) ([pricingStore.ts:389](frontend/lib/stores/pricingStore.ts:389))

```
passthroughTotal ← subcontractorTotal * ((rates.smh || 0) + (rates.ga_passthrough || 0))
```

Applied to the **total across all subs**, not per-sub. Matches FAR 52.215-23 structure: `smh` = subcontract handling cost; `ga_passthrough` = G&A on sub labor (Value-Added approach).

### 9.4 Sub fee ([pricingStore.ts:393](frontend/lib/stores/pricingStore.ts:393))

```
subFee ← subTotal * (rates.sub_fee || rates.fee || 0)
```

Falls back to prime `fee` if `sub_fee` is missing.

### 9.5 Subcontractor display rate (Prime Labor grid cells)

Shown to the user in the Prime Labor grid when a position is assigned to a subcontractor. Matches cost aggregation exactly ([PrimeLaborSection.tsx:219-231](frontend/components/pricing/sections/PrimeLaborSection.tsx:219)):

```
escalatedRate  ← getEscalatedRate(baseRate, year)          # compound, § 8.1
subFee         ← rates.sub_fee || 0
smh            ← rates.smh || 0
gaPassthrough  ← rates.ga_passthrough || 0
displayRate    ← escalatedRate * (1 + smh + gaPassthrough + subFee)   # ADDITIVE, all markups
```

Inverse (when user edits the displayed rate) ([PrimeLaborSection.tsx:2080](frontend/components/pricing/sections/PrimeLaborSection.tsx:2080)):

```
newBaseRate ← editedDisplayRate / (1 + smh + gaPassthrough + subFee)
```

**Breakdown rows** expanded under a sub-assigned row (4 rows, sum equals `displayRate`):

```
Base Rate        ← escalatedBaseRate
S&MH             ← escalatedBaseRate * smh
G&A Passthrough  ← escalatedBaseRate * gaPassthrough
Sub Fee          ← escalatedBaseRate * subFee
```

Per DCAA convention (FAR 15.404-3): all prime-applied markups — handling, G&A on sub, and fee — stack **additively** on the subcontractor's fully-loaded cost rate to produce the billable rate to the government.

### 9.6 Prime Labor section "Combined Totals" row ([PrimeLaborSection.tsx:984-1031](frontend/components/pricing/sections/PrimeLaborSection.tsx:984))

Computed per-year; grand total is the sum of per-year (keeps total consistent with display). For each sub position, `effectiveRate` follows the § 9.1 priority: GSA sub live-derive > `rates_per_year` > escalated frozen `rate`:

```
markupDivisor ← 1 + rates.smh + rates.ga_passthrough + rates.sub_fee

for each subPos in all subs:
    originalPrimePos ← positions.find(p => p.id === subPos.original_position_id)
    isGSASub        ← originalPrimePos ? isGSA(originalPrimePos) : false

    for year in 1..totalYears:
        effectiveRate ←
            (isGSASub && originalPrimePos)
                ? (getGSARateForYear(originalPrimePos, year, escalationRates)
                    * (1 - (originalPrimePos.gsa_discount_rate || 0))) / markupDivisor
            : subPos.rates_per_year?.[year] !== undefined
                ? subPos.rates_per_year[year]
            : getEscalatedRate(subPos.rate, year)

        baseCost        ← hours * effectiveRate
        passthroughCost ← baseCost * (rates.smh + rates.ga_passthrough)
        feeCost         ← baseCost * rates.sub_fee
        year_amount    += baseCost + passthroughCost + feeCost
```

### 9.7 Backend `calculate_subcontractor_markup` (matches frontend, additive) ([calculation_service.py:595-693](backend/client/calculation_service.py:595))

```
if has_max_passthrough_cap AND max_passthrough_rate:
    applied_fee_rate ← max_passthrough_rate - smh_rate
    if applied_fee_rate < 0: raise ValueError(...)
else:
    applied_fee_rate ← fee_rate

# Both SMH and fee apply to the sub's loaded cost base (additive).
# DCAA convention: subcontract-handling allocation base = subcontract cost.
fee         ← round(sub_base_rate * applied_fee_rate, 2)
smh         ← round(sub_base_rate * smh_rate, 2)
final_rate  ← round(sub_base_rate + fee + smh, 2)
```

Cap case: `fee + smh = (cap - smh) + smh = cap` exactly, so total markup equals the cap rate. Matches the frontend's flat markup structure in `calculateGrandTotal` (§ 9.3/9.4).

---

## 10. Travel ([pricingStore.ts:396-417](frontend/lib/stores/pricingStore.ts:396))

Per `TravelItem`, per year:

```
amount        ← item.amount_per_year[year] || 0
finalAmount   ← amount
if item.escalate:
    finalAmount ← amount * escalationMultiplier(year)    # compound, § 8.1

travelTotal  += finalAmount * (1 + (rates.ga || 0))
```

- Applies **G&A** (same `rates.ga` used for prime labor), not SMH.
- **No fee.** Government convention: fee only on labor.

---

## 11. ODC (Other Direct Costs) ([pricingStore.ts:419-440](frontend/lib/stores/pricingStore.ts:419))

Per `ODCItem`, per year:

```
amount        ← item.amount_per_year[year] || 0
finalAmount   ← amount
if item.escalate:
    finalAmount ← amount * escalationMultiplier(year)

odcTotal     += finalAmount * (1 + (rates.smh || 0))
```

- Applies **SMH only** (Subcontract & Material Handling). No G&A passthrough.
- Matches the Nexagen CE Summary sample template (`Material` sheet: `Material Handling = base × 'Indirect Rate'!$C$13` where C13 is a single S&MH rate).
- **No fee** on ODCs (fee is on labor only).

---

## 12. Grand total — THREE implementations, ONE persisted value

There are three sites that compute a contract grand total. All three are arithmetically equivalent for well-formed data, but **they differ in structure and there are two concurrent writers to `proposals.total_cost`**.

### 12.A `calculateGrandTotal` in the store ([pricingStore.ts:333-451](frontend/lib/stores/pricingStore.ts:333))

```
primeLaborTotal ← Σ_years ( aggregates.byYear[year].dl
                          + aggregates.byYear[year].fringe
                          + aggregates.byYear[year].oh
                          + aggregates.byYear[year].ga )   # EXCLUDES fee

otTotal         ← Σ_years aggregates.byYear[year].ot

subTotal         ← per § 9.1 + § 9.2, summed over all subs and years
passthroughTotal ← subTotal * (rates.smh + rates.ga_passthrough)
primeFee         ← primeLaborTotal * (rates.fee || 0)
subFee           ← subTotal * (rates.sub_fee || rates.fee || 0)
feeTotal         ← primeFee + subFee

travelTotal      ← per § 10
odcTotal         ← per § 11

surgeTotal ← 0
if state.surge AND state.surge.percentage !== null:
    # Surge base is fee-INCLUSIVE (billable rate) per DFARS 252.217-7001
    primeLaborWithFee ← primeLaborTotal + primeFee
    surgeTotal ← primeLaborWithFee * state.surge.percentage * (rates.surge_multiplier || 1.15)

grandTotal ← primeLaborTotal + otTotal + subTotal + passthroughTotal
           + feeTotal + travelTotal + odcTotal + surgeTotal
```

### Aggregates source

`aggregates.byYear[year]` comes from `performTransformToAdvanced` ([pricingStore.ts:630-676](frontend/lib/stores/pricingStore.ts:630)):

```
for each position in positionsAdvanced:
    if position.assigned_subcontractor_id: continue         # avoid double-count
    for year, breakdown in position.breakdown:
        aggregates.byYear[year].dl     += breakdown.dlAmount
        aggregates.byYear[year].fringe += breakdown.fringeAmount
        aggregates.byYear[year].oh     += breakdown.ohAmount
        aggregates.byYear[year].ga     += breakdown.gaAmount
        aggregates.byYear[year].fee    += breakdown.feeAmount
        aggregates.byYear[year].fblr   += breakdown.totalAmount
        # OT uses per-position FBLR (which DOES include fee)
        otHours ← position.ot_hours_per_year?.[year] || 0
        if otHours > 0:
            aggregates.byYear[year].ot += otHours * breakdown.fblr * (rates.ot_multiplier || 1.5)
```

**Arithmetic equivalence (BLS)**: Σ (dl+fringe+oh+ga) × fee = Σ fee, so `primeFee` in `calculateGrandTotal` equals `aggregates.totalFee` exactly for BLS. For GSA positions, `breakdown.feeAmount` is the **reverse-engineered** fee (cosmetic), but the prime fee in `calculateGrandTotal` is re-derived from (dl+fringe+oh+ga) components which already satisfy the decomposition of `gsaRate`. Net: GSA grand total equals `Σ gsaRate × hours` to rounding precision.

**Positions assigned to subs** (`assigned_subcontractor_id` set) are **skipped** in aggregates but counted under the corresponding subcontractor.

Written to `proposals.total_cost` via two paths that share the same `calculateGrandTotal()`:
- `saveProposal()` ([pricingStore.ts:3282](frontend/lib/stores/pricingStore.ts:3282)) — explicit save / navigation.
- `debouncedAutoSave` ([pricingStore.ts:773-814](frontend/lib/stores/pricingStore.ts:773)) — 2-second auto-save triggered by `isDirty`.

The store is the **sole writer** of `total_cost` to MongoDB.

### 12.B Overview tab ([OverviewTab.tsx:83-415](frontend/components/pricing/OverviewTab.tsx:83))

Same final number as 12.A, **but different structure** — uses `aggregates.totalFBLR` (which INCLUDES fee), so `primeLaborTotal` is fee-inclusive:

```
# Advanced mode path:
primeLaborTotal ← aggregates.totalFBLR        # INCLUDES prime fee
directLaborTotal ← aggregates.totalDL
fringeTotal      ← aggregates.totalFringe
gaTotal          ← aggregates.totalGA
primeFeeTotal    ← aggregates.totalFee        # for display only
# OH split on/off-site reconstructed from positionsAdvanced.breakdown.ohAmount

# Basic mode path: rebuild from positions using the same formulas as
# performTransformToAdvanced — mirrors § 5 (BLS) and § 6 (GSA).

subTotal         ← per § 9 (same markupDivisor logic)
passthroughTotal ← subTotal * (rates.smh + rates.ga_passthrough)
subFee           ← subTotal * rates.sub_fee
feeTotal         ← primeFeeTotal + subFee     # display metric
travelTotal      ← per § 10
odcTotal         ← per § 11
otTotal          ← aggregates.totalOT (advanced) OR rebuild (basic)
surgeTotal       ← primeLaborTotal * surge.percentage * (rates.surge_multiplier || 1.15)
                   # NOTE: multiplies fee-INCLUSIVE primeLaborTotal, unlike 12.A/12.C

# Grand total (note: primeLaborTotal already has prime fee baked in)
grandTotal = primeLaborTotal + subFee + subTotal + passthroughTotal
           + travelTotal + odcTotal + otTotal + surgeTotal
```

Overview tab is **pure display** — it does NOT write to `proposals.total_cost`. The store is the sole persister; see § 12.A.

**⚠ Surge base drift**. OverviewTab multiplies surge against fee-INCLUSIVE primeLaborTotal (because that's what `aggregates.totalFBLR` is). Store 12.A and AdvancedAnalysisGrid 12.C multiply surge against fee-EXCLUSIVE prime labor. On a proposal with any prime fee, **this produces different surge values** between Overview tab and the other two sites.

### 12.C AdvancedAnalysisGrid (Pricing Workspace "CE Summary") ([AdvancedAnalysisGrid.tsx:171-412](frontend/components/pricing/AdvancedAnalysisGrid.tsx:171))

Renders the CE Summary view inside the pricing workspace. Explicitly strips fee from prime labor ([line 177](frontend/components/pricing/AdvancedAnalysisGrid.tsx:177)):

```
primeLaborByYear[y]      ← aggregates.byYear[y].dl + fringe + oh + ga     # EXCLUDES fee
otCostsByYear[y]         ← aggregates.byYear[y].ot
subcontractorCostsByYear[y] ← Σ (escalatedRate * hours) + Σ (escalatedRate * otMultiplier * otHours)
                               # no GSA re-derive here — uses sub.rate directly, unlike § 9
passthroughByYear[y]     ← subcontractorCostsByYear[y] * (rates.smh + rates.ga_passthrough)
feeByYear[y]             ← primeLaborByYear[y] * rates.fee
                         + subcontractorCostsByYear[y] * rates.sub_fee
subFeeByYear[y]          ← subcontractorCostsByYear[y] * rates.sub_fee   # for display
travelCostsByYear[y]     ← Σ travel_base * (1 + rates.ga)                # per § 10
odcCostsByYear[y]        ← Σ odc_base * (1 + rates.smh)                  # per § 11
surgeCostsByYear[y]      ← primeLaborByYear[y] * surge.percentage * (rates.surge_multiplier || 1.15)
                           # fee-EXCLUSIVE base

grandTotal.byYear[y] = primeLabor + OT + subLabor + passthrough + fee
                     + travel + ODC + surge
```

Does NOT write `total_cost` — pure display. Its per-year totals feed the `GrandTotalSection`, `FeeSection`, `PassthroughSection`, `CombinedLaborTotalsSection`, etc.

**Sub rate handling**: matches § 9.1 — for positions with `original_position_id` pointing to a GSA prime, re-derives as `gsa_rates_by_year(year) × (1 - gsa_discount_rate) / markupDivisor`. Otherwise uses `rates_per_year[year]` if present, else `subPos.rate × compound_escalation`.

### 12.D Display-only sections

These components receive pre-computed per-year maps as props and just sum them — **no new formulas**:

- [FeeSection.tsx:47-89](frontend/components/pricing/sections/FeeSection.tsx:47) — `primeFee = primeLabor × prime_labor_rate; subFee = subLabor × sub_labor_rate`
- [PassthroughSection.tsx:45-77](frontend/components/pricing/sections/PassthroughSection.tsx:45) — `smh = subCost × smh; ga = subCost × ga_passthrough`
- [ODCSection.tsx:53-97](frontend/components/pricing/sections/ODCSection.tsx:53) — `subtotal = Σ escalated ODC; smh = subtotal × smhRate; total = subtotal + smh`
- [TravelSection.tsx:53-108](frontend/components/pricing/sections/TravelSection.tsx:53) — mirror of ODC with `gaRate` instead of `smhRate`
- [SurgeSection.tsx:42-82](frontend/components/pricing/sections/SurgeSection.tsx:42) — `surge[y] = baseLabor[y] × percentage × multiplier`
- [GrandTotalSection.tsx:56-81](frontend/components/pricing/sections/GrandTotalSection.tsx:56) — sums its input maps
- [CombinedLaborTotalsSection.tsx:58-77](frontend/components/pricing/sections/CombinedLaborTotalsSection.tsx:58) — sums its input maps
- `PrimeLaborAggregatesSection` — display only

---


## 14. Position splitting (FTE threshold)

Backend preprocessor — runs once at parse time, before any display.

### 14.1 Single-year splitting ([pricing.py:14-55](backend/routers/pricing.py:14))

```
if hours <= max_hours (default 1920):
    return [position]

fte_count ← ceil(hours / max_hours)
for i in 0..(fte_count - 1):
    new_position.hours ← max_hours if i < fte_count - 1 else (hours - max_hours * (fte_count - 1))
```

Example: 5760 hours → 3 positions of 1920.

### 14.2 Multi-year with prorated threshold ([pricing.py:58-151](backend/routers/pricing.py:58))

For each year, the per-year threshold is prorated by `months_per_year`:

```
year_threshold(year) ← (months_per_year[year] / 12) * max_hours
ftes_needed(year)    ← ceil(total_hours[year] / year_threshold(year))
max_ftes_needed      ← max over years
```

Then for each FTE row, each year's hours = `min(remaining, year_threshold)`.

Note: CLAUDE.md mentions 1920 as the split threshold; the code default is 1920 but `standard_fte_hours` varies per contract (1880, 1920, 2080).

---

## 15. Surge ([pricingStore.ts:442-452](frontend/lib/stores/pricingStore.ts:442), [AdvancedAnalysisGrid.tsx:378-402](frontend/components/pricing/AdvancedAnalysisGrid.tsx:378))

```
if state.surge AND state.surge.percentage !== null:
    primeLaborWithFee ← primeLaborTotal + primeFee       # fee-INCLUSIVE
    surgeTotal ← primeLaborWithFee * state.surge.percentage * (rates.surge_multiplier || 1.15)
```

- `surge.percentage` in decimal form (0.30 = 30%).
- Base is **fully-loaded prime labor** (`DL + Fringe + OH + G&A + Fee`). Per DFARS 252.217-7001, surge hours are priced at the same billable rate as base work, and government billable rate always includes fee. `AdvancedAnalysisGrid` uses `aggregates.byYear[y].fblr` (already fee-inclusive). OverviewTab uses `primeLaborTotal = aggregates.totalFBLR` (also fee-inclusive). All three grand-total sites now agree.
- Surge is NOT applied to subcontractor labor, travel, or ODC.
- There is **no additional fee line** added on top of `surgeTotal` — fee is already baked into the base.
- Independent from `is_surge` position flag (that's a different surge model — Scenario 1 — surfaced per-position, not aggregate).

---

## 16. Overtime

Applied in two places:

### 16.1 Prime OT ([pricingStore.ts:659-665](frontend/lib/stores/pricingStore.ts:659))

```
for each position in positionsAdvanced (skip if assigned_subcontractor_id):
    for each year in breakdown:
        otHours ← position.ot_hours_per_year?.[year] || 0
        if otHours > 0:
            otCost ← otHours * breakdown.fblr * (rates.ot_multiplier || 1.5)
            aggregates.byYear[year].ot += otCost
            aggregates.totalOT         += otCost
```

**Uses `breakdown.fblr` which INCLUDES fee** — so prime OT cost implicitly includes the fee markup for those hours. Different from the fee-separated treatment in `calculateGrandTotal`.

### 16.2 Sub OT ([pricingStore.ts:381-383](frontend/lib/stores/pricingStore.ts:381))

```
otHours ← subPos.ot_hours_per_year?.[year] || 0
subTotal += otHours * effectiveRate * (rates.ot_multiplier || 1.5)
```

---

## 17. Industry context (for completeness)

These formulas align with standard government-contractor wrap-rate math:

- **Cascading wrap rate** — `(1+Fringe)(1+OH)(1+G&A)(1+Fee)` — is the standard ([DCAA Compliance guidance](https://dcaacompliance.com), [GovDash wrap-rate guide](https://www.govdash.com/blog/wrap-rate-government-contracting-guide)). The code's step-by-step cascade is mathematically identical to the multiplicative form.
- **Subcontract handling rate (SMH)** — a separate indirect pool applied to subcontract + material costs as base; distinct from prime's OH/G&A. Matches FAR 52.215-23 "excessive pass-through charges" structure.
- **G&A on subs (`ga_passthrough`)** — under Total Cost Input (TCI), G&A applies to subs; under Value-Added (VA), it does not. The `ga_passthrough` rate lets the user configure this per proposal.
- **Prime vs sub fee separately** — supported by FAR 15.404-4 profit factors; `sub_fee` typically lower than prime `fee`.
- **SeaPort-NxG 8% pass-through cap** — applies on CPFF task orders only; backend `calculate_subcontractor_markup` implements it by deriving `applied_fee = cap - smh_rate`.

---

## 18. Rounding

| Site | Behavior |
|---|---|
| Backend `dl_rate` | rounded to 6 decimals ([calculation_service.py:78](backend/client/calculation_service.py:78)) |
| Backend other components in `calculate_fblr` | rounded to 6 decimals ([calculation_service.py:109-112](backend/client/calculation_service.py:109)) |
| Backend `calculate_year_rate` | rounded to 2 decimals ([calculation_service.py:157](backend/client/calculation_service.py:157)) |
| Backend position/travel/ODC amounts | rounded to 2 decimals |
| Backend `calculate_averaged_fblr` returned values | **not rounded** (full float) |
| Frontend all values | **not explicitly rounded** — display components use `.toFixed(2)` / `Intl.NumberFormat` at render time only |

**Implication for tools**: run math in full precision; apply rounding only for final display. Two-decimal rounding mid-pipeline is what causes the small GSA reverse-engineer drift mentioned in § 6.3.

---

## 19. Self-test checklist for a Python port

When porting this document into agent tools, verify each of these against a real stored proposal:

- [ ] Grand total matches stored `proposals.total_cost` within $0.01
- [ ] For every BLS position: per-year `fblr × hours` equals `(dl+fringe+oh+ga+fee) × hours`
- [ ] For every GSA position: per-year cost equals `getGSARateForYear(pos, y, esc) * (1 - gsa_discount_rate) * hours`
- [ ] Subcontractor total: GSA subs sum to `Σ gsaRate(year) × (1 - discount) × hours` after passthrough+sub_fee is added back
- [ ] Travel: amount × (1 + ga), no fee
- [ ] ODC: amount × (1 + smh), no fee, no G&A
- [ ] Positions with `assigned_subcontractor_id` contribute to sub, not prime
- [ ] `location_type` selects correct OH rate (On-Site → `oh_onsite`, Off-Site → `oh_offsite`)
- [ ] Missing `location_type` defaults to `'On-Site'`
- [ ] Escalation uses `"{y}_to_{y+1}"` key format, compound
- [ ] `getEffectiveSalary` priority order matches § 4 exactly (GSA first, then multi-select avg, then custom_salary, then percentile wage, then selected_wage)
