# Export & Integration

Learn how to export your pricing proposals to Excel format for government contract submissions and further analysis.

## What This Category Covers

This section explains PriceIQ's Excel export functionality, including output format, formulas, worksheets, and integration with government contractor deliverables.

## Key Concepts

### Excel Export
- **Format**: .xlsx (Excel 2007+)
- **Multiple worksheets**: Summary, Prime Labor, Subcontractors, ODCs, Travel, Rates
- **Formulas**: Live Excel formulas (not static values)
- **Formatting**: Professional styling with headers, borders, color coding

### Export Scope
- **Full proposal**: All positions, subcontractors, ODCs, travel
- **Multi-year**: All Base Period + Option Years
- **Breakdowns**: FBLR cascade shown in separate columns
- **Totals**: Automatic sum formulas per year + grand total

### Use Cases
- **Government submissions**: Attach to proposal response
- **Internal review**: Share with pricing team for QA
- **Archive**: Save snapshot of pricing at submission time
- **Further analysis**: Import into financial systems

## Quick Start Guides

**New to exporting?** Start here:
1. [Exporting to Excel](01-exporting-excel.md) - Step-by-step export process (3 min)
2. [Understanding Excel Output Format](02-excel-format.md) - What each worksheet contains (7 min)

**Advanced:**
1. [Excel Formulas & Calculations](03-excel-formulas.md) - How formulas work in export (8 min)

## All Articles in This Category

### Export Tutorials
- [Exporting to Excel](01-exporting-excel.md) - How to export proposals (P0, Tutorial)

### Reference
- [Understanding Excel Output Format](02-excel-format.md) - Worksheet structure and layout (P0, Reference)
- [Excel Formulas & Calculations](03-excel-formulas.md) - Formula documentation (P1, Technical Reference)

## Common Workflows

### Exporting a Proposal to Excel
**Use case**: You finished pricing and need to attach Excel to your proposal submission.

1. Open pricing workspace for proposal
2. Click "Export" button (green, top-right toolbar)
3. System generates Excel file (may take 5-10 seconds)
4. Browser downloads file: `[ProposalName]_Pricing.xlsx`
5. Open file in Excel to verify
6. Attach to proposal or upload to government portal

**Result**: Excel file with all pricing data and formulas.

### Reviewing Excel Output
**Use case**: QA check before submission.

1. Open exported Excel file
2. Check "Summary" worksheet for totals
3. Review "Prime Labor" worksheet for position details
4. Verify "Subcontractors" worksheet (if applicable)
5. Check "ODCs" and "Travel" worksheets
6. Review "Rates" worksheet for indirect rate assumptions
7. Verify formulas calculate correctly (spot-check a few cells)

**Result**: Confidence that export matches workspace.

## Important Notes

### About Excel Format
- **File type**: .xlsx (Excel 2007+, compatible with Excel 2010, 2013, 2016, 2019, 365)
- **Formulas**: Live formulas (not values) - you can edit in Excel
- **Formatting**: Professional styling (headers, borders, alternating row colors)
- **Protection**: Sheets are NOT password-protected (fully editable)

### About Export Process
- **Timing**: Export takes 5-10 seconds for typical proposals
- **Server-side**: Generated on backend (not client-side)
- **Snapshot**: Export captures current state (not live-linked to PriceIQ)
- **Multiple exports**: You can export multiple times (creates new file each time)

### About Worksheet Structure
- **Summary**: High-level totals by year + grand total
- **Prime Labor**: All prime contractor positions with FBLR breakdown
- **Subcontractors**: Teaming partner labor (if any)
- **ODCs**: Other Direct Costs (equipment, materials, supplies)
- **Travel**: Travel expenses
- **Rates**: Indirect rates (Fringe, OH, G&A, Fee) and escalation rates

### About Formulas
- **FBLR Cascade**: Each indirect rate calculated from previous (Direct Labor → +Fringe → +OH → +G&A → +Fee)
- **Totals**: SUM formulas for year totals and grand totals
- **Escalation**: Year-over-year rates applied with compound formula
- **References**: Formulas reference cells within worksheet (no external links)

## Key Differences: PriceIQ vs Excel Export

| Aspect | PriceIQ Workspace | Excel Export |
|--------|-------------------|--------------|
| **Editing** | Inline editing, auto-save | Manual editing, save file |
| **Formulas** | Hidden (calculated backend) | Visible (Excel formulas) |
| **Data Source** | MongoDB database | Static Excel file |
| **Sync** | Real-time | Snapshot at export time |
| **Sharing** | In-app sharing + roles | Email file, no access control |
| **Format** | Web interface | Excel workbook |

## Related Documentation

**Pricing Workspace:**
- [Pricing Workspace Overview](../pricing-workspace/01-workspace-overview.md)
- [Overview Tab: Cost Analytics](../pricing-workspace/02-overview-tab.md)

**Advanced:**
- [Understanding FBLR Calculations](../advanced-workspace/02-fblr-calculations.md)
- [Indirect Rates: Fringe, OH, G&A, Fee](../advanced-workspace/03-indirect-rates.md)

**Multi-Year:**
- [Base Period vs Option Years](../multi-year-contracts/01-base-period-option-years.md)
- [Setting Contract Duration](../multi-year-contracts/02-contract-duration.md)

## Troubleshooting

**Export button not working?**
- Check browser allows pop-ups (may be blocked)
- Verify proposal has been saved (auto-save complete)
- Check browser console for errors
- Try different browser (Chrome, Firefox, Edge, Safari)

**Excel file won't open?**
- Verify you have Excel 2007+ (or compatible software like LibreOffice)
- Check file size (large proposals may take longer to open)
- Try opening in Excel Online (browser-based)
- Verify download completed (not partial file)

**Formulas showing #REF! or #VALUE! errors?**
- This shouldn't happen - contact support if you see errors
- Possible cause: Excel version incompatibility
- Workaround: Use "Paste Special → Values" to convert to static values

**Numbers don't match PriceIQ workspace?**
- Verify export is recent (not from old version of proposal)
- Check you're comparing same year columns
- Verify indirect rates match (see Rates worksheet)
- Contact support if discrepancy persists

**Missing worksheets in export?**
- Subcontractors worksheet only appears if you have subcontractors
- ODCs worksheet only appears if you have ODCs
- Travel worksheet only appears if you have travel expenses
- This is expected behavior (don't create empty worksheets)

**File size is too large (>10MB)?**
- Large proposals can create large files
- Consider splitting into multiple proposals if needed
- Excel has 1,048,576 row limit (won't be hit in practice)

---

**Last Updated**: January 15, 2026
**Category Priority**: P0 (Essential)
**Applies to**: All users exporting pricing proposals
