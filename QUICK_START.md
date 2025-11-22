# Quick Start Guide - Cost Proposal Generator UI

## Start the Application

```bash
./start_ui.sh
```

Or manually:
```bash
source .venv/bin/activate
python -m uvicorn app.server:app --reload
```

## Access the UI

Open your browser and go to:
```
http://localhost:8000
```

## 5-Minute Tutorial

1. **Upload Documents** - Drag & drop your job descriptions (PDF/DOCX)
2. **Enter Project Info** - Solicitation number, company name
3. **Review Rates** - Default rates are pre-filled, adjust if needed
4. **Add Subcontractors** (optional) - Expand section, click "+ Add Subcontractor"
5. **Add ODCs** (optional) - Expand section, click "+ Add ODC"
6. **Generate** - Click the big purple button
7. **Download** - Excel file downloads automatically

## What You Get

- **Professional Excel file** with two sheets:
  - Sheet 1: Complete cost proposal with all calculations
  - Sheet 2: Rate table with transparency calculations
  
- **Includes**:
  - All positions parsed from documents
  - Wage data (75th percentile from BLS OEWS)
  - Multi-year calculations with escalation
  - FBLR calculations (Fringe + OH + G&A)
  - Subcontractor markup (Fee + S&MH)
  - ODCs with G&A adder
  - Professional formatting

## Need Help?

- Full UI Guide: See `UI_GUIDE.md`
- API Documentation: See `API_DOCUMENTATION.md`
- API Docs (interactive): `http://localhost:8000/docs`

## File Structure

```
static/
  └── index.html          # Single-page UI (complete)
routers/
  ├── excel_export.py     # Excel generation endpoints
  └── pricing.py          # Document processing endpoints
app/
  └── server.py           # FastAPI app with static file serving
```

That's it! You're ready to generate cost proposals. 🚀
