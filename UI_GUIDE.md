# Cost Proposal Generator - UI Guide

## Overview

A simple, single-page web interface for generating government contractor cost proposals. Upload job descriptions, configure rates, and download professional Excel files.

## Quick Start

### 1. Start the Server

```bash
# Activate virtual environment
source .venv/bin/activate

# Start the FastAPI server
python -m uvicorn app.server:app --reload
```

The server will start at: `http://localhost:8000`

### 2. Open the UI

Open your browser and navigate to:
```
http://localhost:8000
```

You should see the **Government Contractor Cost Proposal Generator** interface.

---

## Using the Interface

### Step-by-Step Guide

#### 1. Upload Documents
- Click the upload area or drag & drop PDF/DOCX files
- Files should contain job descriptions with labor categories
- You can upload multiple documents
- Remove files by clicking "Remove" next to each file

#### 2. Project Information
- **Solicitation Number**: Contract number (e.g., N0017825R3013)
- **Prime Contractor Name**: Your company name
- **DCAA Contact**: Optional email for DCAA point of contact

#### 3. Contract Duration
- **Total Years**: Total contract length (1-10 years)
- **Base Years**: Number of base period years

#### 4. Indirect Rates
These rates are used to calculate Fully Burdened Labor Rates (FBLR):
- **Fringe %**: Employee benefits (default: 24.7%)
- **Overhead %**: Facility and equipment costs (default: 7.11%)
- **G&A %**: General & Administrative (default: 22.43%)

#### 5. Fee Rates
Profit margins:
- **Prime Labor Fee %**: Fee on your labor (default: 8%)
- **Subcontractor Fee %**: Fee on sub labor (default: 1.26%)

#### 6. Pass-through Rates
Applied to subcontractor costs:
- **S&MH %**: Subcontractor & Material Handling (default: 6.65%)
- **Pass-through G&A %**: Usually 0% (default: 0%)

#### 7. ODC Configuration
- **G&A Adder for ODCs %**: Applied to Other Direct Costs (default: 22.12%)

#### 8. Escalation Rates
Year-over-year wage increases (automatically generated based on total years):
- Default: 2.5% per year
- Customize each year-to-year transition

#### 9. Subcontractors (Optional - Click to Expand)
Add subcontractor labor:
- Click "+ Add Subcontractor"
- Fill in:
  - Subcontractor name
  - Labor category
  - eCRAFT code
  - Hourly rate (Year 1)
  - Hours per year
- Rates for subsequent years calculated automatically using escalation rates
- Click "Remove" to delete a subcontractor

#### 10. Other Direct Costs (Optional - Click to Expand)
Add ODCs like travel, equipment, software:
- Click "+ Add ODC"
- Fill in:
  - Category (e.g., Travel, Equipment)
  - Amount (Year 1)
  - Check "Escalate annually" for inflation-adjusted costs
  - Check "Apply G&A adder" to include G&A markup
- Click "Remove" to delete an ODC

### Generate Excel

1. Click **"Generate Excel Cost Proposal"** button
2. Wait for processing (2 steps):
   - Step 1: Parsing documents and fetching wage data
   - Step 2: Generating Excel cost proposal
3. Excel file downloads automatically
4. Check status message for success/errors

---

## Default Values

The UI comes pre-filled with common government contractor rates:

| Category | Default Value |
|----------|--------------|
| Fringe | 24.7% |
| Overhead | 7.11% |
| G&A | 22.43% |
| Prime Labor Fee | 8.0% |
| Subcontractor Fee | 1.26% |
| S&MH | 6.65% |
| ODC G&A Adder | 22.12% |
| Escalation | 2.5% per year |
| Total Years | 6 |
| Base Years | 1 |

You can modify any of these values before generating the Excel.

---

## Excel Output

The generated Excel file contains:

### Sheet 1: Cost Proposal Spreadsheet
- Header with solicitation info
- Prime labor positions (from uploaded documents)
- Subcontractor labor (if added)
- Pass-through costs
- Fee calculations
- ODCs
- Grand total

### Sheet 2: Subcontractor Fee_MH Rate Table
- Example calculations
- Derived rates for forward/reverse calculations
- Rate table for all labor categories
- Diff Check column (should be ~$0)

---

## Tips

1. **Upload Documents First**: The system needs job descriptions to fetch wage data

2. **Check Rates Carefully**: Default rates are examples - use your company's actual audited rates

3. **Subcontractors**: Only add if you have subcontractor labor. Rates escalate automatically using the escalation rates you configure.

4. **ODCs**:
   - Fixed ODCs (e.g., one-time travel): Uncheck "Escalate annually"
   - Variable ODCs (e.g., recurring software licenses): Check "Escalate annually"
   - Most ODCs should have "Apply G&A adder" checked

5. **Reset Form**: Click "Reset Form" to clear everything and start over

6. **Browser Console**: Open browser developer tools (F12) to see detailed processing logs

---

## Troubleshooting

### Documents Not Processing
- Ensure files are PDF or DOCX format
- Check that files contain job descriptions with labor categories
- Look at browser console for error messages

### Excel Not Downloading
- Check browser's download settings
- Ensure pop-ups aren't blocked
- Check status message for specific error

### Wage Data Issues
- The system fetches wage data from BLS OEWS database
- Some labor categories may not have exact matches
- Check generated Excel to verify wage values

### Server Not Starting
```bash
# Make sure you're in the project directory
cd /Users/keshav/Developer/Others/Pricing

# Activate virtual environment
source .venv/bin/activate

# Start server
python -m uvicorn app.server:app --reload
```

---

## Features

✅ **Single Page Application** - Everything on one page, no navigation needed
✅ **Drag & Drop Upload** - Easy file handling
✅ **Real-time Validation** - Form validation before submission
✅ **Progress Tracking** - See each step of processing
✅ **Collapsible Sections** - Hide optional sections (Subcontractors, ODCs)
✅ **Dynamic Forms** - Add/remove subcontractors and ODCs
✅ **Auto-calculation** - Escalation rates applied automatically
✅ **Responsive Design** - Works on desktop and mobile
✅ **Professional UI** - Clean, modern interface

---

## API Endpoints Used

The UI internally calls:
1. `POST /api/pricing/process` - Parse documents and fetch wages
2. `POST /api/excel/generate-from-data` - Generate Excel file

You can also use these endpoints directly via API. See `API_DOCUMENTATION.md` for details.

---

## Support

- Interactive API Docs: `http://localhost:8000/docs`
- API Documentation: See `API_DOCUMENTATION.md`
- Test Script: `python test_excel_api.py`

---

## Example Workflow

1. Start server: `python -m uvicorn app.server:app --reload`
2. Open browser: `http://localhost:8000`
3. Upload: Drag "job_descriptions.pdf" to upload area
4. Configure: Review rates, adjust if needed
5. Add Subcontractors: Click section, add subcontractor details
6. Add ODCs: Click section, add travel/equipment costs
7. Generate: Click "Generate Excel Cost Proposal"
8. Download: Excel file downloads automatically
9. Review: Open Excel to verify calculations

---

## Screenshots

The UI includes:
- 📄 Purple gradient header with title
- 📋 Organized sections (1-10) with clear labels
- 🎨 Modern card-based design
- ✅ Form validation
- 📊 Real-time status updates
- 💾 One-click Excel download

Enjoy creating professional cost proposals! 🎉
