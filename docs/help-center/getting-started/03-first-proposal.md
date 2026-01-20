# Your First Proposal: 5-Minute Quick Start

**Article Type:** Tutorial | **Priority:** P0 | **Reading Time:** 5-7 minutes

Complete tutorial walking through creating your first cost proposal from start to finish.

---

## What You'll Learn

By the end of this tutorial, you'll have:
- Uploaded your first RFP document
- Tracked AI processing progress
- Reviewed extracted positions and pricing
- Navigated the pricing workspace
- Exported results to Excel

**Time Required:** 5-10 minutes (depending on document size)

---

## Before You Start

**What You Need:**
- PriceIQ account (see [Creating Your Account](02-creating-account.md))
- RFP document (PDF, DOCX, or XLSX)
- Internet connection

**Supported Document Types:**
- RFPs (Request for Proposals)
- SOWs (Statements of Work)
- PWS (Performance Work Statements)
- Labor category matrices
- CLIN descriptions

---

## Step 1: Navigate to Upload Page

### From Dashboard

**Action:**
1. **Login** to PriceIQ (if not already logged in)
2. **Dashboard** loads automatically after login
3. **Click** "New Proposal" button (blue, top-right corner)

**What You'll See:**
- Upload page with drag-and-drop area
- "Proposal Name" input field at top
- "Solicitation Number" input field (optional)
- File upload area (large dashed rectangle)
- "Browse Files" button (blue, center)
- "Process Documents" button (blue, bottom-right, initially disabled)

**Location:** `/proposals/new`

---

## Step 2: Enter Proposal Details

### Proposal Name (Required)

**Field Location:** Top of page, first input field

**Action:**
1. **Click** in "Proposal Name" field
2. **Type** a descriptive name

**Best Practices:**
- Include customer name: "Navy NMCI Support"
- Include year: "GSA Schedule 70 - 2025"
- Include identifier: "RFP-2025-001"

**Examples:**
- ✓ "Navy NMCI IT Support - Base Year 2025"
- ✓ "Air Force C4ISR RFP FA8773-25-R-0001"
- ✗ "Proposal" (too vague)
- ✗ "Test" (not descriptive)

---

### Solicitation Number (Optional)

**Field Location:** Below Proposal Name

**Action:**
1. **Click** in "Solicitation Number" field (optional)
2. **Type** RFP/solicitation number if available

**Examples:**
- FA8773-25-R-0001
- N00178-25-R-1234
- GS-00F-0001X

**Note:** This field is for your reference only (helps with searching/filtering later).

---

## Step 3: Upload Documents

### Drag-and-Drop Method

**Action:**
1. **Locate** your RFP file on your computer
2. **Drag** file over the dashed rectangle upload area
3. **Drop** file when area highlights green
4. **File appears** in upload list below

---

### Browse Files Method

**Action:**
1. **Click** "Browse Files" button (blue, center of upload area)
2. **File picker** opens (native OS dialog)
3. **Navigate** to your RFP document
4. **Select** file(s) - can select multiple with Ctrl/Cmd+Click
5. **Click** "Open"
6. **Files appear** in upload list below

---

### Upload List

**What You'll See:**
- File name (e.g., "RFP-NMCI-2025.pdf")
- File size (e.g., "1.2 MB")
- File type icon (PDF, Word, Excel)
- **Remove button** (×) to remove file before processing

**Supported Formats:**
- PDF (.pdf)
- Word (.docx)
- Excel (.xlsx, .xls)

**Size Limits:**
- Max 2MB per file
- If larger: compress PDF or split into multiple files

**Multiple Files:**
- You can upload multiple files at once
- All files processed together into single proposal
- Useful for RFP split across multiple PDFs

---

## Step 4: Start Processing

### Process Documents Button

**Location:** Bottom-right of upload page

**Action:**
1. **Verify** all files uploaded (check upload list)
2. **Verify** proposal name entered
3. **Click** "Process Documents" button (blue, becomes enabled after file upload)

**What Happens:**
- Button shows spinner: "Processing..."
- Page redirects to processing status page
- AI pipeline starts: Parse → Extract → SOC Match → Wage Lookup → Calculate

---

## Step 5: Track Processing Progress

### Status Page

**What You'll See:**
- Large progress bar (0% → 100%)
- Current status message:
  - "Parsing documents..." (10-20 seconds)
  - "Extracting positions..." (20-40 seconds)
  - "Matching SOC codes..." (10-20 seconds)
  - "Calculating pricing..." (5-10 seconds)
  - "Finalizing proposal..." (5 seconds)
- Estimated time remaining (dynamic, updates)
- **Do not close this page** warning

**Processing Time:**
- **Small documents** (1-5 positions): 30-60 seconds
- **Medium documents** (6-20 positions): 1-2 minutes
- **Large documents** (20+ positions): 2-5 minutes

**Behind the Scenes:**
- LlamaExtract parses PDFs/Word/Excel to JSON
- 10 parallel AI agents extract job positions
- FAISS vector search matches to SOC codes
- MongoDB retrieves BLS OEWS wage data
- System calculates FBLR with indirect rates

---

### Processing Complete

**Success Indicator:**
- Progress bar reaches 100%
- Message: "Processing complete! Redirecting to pricing workspace..."
- Page auto-redirects after 2 seconds

**Auto-Redirect:** Takes you to pricing workspace with extracted data loaded

---

## Step 6: Review Extracted Positions

### Pricing Workspace Loads

**What You'll See:**
- **5-tab interface** at top:
  1. Source Files (uploaded PDFs/docs)
  2. Overview (cost summary)
  3. **Pricing Workspace** (active tab, Excel-like grid)
  4. Wage Data (SOC codes and percentiles)
  5. Other (ODCs, Travel) - may appear later

- **Excel-like grid** showing extracted positions:
  - Labor Category column (frozen, left)
  - SOC Code column
  - Experience Level column
  - Base Period hours, rates
  - Option Year columns (if multi-year)
  - Total Amount column (frozen, right)

**Example Row:**
| Labor Category | SOC Code | Experience | Base Period Hours | Base Period Rate | Base Period Amount |
|---------------|----------|------------|-------------------|------------------|-------------------|
| Software Engineer III | 15-1252 | Senior (5+ years) | 2080 | $68.10 | $141,648 |

---

### Quick Review Checklist

**Verify Extracted Data:**
1. **Position count**: Does number of rows match RFP?
2. **Labor categories**: Are job titles correct?
3. **Hours**: Do hours match RFP requirements?
4. **SOC codes**: Do occupational codes make sense? (hover for full title)
5. **Experience levels**: Junior, Mid-Level, Senior match job descriptions?
6. **Rates**: Are hourly rates reasonable for roles?

**Common Issues:**
- **Missing positions**: RFP had 10 jobs, only 8 extracted → AI missed some (add manually)
- **Wrong SOC code**: "Engineer" matched to Mechanical instead of Software → Use "Change SOC Code"
- **Wrong hours**: RFP said 1920, extracted as 2080 → Edit cell inline
- **Duplicate positions**: Same job listed twice → Delete one (see [Deleting Positions](../pricing-workspace/08-deleting-positions.md))

---

## Step 7: Navigate the Interface

### Overview Tab

**Action:** Click "Overview" tab (tab 2 of 5)

**What You'll See:**
- **Total Proposal Cost** (large number, top-center)
- **Cost by Year** bar chart (Base Period vs Option Years)
- **Cost Breakdown** pie chart (Labor, Subcontractors, ODCs, Travel, Passthrough)
- **Summary Table**:
  - Total Labor Cost
  - Total Subcontractor Cost
  - Total ODCs
  - Total Travel
  - Passthrough Costs (S&MH, G&A)
  - Grand Total

**Purpose:** High-level analytics and visual summary

---

### Wage Data Tab

**Action:** Click "Wage Data" tab (tab 4 of 5)

**What You'll See:**
- List of all positions
- Detailed wage breakdown per position:
  - SOC code and full title
  - Area name (geographic location)
  - Employment count (sample size)
  - All percentiles (25th, 50th, 75th, 90th)
  - Selected percentile (highlighted)
  - Annual wage
  - Hourly wage

**Purpose:** Verify wage data source and accuracy

---

### Back to Pricing Workspace

**Action:** Click "Pricing Workspace" tab (tab 3 of 5)

**Note:** This is your main editing interface (you'll spend most time here)

---

## Step 8: Make Basic Edits (Optional)

### Edit Hours Inline

**Action:**
1. **Click** cell in hours column (e.g., "Base Period Hours")
2. **Type** new value (e.g., change 2080 to 1920)
3. **Press Enter** or **click outside cell**
4. **Auto-save** persists after 2 seconds
5. **Watch** for "Saved" checkmark (green, top-right or bottom-left)

**Result:** Total cost updates automatically

---

### Edit Labor Category Name

**Action:**
1. **Click** cell in "Labor Category" column
2. **Edit** text (e.g., "Software Engineer III" → "Software Engineer IV")
3. **Press Enter**
4. **Auto-save** persists

---

### Change SOC Code (Advanced)

**Action:**
1. **Click** three-dot menu (⋮) on position row (leftmost column)
2. **Select** "Change SOC Code" from dropdown
3. **Search** for new SOC code (e.g., "Software Developer")
4. **Click** desired SOC code in results
5. **System** updates wage data automatically
6. **FBLR** recalculates with new wages

**See Also:** [Changing SOC Codes](../advanced-workspace/08-changing-soc-codes.md)

---

## Step 9: Export to Excel

### Export Button

**Location:** Top-right toolbar, green button labeled "Export"

**Action:**
1. **Click** "Export" button (green)
2. **Processing** spinner appears (5-10 seconds)
3. **Excel file** downloads automatically to your browser's download folder
4. **Filename**: `[ProposalName]_Pricing.xlsx`

**Example:** `Navy NMCI Support - Base Year 2025_Pricing.xlsx`

---

### Open Excel File

**Action:**
1. **Navigate** to Downloads folder
2. **Double-click** Excel file
3. **Excel opens** with multiple worksheets

**Worksheets:**
- **Summary**: High-level totals by year
- **Prime Labor**: All positions with FBLR breakdown
- **Rates**: Indirect rates (Fringe, OH, G&A, Fee)
- **(Optional) Subcontractors**: If you have subcontractors
- **(Optional) ODCs**: If you have ODCs
- **(Optional) Travel**: If you have travel expenses

---

### Review Excel Output

**Quick Check:**
1. **Summary tab**: Verify grand total matches workspace Overview
2. **Prime Labor tab**: Verify position count and rates
3. **Rates tab**: Verify indirect rates match your organization settings

**Result:** Professional Excel deliverable ready for proposal attachment

---

## Step 10: Save and Continue Later

### Auto-Save is Already Working

**No manual save required!**

- All changes auto-save after 2 seconds
- Watch for "Saved" indicator (green checkmark)
- Safe to close browser anytime after "Saved" appears

---

### Access Saved Proposal Later

**Action:**
1. **Login** to PriceIQ
2. **Dashboard** loads with proposals list
3. **Find** your proposal by name (search bar at top if needed)
4. **Click** proposal card to open

**Result:** Pricing workspace loads with all your data

---

## Congratulations!

You've successfully:
- ✓ Created your first proposal
- ✓ Uploaded and processed documents with AI
- ✓ Reviewed extracted positions
- ✓ Navigated the pricing workspace
- ✓ Exported to Excel

---

## Next Steps

**Learn More About the Workspace:**
- [Pricing Workspace Overview](../pricing-workspace/01-workspace-overview.md)
- [Understanding the Overview Tab](../pricing-workspace/02-overview-tab.md)
- [Editing Hours & Rates](../pricing-workspace/05-editing-hours-rates.md)

**Understand the Data:**
- [Understanding Processing Results](../creating-proposals/03-understanding-results.md)
- [Reviewing Extracted Positions](../creating-proposals/04-reviewing-positions.md)
- [Understanding BLS OEWS Data](../data-sources/01-bls-oews-explained.md)

**Advanced Features:**
- [Advanced Mode: FBLR Breakdown](../advanced-workspace/01-advanced-mode.md)
- [Converting Positions to Subcontractors](../subcontractors-odcs/02-converting-to-subcontractor.md)
- [Adding ODCs and Travel](../subcontractors-odcs/07-adding-odcs.md)

---

## Troubleshooting

**Processing failed?**
- See [Document Processing Failed](../troubleshooting/01-processing-errors.md)

**No positions extracted?**
- Check document format (must be PDF, DOCX, or XLSX)
- Verify document contains labor categories or job descriptions
- Try uploading a different format (convert Word to PDF)

**Wrong SOC codes or wages?**
- Use "Change SOC Code" feature
- See [Changing SOC Codes](../advanced-workspace/08-changing-soc-codes.md)

**Excel export failed?**
- Check browser allows pop-ups
- Try different browser (Chrome recommended)
- See [Excel Export Failed](../troubleshooting/04-export-errors.md)

---

**Need help?** Contact support@priceiq.com

**Last Updated**: January 15, 2026
