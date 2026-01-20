# Multi-Year Contracts & Extensions

Learn how to handle government contracts with multiple performance periods, option years, and custom contract durations.

## What This Category Covers

This section explains how to configure contract duration, handle option years, and manage partial-year extensions in PriceIQ. Most government contracts span multiple years with a base period plus optional extension years.

## Key Concepts

### Base Period vs Option Years
- **Base Period**: Year 1 (guaranteed work)
- **Option Years**: Years 2-10 (at government's discretion to exercise)
- **Escalation**: Year-over-year rate increases (compound)

### Contract Duration
- Default: 5 years (1 Base + 4 Options)
- Maximum: 10 years
- Customizable per proposal

### Partial Years
- Handle 6-month, 3-month, or custom extensions
- Pro-rated hours and costs
- Custom period labels (e.g., "6-Month Extension")

## Quick Start Guides

**New to multi-year contracts?** Start here:
1. [Understanding Base Period vs Option Years](01-base-period-option-years.md) - Core concepts (5 min)
2. [Setting Contract Duration](02-contract-duration.md) - Add/remove years (4 min)

**Working with extensions?**
1. [Partial Year Extensions](03-partial-year-extensions.md) - Handle 6-month or custom periods (6 min)
2. [Adjusting Months Per Year](04-adjusting-months-per-year.md) - Customize period lengths (5 min)

## All Articles in This Category

### Understanding Contract Structure
- [Understanding Base Period vs Option Years](01-base-period-option-years.md) - Core contract concepts (P0, Explainer)

### Configuration
- [Setting Contract Duration](02-contract-duration.md) - Add or remove contract years (P1, Tutorial)
- [Partial Year Extensions](03-partial-year-extensions.md) - Handle custom-duration extensions (P1, Tutorial)
- [Adjusting Months Per Year](04-adjusting-months-per-year.md) - Customize months per period (P1, Tutorial)

## Common Workflows

### Adding an Option Year
**Use case**: Your 5-year contract needs to become a 6-year contract.

1. Open pricing workspace
2. Click "Settings" icon (gear) in workspace toolbar
3. Navigate to "Contract Duration" section
4. Click "Add Year" button
5. System adds "Option Year 5" column
6. Enter hours for new year (or leave blank)
7. Auto-save persists changes

**Result**: New year column appears in all grids, escalation applies automatically.

### Creating a 6-Month Extension
**Use case**: Contract has a 6-month extension after Year 5.

1. Open pricing workspace
2. Click "Settings" → "Contract Duration"
3. Click "Add Year"
4. Change year label to "6-Month Extension"
5. Change months from 12 to 6
6. Enter hours (typically half of annual hours)
7. Click "Save"

**Result**: Extension period appears with pro-rated calculations.

## Important Notes

### About Escalation
- **Automatic**: Escalation rates apply year-over-year automatically
- **Compound**: Year 3 = Year 1 × (1 + rate₁₋₂) × (1 + rate₂₋₃)
- **Configurable**: Edit escalation rates in Rates Reference table
- **Applies to**: Labor costs, subcontractor costs, ODCs (if enabled), Travel (if enabled)

### About Partial Years
- **Pro-rated**: System doesn't auto-adjust hours (you must enter appropriate hours)
- **Labels**: You can rename periods (e.g., "Base Period" → "Transition Period")
- **Calculations**: All cost calculations use months specified, not assumed 12 months

### About Option Years
- **Not Guaranteed**: Government may choose not to exercise options
- **Priced Separately**: Each option year typically priced separately in RFP response
- **Exercise Process**: Government notifies contractor before option period starts

## Related Documentation

**Pricing Workspace Basics:**
- [Pricing Workspace Overview](../pricing-workspace/01-workspace-overview.md)
- [Overview Tab: Cost Analytics](../pricing-workspace/02-overview-tab.md)

**Advanced Features:**
- [Escalation Rates](../advanced-workspace/05-escalation-rates.md)
- [Understanding FBLR Calculations](../advanced-workspace/02-fblr-calculations.md)

**Export:**
- [Exporting to Excel](../export-integration/01-exporting-excel.md)
- [Understanding Excel Output Format](../export-integration/02-excel-format.md)

## Troubleshooting

**New year column not appearing?**
- Refresh the page after adding year
- Check auto-save completed (green checkmark)
- Verify no browser console errors

**Escalation not applying to new year?**
- Check Rates Reference table has escalation rate defined
- Verify escalation rates are non-zero
- Refresh workspace to trigger recalculation

**Partial year calculations seem wrong?**
- Verify months are set correctly (not defaulting to 12)
- Check hours entered match pro-rated expectation
- Remember: system doesn't auto-adjust hours, you must enter them

**Can't add more than 10 years?**
- PriceIQ limits contracts to 10 years maximum
- If you need more, split into multiple proposals
- Contact support for enterprise customization

---

**Last Updated**: January 15, 2026
**Category Priority**: P1 (Important)
**Applies to**: All users working with multi-year contracts
