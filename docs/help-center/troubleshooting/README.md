# Troubleshooting & Common Issues

Find solutions to common problems with document processing, pricing calculations, exports, and account management.

## What This Category Covers

This section provides solutions to frequently encountered issues:
- **Processing Errors**: Upload failures, parsing errors, extraction issues
- **Calculation Problems**: FBLR mismatches, escalation issues, rate problems
- **Workspace Issues**: Grid not updating, auto-save failures, missing positions
- **Export Problems**: Excel generation errors, formula issues, missing data
- **Account/Login**: Authentication failures, invitation issues, password resets
- **Performance**: Slow loading, timeouts, browser compatibility

## Quick Start: Common Issues

**Most common issues:**
- [Document Processing Failed](01-processing-errors.md) - Upload and extraction errors (6 min)
- [FBLR Calculations Don't Match](02-calculation-mismatches.md) - Rate calculation issues (7 min)
- [Auto-Save Not Working](03-auto-save-issues.md) - Changes not persisting (5 min)
- [Excel Export Failed](04-export-errors.md) - Export generation errors (5 min)

**Account issues:**
- [Login Problems](05-login-issues.md) - Can't sign in (4 min)
- [Invitation Not Received](06-invitation-issues.md) - Email invitation missing (3 min)

**Performance:**
- [Slow Performance](07-performance-issues.md) - Workspace loading slowly (6 min)
- [Browser Compatibility](08-browser-compatibility.md) - Supported browsers (3 min)

## All Articles in This Category

### Document Processing
- [Document Processing Failed](01-processing-errors.md) - Upload and extraction troubleshooting (P0, Troubleshooting)

### Calculations
- [FBLR Calculations Don't Match](02-calculation-mismatches.md) - Rate calculation verification (P0, Troubleshooting)

### Workspace
- [Auto-Save Not Working](03-auto-save-issues.md) - Persistence issues (P1, Troubleshooting)

### Export
- [Excel Export Failed](04-export-errors.md) - Export generation troubleshooting (P1, Troubleshooting)

### Account/Login
- [Login Problems](05-login-issues.md) - Authentication issues (P0, Troubleshooting)
- [Invitation Not Received](06-invitation-issues.md) - Email invitation problems (P1, Troubleshooting)

### Performance
- [Slow Performance](07-performance-issues.md) - Speed optimization (P1, Troubleshooting)
- [Browser Compatibility](08-browser-compatibility.md) - Supported browsers (P1, Reference)

### Advanced
- [Data Recovery & Backups](09-data-recovery.md) - Recovering lost work (P2, Advanced)
- [API & Integration Issues](10-api-integration.md) - Technical integration (P2, Technical)

## Common Workflows

### Fixing a Failed Document Upload
**Use case**: Upload failed with error message.

1. Read error message carefully (usually indicates specific issue)
2. Common causes:
   - **File too large**: Max 2MB per file (compress PDF or split document)
   - **Timeout**: Large documents take longer (try again, may succeed)
   - **Invalid format**: Only PDF, DOCX, XLSX, XLS supported
   - **Parsing error**: Document structure unrecognized (try different format)
3. Try fixes:
   - Re-upload (may succeed on retry)
   - Convert to PDF if Word/Excel
   - Split large documents into multiple files
   - Remove images/graphics (reduces file size)
4. If still failing, contact support with:
   - Error message screenshot
   - File type and size
   - Document description (e.g., "RFP with 20 labor categories")

**See Also**: [Document Processing Failed](01-processing-errors.md)

### Verifying FBLR Calculations
**Use case**: Excel export totals don't match workspace totals.

1. Check indirect rates (Fringe, OH, G&A, Fee):
   - Open Rates panel in workspace
   - Verify rates match your expectations
   - Check for On-Site vs Off-Site OH rate differences
2. Enable Advanced Mode:
   - Click "Advanced Mode" toggle
   - Expand position to see FBLR breakdown
   - Manually calculate: DL + Fringe + OH + G&A + Fee
3. Compare workspace to Excel:
   - Open Excel export
   - Find same position in Prime Labor worksheet
   - Compare FBLR column (should match exactly)
4. Check for:
   - **GSA positions**: Use GSA rate, not calculated FBLR
   - **Escalation**: Year 2+ rates are escalated from Year 1
   - **Location type**: On-Site uses different OH rate than Off-Site

**See Also**: [FBLR Calculations Don't Match](02-calculation-mismatches.md)

### Recovering Unsaved Work
**Use case**: Browser crashed before auto-save completed.

1. Check auto-save status:
   - Last saved timestamp shown in workspace (bottom-left or top toolbar)
   - If recent (< 2 minutes ago), most work is saved
2. Reload page:
   - Press F5 or click Refresh
   - Workspace loads last saved state from MongoDB
3. If work is missing:
   - Check browser console for auto-save errors
   - Verify network connection (auto-save requires connectivity)
   - Check MongoDB connection (backend health)
4. Prevention:
   - Watch for "Saved" indicator (green checkmark)
   - Wait 2 seconds between edits (debounce delay)
   - Manually trigger save by clicking out of cell

**See Also**: [Auto-Save Not Working](03-auto-save-issues.md)

## Important Notes

### About Error Messages
- **Read Carefully**: Error messages usually indicate specific problem
- **Screenshot**: Capture error messages for support requests
- **Browser Console**: Press F12 to see developer console (may have additional details)
- **Network Tab**: Check for failed API requests (F12 → Network tab)

### About Auto-Save
- **2-Second Debounce**: Changes persist 2 seconds after you stop typing
- **Network Required**: Auto-save requires internet connection
- **Indicator**: Watch for "Saved" checkmark (green) or "Saving..." spinner
- **Manual Save**: Click out of cell to trigger immediate save

### About Calculations
- **Backend Validation**: All calculations performed server-side (not client-side)
- **Floating Point**: Minor rounding differences (±$0.01) are normal
- **Compound Escalation**: Year 3 = Year 1 × (1 + rate₁₋₂) × (1 + rate₂₋₃)
- **GSA Exception**: GSA positions don't recalculate when indirect rates change

### About Browser Compatibility
- **Recommended**: Chrome 90+, Firefox 88+, Edge 90+, Safari 14+
- **Required**: JavaScript enabled, cookies enabled
- **Not Supported**: Internet Explorer (EOL), old mobile browsers
- **Best Experience**: Desktop browsers (mobile responsive but limited features)

## When to Contact Support

Contact support@priceiq.com if:

**Processing Issues**:
- Document upload fails repeatedly (after trying fixes)
- Extraction produces no results (empty proposal)
- Processing never completes (stuck for 10+ minutes)

**Calculation Issues**:
- FBLR mismatch persists (after verifying rates and formulas)
- Escalation not applying correctly
- Totals sum incorrectly (Excel or workspace)

**Data Loss**:
- Auto-save indicator shows "Saved" but changes are lost on reload
- Entire proposal disappeared
- Position data corrupted or wrong

**Account Issues**:
- Can't login (password reset doesn't work)
- Invitation expired and need resend (admin not available)
- Organization ownership transfer needed

**Performance Issues**:
- Workspace unusable (hangs, crashes, extremely slow)
- Export never completes (stuck forever)
- Browser compatibility issues (modern browser still failing)

## Providing Information to Support

When contacting support, please include:

**Always Include**:
- Your email address (account identifier)
- Organization name
- Proposal name (if applicable)
- Browser and version (e.g., Chrome 120.0)
- Operating system (Windows 11, macOS 14.2, etc.)

**For Errors**:
- Screenshot of error message
- Browser console log (F12 → Console tab → screenshot)
- Steps to reproduce (what you did before error)
- Timestamp of when error occurred

**For Calculation Issues**:
- Position details (labor category, hours, rate)
- Expected result vs actual result
- Screenshot of FBLR breakdown (Advanced Mode)
- Indirect rates used

**For Data Loss**:
- Last known good state (when did you last see correct data)
- What changes you made before loss
- Auto-save status (was "Saved" shown?)
- Network status (were you online?)

## Related Documentation

**Getting Started:**
- [Your First Proposal: 5-Minute Quick Start](../getting-started/03-first-proposal.md)
- [Understanding Your Dashboard](../getting-started/04-understanding-dashboard.md)

**Processing:**
- [How Document Processing Works](../creating-proposals/01-document-processing.md)
- [Handling Processing Errors](../creating-proposals/05-handling-errors.md)

**Calculations:**
- [Understanding FBLR Calculations](../advanced-workspace/02-fblr-calculations.md)
- [Indirect Rates: Fringe, OH, G&A, Fee](../advanced-workspace/03-indirect-rates.md)

**Workspace:**
- [Auto-Save Behavior](../pricing-workspace/09-auto-save.md)
- [Advanced Mode: FBLR Breakdown](../advanced-workspace/01-advanced-mode.md)

**Export:**
- [Exporting to Excel](../export-integration/01-exporting-excel.md)
- [Understanding Excel Output Format](../export-integration/02-excel-format.md)

---

**Last Updated**: January 15, 2026
**Category Priority**: P1 (Important for all users)
**Applies to**: All users encountering issues
