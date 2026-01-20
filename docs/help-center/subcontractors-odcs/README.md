# Subcontractors & ODCs

Learn how to manage teaming arrangements and direct costs in your government contract proposals.

## What This Category Covers

This section explains how to work with **subcontractor labor**, **Other Direct Costs (ODCs)**, and **travel expenses** in PriceIQ. These are common elements in government contractor pricing when you're partnering with other companies or need to include non-labor costs.

## Key Concepts

### Subcontractor Labor
When you team with other companies to fulfill contract requirements, their labor is priced differently than your prime contractor labor:
- **Different rate structure**: Subcontractor positions use a base hourly rate plus passthrough rates (S&MH and G&A)
- **Lower fee**: Subcontractor labor typically carries a 3% fee vs 8% for prime labor
- **Separate tracking**: Subcontractor positions are organized by company in dedicated tabs

### Other Direct Costs (ODCs)
Non-labor costs required to perform the contract:
- **Categories**: Equipment, Materials, Supplies, Other
- **Passthrough**: S&MH (3%) applied to all ODCs
- **Escalation**: Optional year-over-year increases

### Travel
Travel-related expenses for contract performance:
- **Separate category**: Travel is tracked separately from ODCs
- **Different passthrough**: G&A applied (NOT S&MH)
- **Escalation**: Optional year-over-year increases

## Quick Start Guides

**New to subcontractors?** Start here:
1. [Understanding Subcontractors](01-understanding-subcontractors.md) - Learn prime vs sub labor (2 min)
2. [Converting to Subcontractor](02-converting-to-subcontractor.md) - Turn prime positions into sub positions (5 min)
3. [Managing Subcontractor Positions](04-managing-subcontractor-positions.md) - Edit hours and rates (3 min)

**Working with direct costs?**
1. [Adding ODCs](07-adding-odcs.md) - Add equipment, materials, supplies (3 min)
2. [Adding Travel](08-adding-travel.md) - Add travel expenses (3 min)
3. [Understanding Passthrough Rates](06-passthrough-rates.md) - Learn how S&MH and G&A work (4 min)

## All Articles in This Category

### Understanding Subcontractors
- [Understanding Subcontractor Labor](01-understanding-subcontractors.md) - Prime vs sub labor differences (P1, Explainer)

### Working with Subcontractors
- [Converting Prime Positions to Subcontractors](02-converting-to-subcontractor.md) - Step-by-step conversion workflow (P1, Tutorial)
- [Adding Subcontractors Manually](03-adding-subcontractors.md) - Create empty subcontractor companies (P1, Tutorial)
- [Managing Subcontractor Positions](04-managing-subcontractor-positions.md) - Edit hours, rates, delete positions (P1, Tutorial)
- [Transferring Hours Between Subcontractors](05-transferring-hours.md) - Move work between teaming partners (P2, Advanced Tutorial)

### Passthrough & Fees
- [Understanding Passthrough Rates (S&MH, G&A)](06-passthrough-rates.md) - How prime applies handling and G&A to sub costs (P1, Explainer)
- [Understanding Fee Calculations](09-fee-calculations.md) - Prime labor fee (8%) vs subcontractor fee (3%) (P1, Reference)

### Direct Costs
- [Adding Other Direct Costs (ODCs)](07-adding-odcs.md) - Add equipment, materials, supplies (P1, Tutorial)
- [Adding Travel Costs](08-adding-travel.md) - Add travel expenses (P1, Tutorial)

## Common Workflows

### Converting a Prime Position to a Subcontractor
**Use case**: You have a Software Engineer position that will be performed by a teaming partner.

1. Open pricing workspace
2. Click three-dot menu on the position row
3. Select "Convert to Subcontractor"
4. Choose existing subcontractor or create new
5. Allocate hours (can be partial or full)
6. Accept suggested rate or enter custom rate
7. Click "Convert to Subcontractor"
8. System saves immediately and reloads proposal

**Result**: Position moves to Subcontractor tab, original position hours are reduced (or deleted if 100% allocated).

### Adding Direct Costs to Your Proposal
**Use case**: Contract requires travel to customer site and purchase of software licenses.

**For Travel:**
1. Go to "Other" tab in workspace
2. Click "Add Travel"
3. Enter description (e.g., "Monthly site visits")
4. Enter amounts per year
5. Check "Apply Escalation" if travel costs increase annually
6. Click "Save"

**For ODCs:**
1. Go to "Other" tab in workspace
2. Click "Add ODC"
3. Select category (Equipment, Materials, Other)
4. Enter description (e.g., "Software licenses")
5. Enter amounts per year
6. Check "Apply Escalation" if costs increase annually
7. Click "Save"

**Result**: Travel and ODCs appear in "Other" tab, automatically included in Overview calculations with appropriate passthrough rates.

## Key Differences: Prime vs Subcontractor Labor

| Aspect | Prime Labor | Subcontractor Labor |
|--------|-------------|---------------------|
| **Rate Calculation** | FBLR (Direct Labor + Fringe + OH + G&A + Fee) | Base Rate × (1 + S&MH) × (1 + G&A) × (1 + Fee) |
| **Indirect Rates** | Fringe, OH, G&A applied to direct labor | S&MH (3%), G&A passthrough applied to base rate |
| **Fee** | 8% (typical prime fee) | 3% (typical subcontractor fee) |
| **Location** | Prime Labor tab | Subcontractor-specific tabs |
| **Wage Source** | BLS OEWS or GSA schedules | Negotiated with subcontractor |
| **Escalation** | Applied to annual wage | Applied to base hourly rate |

## Key Differences: ODCs vs Travel

| Aspect | ODCs | Travel |
|--------|------|--------|
| **Categories** | Equipment, Materials, Supplies, Other | Single category (Travel) |
| **Passthrough** | S&MH (3%) applied | G&A applied (NOT S&MH) |
| **Description** | Optional (required for "Other" category) | Optional but recommended |
| **Typical Use** | Hardware, software, consumables | Airfare, lodging, per diem |
| **Tab Location** | "Other" tab | "Other" tab |

## Important Notes

### About Subcontractor Conversion
- **Immediate save**: Converting a position triggers an immediate save and proposal reload (bypasses auto-save)
- **Suggested rate**: System calculates suggested base rate by reverse-engineering from prime FBLR (removes Fee and S&MH)
- **Partial allocation**: You can allocate only some hours to a subcontractor, keeping the rest as prime labor
- **Multi-year**: Hours can be allocated differently per year (e.g., sub performs only Base Year, prime takes Option Years)

### About Passthrough Rates
- **S&MH (Subcontractor & Material Handling)**: 3% handling rate applied to subcontractor labor AND ODCs
- **G&A Passthrough**: Separate G&A rate applied to subcontractor labor (different from prime G&A)
- **Travel**: Gets G&A only (no S&MH)
- **Configured in Rates Reference**: Both S&MH and G&A passthrough are editable in the Rates Reference table

### About Escalation
- **Optional**: Both ODCs and Travel have an "Apply Escalation" checkbox
- **Uses same rates**: Escalation rates from Rates Reference table (e.g., 2.72% Year 1→2)
- **Compound escalation**: Applied cumulatively (Year 3 = Base × (1 + rate1→2) × (1 + rate2→3))
- **Independent**: Each ODC and Travel item can have escalation on or off

## Related Documentation

**Pricing Workspace Basics:**
- [Pricing Workspace Overview](../pricing-workspace/01-workspace-overview.md)
- [Overview Tab: Cost Analytics](../pricing-workspace/02-overview-tab.md)
- [Auto-Save Behavior](../pricing-workspace/09-auto-save.md)

**Advanced Features:**
- [Understanding FBLR Calculations](../advanced-workspace/02-fblr-calculations.md)
- [Indirect Rates: Fringe, OH, G&A, Fee](../advanced-workspace/03-indirect-rates.md)
- [Escalation Rates](../advanced-workspace/05-escalation-rates.md)

**Multi-Year Contracts:**
- [Base Period vs Option Years](../multi-year-contracts/01-base-period-option-years.md)
- [Setting Contract Duration](../multi-year-contracts/02-contract-duration.md)

**Export:**
- [Exporting to Excel](../export-integration/01-exporting-excel.md)
- [Understanding Excel Output Format](../export-integration/02-excel-format.md)

## Troubleshooting

**Subcontractor not appearing after conversion?**
- Check the Subcontractor tabs - newly converted positions appear there
- Refresh the page if tabs don't update immediately
- Verify the conversion completed (check browser console for errors)

**Passthrough calculations seem wrong?**
- Verify S&MH and G&A Passthrough rates in Rates Reference table
- Remember: Travel gets G&A only (not S&MH)
- ODCs get S&MH only (G&A is not applied to ODCs)
- Subcontractor labor gets both S&MH and G&A Passthrough

**Can't allocate more hours than available?**
- The system limits allocation to the original position's hours per year
- If you need more hours, edit the original position first (before converting)
- Or convert a different position with more hours

**Suggested rate seems too low/high?**
- Suggested rate is reverse-calculated from prime FBLR
- It removes Fee (8%) and S&MH (3%) to get a base rate
- You can always enter a custom rate instead
- Check that indirect rates in Rates Reference are correct

---

**Last Updated**: January 15, 2026
**Category Priority**: P1 (Essential)
**Applies to**: All users working with teaming arrangements or direct costs
