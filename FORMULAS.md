# PriceIQ Formulas

All rates are decimals (0.247 = 24.7%). All hours are numeric. Escalation key format: `"{y}_to_{y+1}"` (e.g., `"1_to_2"`).

---

## 1. Rates

| Key | Meaning |
|---|---|
| `fringe` | Fringe benefits rate |
| `oh_onsite` | OH rate for On-Site positions |
| `oh_offsite` | OH rate for Off-Site positions |
| `ga` | G&A rate (prime labor, also Travel) |
| `fee` | Prime labor fee |
| `smh` | Subcontract & Material Handling rate |
| `ga_passthrough` | G&A on subs |
| `sub_fee` | Fee on subcontractor labor |
| `ot_multiplier` | Overtime multiplier (default 1.5) |
| `surge_multiplier` | Surge premium (default 1.15) |

OH selection per position:
```
ohRate = (location_type == 'On-Site') ? oh_onsite : oh_offsite
```

---

## 2. Experience → Percentile

```
experience < 3        → 25th
3 ≤ experience < 6    → 50th
experience ≥ 6        → 75th
```

---

## 3. Effective Base Wage (BLS)

```
if isGSA: return getGSARateForYear(position, 1)     # hourly rate
if selected_salaries non-empty: return mean(selected_salaries)
if custom_salary: return custom_salary
if wage_{percentile}th > 0: return wage_{percentile}th
if selected_wage: return selected_wage
return 0
```

---

## 4. Escalation (compound)

```
escalatedValue(baseValue, targetYear):
    multiplier = 1
    for y in 1..(targetYear - 1):
        multiplier *= 1 + escalation_rates["{y}_to_{y+1}"]
    return baseValue * multiplier
```

---

## 5. BLS FBLR Cascade (per year)

```
wage   = escalatedValue(baseWage, year)
dlRate = wage / standard_fte_hours

fringe = dlRate * fringe
oh     = (dlRate + fringe) * ohRate
ga     = (dlRate + fringe + oh) * ga
fee    = (dlRate + fringe + oh + ga) * fee

FBLR        = dlRate + fringe + oh + ga + fee      # fee-inclusive
positionCost = FBLR * hours
```

---

## 6. GSA Positions

### 6.1 Rate lookup

```
getGSARateForYear(position, proposalYear):
    if gsa_custom_rate != null: return gsa_custom_rate
    contractYear = gsa_current_year + (proposalYear - 1)
    if gsa_rates_by_year[contractYear] exists: return that
    if contractYear > max(years): escalate from last known rate
    if contractYear < min(years): return earliest rate
```

### 6.2 Discount

```
gsaRate = getGSARateForYear(position, year) * (1 - gsa_discount_rate)
```

### 6.3 Actual cost

```
positionCost = gsaRate * hours                     # ALWAYS this, not FBLR × hours
```

### 6.4 Reverse-engineered breakdown (display only)

```
multiplier = (1 + fringe) * (1 + ohRate) * (1 + ga) * (1 + fee)
dlRate     = gsaRate / multiplier
fringe     = dlRate * fringe
oh         = (dlRate + fringe) * ohRate
ga         = (dlRate + fringe + oh) * ga
fee        = (dlRate + fringe + oh + ga) * fee
```

---

## 7. Averaged FBLR (across all years)

Weighted by actual hours worked.

### BLS
```
for year in 1..totalYears:
    hourlyRateThisYear = currentYearWage / standard_fte_hours
    totalSalary += hourlyRateThisYear * hours[year]
    totalHours  += hours[year]
    currentYearWage *= (1 + escalation["{year}_to_{year+1}"])

avgDL  = totalSalary / totalHours
fringe = avgDL * fringe
oh     = (avgDL + fringe) * ohRate
ga     = (avgDL + fringe + oh) * ga
fee    = (avgDL + fringe + oh + ga) * fee
FBLR   = avgDL + fringe + oh + ga + fee
```

### GSA
```
for year in 1..totalYears:
    gsaRate = getGSARateForYear(position, year) * (1 - gsa_discount_rate)
    totalAmount += gsaRate * hours[year]
    totalHours  += hours[year]

avgGsaRate = totalAmount / totalHours
# then reverse-engineer via § 6.4
```

---

## 8. Subcontractor Labor

### 8.1 Effective per-year rate

```
markupDivisor = 1 + smh + ga_passthrough + sub_fee

# GSA sub (original prime was GSA):
if origPrimePos is GSA:
    rate = (getGSARateForYear(origPrimePos, year) * (1 - gsa_discount_rate))
           / markupDivisor

# Explicit per-year:
elif rates_per_year[year] defined:
    rate = rates_per_year[year]

# Default:
else:
    rate = escalatedValue(subPos.rate, year)
```

### 8.2 Per-position cost

```
subBase += hours    * rate
subBase += otHours  * rate * ot_multiplier
```

### 8.3 Prime markups on sub

```
subcontractorTotal = Σ subBase (all subs, all years)
passthroughTotal   = subcontractorTotal * (smh + ga_passthrough)
subFeeTotal        = subcontractorTotal * sub_fee
```

### 8.4 Sub display rate (Prime Labor grid)

```
displayRate = escalatedRate * (1 + smh + ga_passthrough + sub_fee)
```

Breakdown rows (sum to `displayRate`):
```
Base Rate        = escalatedRate
S&MH             = escalatedRate * smh
G&A Passthrough  = escalatedRate * ga_passthrough
Sub Fee          = escalatedRate * sub_fee
```

---

## 9. Travel

Per item, per year:
```
amount = amount_per_year[year]
if escalate: amount = escalatedValue(amount, year)
travelCost = amount * (1 + ga)
```

No fee. No SMH.

---

## 10. ODC (Other Direct Costs)

Per item, per year:
```
amount = amount_per_year[year]
if escalate: amount = escalatedValue(amount, year)
odcCost = amount * (1 + smh)
```

No fee. No G&A.

---

## 11. Overtime

### 11.1 Prime OT
```
primeOT = otHours * FBLR * ot_multiplier            # FBLR is fee-inclusive
```

### 11.2 Sub OT
```
subOT = otHours * effectiveSubRate * ot_multiplier
```

---

## 12. Surge

```
if surge.percentage != null:
    primeLaborWithFee = primeLaborExFee + primeFee
    surgeTotal = primeLaborWithFee * surge.percentage * surge_multiplier
```

Base is fee-inclusive prime labor. Not applied to subs/travel/ODC. No fee added on top.

---

## 13. Grand Total

```
primeLaborExFee  = Σ_years (DL + Fringe + OH + G&A)          # skip assigned-to-sub
primeFee         = primeLaborExFee * fee
otTotal          = Σ_years primeOT

subcontractorTotal = Σ subBase (§ 8)
passthroughTotal   = subcontractorTotal * (smh + ga_passthrough)
subFeeTotal        = subcontractorTotal * sub_fee

travelTotal = Σ travelCost (§ 9)
odcTotal    = Σ odcCost    (§ 10)
surgeTotal  = § 12

grandTotal = primeLaborExFee + primeFee + otTotal
           + subcontractorTotal + passthroughTotal + subFeeTotal
           + travelTotal + odcTotal + surgeTotal
```

---

## 14. Position Splitting (FTE threshold)

```
if hours ≤ max_hours (default 1920):
    return [position]

fte_count = ceil(hours / max_hours)
# Split into fte_count positions, each with max_hours
# Last one gets the remainder
```

Multi-year with partial periods:
```
year_threshold(year) = (months_per_year[year] / 12) * max_hours
```

---

## 15. Forward Calculation (inputs → billable, end-to-end)

Direction: raw inputs → escalate → cascade indirects → billable rate → × hours → sum. No reverse engineering.

### 15.1 BLS position (base wage → cost)
```
wage   = baseWage × Π (1 + escalation["{y}_to_{y+1}"])   for y = 1..year-1
dlRate = wage / standard_fte_hours
fringe = dlRate                      × fringe_rate
oh     = (dlRate + fringe)           × ohRate
ga     = (dlRate + fringe + oh)      × ga_rate
fee    = (dlRate + fringe + oh + ga) × fee_rate
FBLR   = dlRate + fringe + oh + ga + fee
cost   = FBLR × hours
```

### 15.2 GSA position (contract rate → cost)
```
gsaRate = getGSARateForYear(position, year) × (1 − gsa_discount_rate)
cost    = gsaRate × hours
```

### 15.3 Subcontractor labor (base rate → billable → cost)
```
effectiveRate = escalated sub base rate  (or live GSA derive via § 8.1)
displayRate   = effectiveRate × (1 + smh + ga_passthrough + sub_fee)
cost          = (hours × effectiveRate) + (otHours × effectiveRate × ot_multiplier)
```

Prime markups applied once to total sub base:
```
passthroughTotal = subBase × (smh + ga_passthrough)
subFeeTotal      = subBase × sub_fee
```

### 15.4 Travel
```
amount     = escalated if item.escalate
travelCost = amount × (1 + ga)
```

### 15.5 ODC
```
amount  = escalated if item.escalate
odcCost = amount × (1 + smh)
```

### 15.6 Overtime
```
primeOT = otHours × FBLR          × ot_multiplier
subOT   = otHours × effectiveRate × ot_multiplier
```

### 15.7 Surge
```
surgeTotal = (primeLaborExFee + primeFee) × surge.percentage × surge_multiplier
```

### 15.8 Grand total assembly
```
grandTotal = primeLaborExFee + primeFee + otTotal
           + subBase + passthroughTotal + subFeeTotal
           + travelTotal + odcTotal + surgeTotal
```

---

## 16. Key Invariants

- **FBLR is always fee-inclusive**: `dl + fringe + oh + ga + fee`
- **GSA cost** = `gsaRate × hours`, never `FBLR × hours`
- **Positions with `assigned_subcontractor_id`** count under the subcontractor, not prime
- **Travel** gets G&A, no fee, no SMH
- **ODC** gets SMH, no fee, no G&A
- **Surge base** is fee-inclusive prime labor
- **OH selection** by `location_type`: On-Site → `oh_onsite`, Off-Site → `oh_offsite`
- **Escalation** is compound year-over-year, using `"{y}_to_{y+1}"` keys
