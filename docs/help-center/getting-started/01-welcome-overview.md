# Welcome to PriceIQ: Platform Overview

**Article Type:** Explainer | **Priority:** P0 | **Reading Time:** 2-3 minutes

Get a high-level introduction to PriceIQ's government contractor pricing automation platform.

---

## What Is PriceIQ?

**PriceIQ** is an AI-powered pricing automation platform designed specifically for government contractors. It transforms the manual, time-consuming process of creating cost proposals into a fast, accurate, and repeatable workflow.

### What PriceIQ Does

**Automates Document Processing:**
- Upload RFPs, SOWs, PWS documents (PDF, Word, Excel)
- AI extracts job positions, hours, experience levels automatically
- No manual data entry required

**Provides Accurate Wage Data:**
- Matches job descriptions to SOC (Standard Occupational Classification) codes
- Retrieves BLS OEWS (Bureau of Labor Statistics) wage data
- Supports 700+ geographic areas with 25th, 50th, 75th, 90th percentile wages

**Calculates Fully Burdened Rates:**
- Applies indirect rates (Fringe, Overhead, G&A, Fee) automatically
- Calculates FBLR (Fully Burdened Labor Rate) using cascade formula
- Handles multi-year contracts with compound escalation

**Enables Team Collaboration:**
- Multi-tenant organization workspaces
- Role-based access (Admin vs User permissions)
- Proposal sharing within teams

**Exports to Excel:**
- Professional Excel deliverables ready for government submission
- Live formulas (not static values)
- Multiple worksheets (Summary, Labor, Subcontractors, ODCs, Travel, Rates)

---

## Who Is PriceIQ For?

**Government Contractors:**
- Prime contractors pricing labor and materials
- Small businesses responding to RFPs
- Large contractors with dedicated pricing teams

**Pricing Professionals:**
- Proposal managers
- Cost estimators
- Business development teams
- Capture managers

**Finance & Accounting:**
- CFOs verifying proposal costs
- Controllers managing indirect rates
- Accountants ensuring compliance

---

## Key Features

### AI-Powered Document Processing

**How It Works:**
1. Upload RFP documents (PDF, DOCX, XLSX)
2. AI parses document and extracts job positions
3. System matches to SOC codes using FAISS vector search
4. Wage data retrieved from BLS OEWS database (6M+ records)
5. FBLR calculated automatically
6. Results appear in Excel-like pricing workspace

**Processing Time:** 30-60 seconds for typical documents (5-20 positions)

### Excel-Like Pricing Workspace

**Interface:**
- **Familiar**: Excel-like grid with frozen columns
- **Multi-tab**: Source Files, Overview, Pricing Workspace, Wage Data, Subcontractors
- **Inline editing**: Click cells to edit hours, rates, descriptions
- **Auto-save**: Changes persist automatically after 2 seconds
- **Context menus**: Right-click or click ⋮ for actions

**Advanced Features:**
- FBLR breakdown view (Direct Labor → +Fringe → +OH → +G&A → +Fee)
- On-Site vs Off-Site overhead rates
- Subcontractor conversion workflow
- ODC (Other Direct Costs) and Travel tracking

### Accurate Wage Data

**BLS OEWS Database:**
- 6M+ wage records
- 1,100+ occupations (SOC codes)
- 700+ geographic areas (national, state, MSA)
- 4 percentiles (25th, 50th, 75th, 90th)
- Updated annually (May releases)

**Auto-Selection:**
- < 3 years experience → 25th percentile
- 3 to < 6 years → 50th percentile (median)
- ≥ 6 years → 75th percentile
- Manual override available

### Multi-Year Contract Support

**Base Period + Option Years:**
- Configure 1-10 contract years
- Automatic compound escalation
- Partial year extensions (e.g., 6-month periods)
- Customizable months per year

**Escalation:**
- Year-over-year rate increases
- Compound calculation (Year 3 = Year 1 × (1 + rate₁₋₂) × (1 + rate₂₋₃))
- Configurable escalation rates per year

### Team Collaboration

**Organization Workspaces:**
- Multi-tenant architecture (data isolation)
- Shared settings (indirect rates, escalation rates)
- Team member management (invite, remove, role assignment)

**Role-Based Access:**
- **Admin**: See all proposals, invite users, manage settings
- **User**: See own + shared proposals, create proposals
- **Owner**: Billing responsibility, cannot be removed

**Proposal Sharing:**
- Admins can share proposals with team members
- Shared users can view and edit
- Default: proposals are private to creator

---

## Core Concepts

### FBLR (Fully Burdened Labor Rate)

**What It Is:**
The total hourly cost of labor including direct wages plus all indirect costs.

**Cascade Formula:**
```
Direct Labor (DL) = Annual Wage ÷ Standard FTE Hours
+ Fringe = DL × Fringe Rate
+ Overhead (OH) = (DL + Fringe) × OH Rate
+ G&A = (DL + Fringe + OH) × G&A Rate
+ Fee = (DL + Fringe + OH + G&A) × Fee Rate
= FBLR (Fully Burdened Labor Rate)
```

**Example:**
- Annual Wage: $80,000
- Direct Labor: $80,000 ÷ 2080 = $38.46/hour
- Fringe (24.7%): $38.46 × 0.247 = $9.50
- OH (7.11%): ($38.46 + $9.50) × 0.0711 = $3.41
- G&A (22.43%): ($38.46 + $9.50 + $3.41) × 0.2243 = $11.54
- Fee (8%): ($38.46 + $9.50 + $3.41 + $11.54) × 0.08 = $5.19
- **FBLR**: $68.10/hour

### SOC Codes (Standard Occupational Classification)

**What They Are:**
Federal occupational classification system used by BLS, Census Bureau, and other agencies.

**Examples:**
- **15-1252**: Software Developers, Applications
- **43-6014**: Secretaries and Administrative Assistants
- **11-3021**: Computer and Information Systems Managers
- **17-2141**: Mechanical Engineers

**Why They Matter:**
SOC codes link job descriptions to BLS wage data. PriceIQ uses AI (FAISS vector search) to automatically match your job descriptions to the correct SOC code.

### BLS OEWS (Bureau of Labor Statistics Occupational Employment and Wage Statistics)

**What It Is:**
Comprehensive wage database covering 6M+ wage records across 1,100+ occupations and 700+ geographic areas.

**Data Included:**
- Employment counts (sample size)
- Annual and hourly wages
- Wage percentiles (25th, 50th, 75th, 90th)
- Geographic areas (national, state, metropolitan)

**Update Frequency:** Annual (May releases, data from previous year)

---

## How PriceIQ Works: End-to-End Workflow

### Step 1: Upload Documents
1. Click "New Proposal" from dashboard
2. Enter proposal name (e.g., "Navy NMCI RFP 2025")
3. Upload RFP documents (PDF, DOCX, XLSX)
4. Select wage source (BLS OEWS or GSA Schedule for admins)
5. Click "Process Documents"

### Step 2: AI Processing (30-60 seconds)
- **Parsing**: LlamaExtract converts documents to structured JSON
- **Extraction**: AI agents (10 parallel) extract job positions
- **SOC Matching**: FAISS vector search matches to SOC codes
- **Wage Lookup**: MongoDB retrieves BLS OEWS wage data
- **FBLR Calculation**: System applies indirect rates

### Step 3: Review & Edit
- **Overview Tab**: View cost summary, totals, analytics
- **Pricing Workspace**: Excel-like grid for editing
- **Wage Data Tab**: Verify SOC codes and wage data
- Edit hours, rates, descriptions as needed
- Add subcontractors, ODCs, travel
- Auto-save persists changes

### Step 4: Export & Submit
- Click "Export" button
- Download Excel file (`ProposalName_Pricing.xlsx`)
- Review output (Summary, Labor, Subcontractors, ODCs, Travel, Rates worksheets)
- Attach to proposal submission

---

## Getting Started

**Ready to create your first proposal?**

Follow these guides in order:
1. [Creating Your Account & First Login](02-creating-account.md) - Sign up (2-3 min)
2. [Your First Proposal: 5-Minute Quick Start](03-first-proposal.md) - Upload and process (5-7 min)
3. [Understanding Your Dashboard](04-understanding-dashboard.md) - Navigate the interface (3-4 min)

**Need more information?**
- [What Documents Can I Upload?](05-supported-documents.md) - File formats and requirements
- [How Document Processing Works](../creating-proposals/01-document-processing.md) - Technical deep-dive
- [Understanding BLS OEWS Data](../data-sources/01-bls-oews-explained.md) - Wage data source

---

## System Requirements

**Browser:**
- Chrome 90+ (recommended)
- Firefox 88+
- Edge 90+
- Safari 14+
- **Not supported**: Internet Explorer

**Internet Connection:**
- Required for document processing and auto-save
- Recommended: broadband (1 Mbps+ upload)

**Screen Resolution:**
- Minimum: 1280×720
- Recommended: 1920×1080 (full HD)

**Optional:**
- Microsoft Excel 2007+ (for viewing exports)
- PDF reader (for viewing source documents)

---

## Next Steps

**New User Path (10 minutes):**
1. Create account → [Creating Your Account](02-creating-account.md)
2. Upload first document → [Your First Proposal](03-first-proposal.md)
3. Explore dashboard → [Understanding Your Dashboard](04-understanding-dashboard.md)

**Learn More:**
- **Pricing Workspace**: [Workspace Overview](../pricing-workspace/01-workspace-overview.md)
- **Advanced Features**: [FBLR Calculations](../advanced-workspace/02-fblr-calculations.md)
- **Team Management**: [Organizations & Workspaces](../team-organization/01-organizations-workspaces.md)

---

## Support & Resources

**Need Help?**
- Email: support@priceiq.com
- Help Center: Full documentation at `/docs/help-center`
- Video Tutorials: Coming soon

**Feedback:**
- Feature requests: feedback@priceiq.com
- Bug reports: bugs@priceiq.com

---

**Last Updated**: January 15, 2026
