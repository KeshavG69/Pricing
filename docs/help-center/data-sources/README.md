# Data Sources & Wage Data

Learn about the Bureau of Labor Statistics (BLS) wage data, SOC codes, and wage percentiles that power PriceIQ's pricing automation.

## What This Category Covers

This section explains the data sources behind PriceIQ's automated wage lookup:
- **BLS OEWS**: Bureau of Labor Statistics Occupational Employment and Wage Statistics (6M+ wage records)
- **SOC Codes**: Standard Occupational Classification system (1,100 occupations)
- **FAISS Vector Search**: AI-powered matching of job descriptions to SOC codes
- **Wage Percentiles**: 25th, 50th (median), 75th, 90th percentile wages by location
- **GSA Schedules**: Government-negotiated rates (admin-only feature)

## Key Concepts

### BLS OEWS Data
- **Source**: U.S. Bureau of Labor Statistics (public domain, updated annually)
- **Coverage**: 6M+ wage records across ~700 geographic areas
- **Granularity**: National, state, metropolitan statistical areas (MSAs)
- **Percentiles**: 25th, 50th (median), 75th, 90th percentile wages
- **Accuracy**: Industry-standard for government contractor pricing

### SOC Codes
- **What**: Standardized occupational classification system used by federal agencies
- **Count**: ~1,100 detailed occupations (6-digit codes)
- **Examples**: 15-1252 (Software Developers), 43-6014 (Secretaries), 11-3021 (Computer Systems Managers)
- **Matching**: PriceIQ uses AI (FAISS vector search) to match job descriptions to SOC codes

### Wage Percentiles
- **25th Percentile**: Junior/entry-level (< 3 years experience)
- **50th Percentile**: Mid-level (3-5 years experience, median wage)
- **75th Percentile**: Senior (> 5 years experience)
- **90th Percentile**: Expert/leadership roles
- **Auto-selection**: PriceIQ chooses percentile based on experience level

### GSA Schedules (Admin-Only)
- **What**: Pre-negotiated government rates for specific labor categories
- **Use Case**: Companies with existing GSA Schedule contracts
- **Rates**: Already fully burdened (includes indirect rates)
- **Admin Feature**: Only organization admins can select GSA wage source

## Quick Start Guides

**New to wage data?** Start here:
1. [Understanding BLS OEWS Data](01-bls-oews-explained.md) - Data source overview (6 min)
2. [What Are SOC Codes?](02-soc-codes-explained.md) - Occupational classification (5 min)
3. [Understanding Wage Percentiles](03-wage-percentiles.md) - 25th, 50th, 75th explained (4 min)

**Advanced:**
1. [How SOC Matching Works](04-soc-matching-faiss.md) - AI-powered matching (7 min)
2. [GSA Wage Schedules](05-gsa-schedules.md) - Pre-negotiated rates (5 min, admin-only)

## All Articles in This Category

### Core Concepts
- [Understanding BLS OEWS Data](01-bls-oews-explained.md) - Bureau of Labor Statistics wage database (P0, Explainer)
- [What Are SOC Codes?](02-soc-codes-explained.md) - Standard Occupational Classification (P0, Explainer)
- [Understanding Wage Percentiles](03-wage-percentiles.md) - 25th, 50th, 75th percentiles (P0, Reference)

### Technical Details
- [How SOC Matching Works](04-soc-matching-faiss.md) - FAISS vector search (P2, Technical Deep-Dive)
- [GSA Wage Schedules](05-gsa-schedules.md) - Government schedule rates (P1, Admin Reference)

## Common Workflows

### Understanding Where Wage Data Comes From
**Use case**: You want to understand how PriceIQ calculates hourly rates.

1. PriceIQ extracts job title and description from your RFP
2. AI matches to closest SOC code (e.g., "Software Engineer" → 15-1252)
3. System looks up BLS OEWS wage data for that SOC code
4. Filters by area code (e.g., Washington-Arlington-Alexandria, DC-VA-MD-WV)
5. Selects percentile based on experience (< 3 years = 25th, 3-5 = 50th, > 5 = 75th)
6. Converts annual wage to hourly (÷ 2080 or 1920 hours)
7. Applies indirect rates (Fringe, OH, G&A, Fee) to calculate FBLR

**Result**: Accurate, defensible wage-based pricing.

### Reviewing Wage Data for a Position
**Use case**: You want to verify the wage data PriceIQ used.

1. Open pricing workspace
2. Navigate to "Wage Data" tab (tab 4 of 5)
3. Find position in list (or search)
4. View detailed wage breakdown:
   - SOC code and title
   - Area name (geographic location)
   - All percentiles (25th, 50th, 75th, 90th)
   - Annual wages
   - Sample size (employment count)
5. Verify selected percentile matches experience level

**Result**: Full transparency into wage data source.

### Changing SOC Code for a Position
**Use case**: AI matched to wrong SOC code (e.g., "Engineer" → Mechanical Engineer instead of Software Engineer).

1. Open pricing workspace
2. Find position in grid
3. Click three-dot menu (⋮) on position row
4. Select "Change SOC Code"
5. Search for correct SOC (e.g., "Software Developer")
6. Click desired SOC code
7. System updates wage data automatically
8. Verify new rate in grid

**Result**: Position uses correct SOC code and wage data.

**See Also**: [Changing SOC Codes](../advanced-workspace/08-changing-soc-codes.md)

## Important Notes

### About BLS OEWS Data
- **Update Frequency**: BLS releases new data annually (May)
- **Lag Time**: Data reflects wages from previous year (e.g., May 2025 release = 2024 wages)
- **Geographic Coverage**: 700+ areas (national, state, MSA)
- **Occupational Coverage**: ~1,100 occupations (not all jobs)
- **Employment Count**: Sample size varies by occupation and area

### About SOC Matching
- **AI-Powered**: Uses FAISS vector search (semantic similarity)
- **Accuracy**: Typically 85-95% accurate on first try
- **Manual Override**: You can change SOC code if AI is wrong
- **Context-Aware**: Uses job title + description for better matching
- **Fallback**: If no good match, defaults to generic code (check Wage Data tab)

### About Percentiles
- **Auto-Selected**: Based on experience level in job description
- **< 3 years**: 25th percentile (entry-level)
- **3-5 years**: 50th percentile (mid-level, median)
- **> 5 years**: 75th percentile (senior)
- **Manual Override**: You can change percentile in Advanced Mode or Wage Data tab

### About GSA Schedules
- **Admin-Only**: Only organization admins can select GSA wage source
- **Already Burdened**: GSA rates include indirect rates (don't apply Fringe, OH, G&A, Fee)
- **Display Only**: Indirect rate breakdown is for display purposes (doesn't change total)
- **Use Case**: Companies with existing GSA Schedule contracts

## Key Differences: BLS vs GSA

| Aspect | BLS OEWS | GSA Schedules |
|--------|----------|---------------|
| **Source** | Bureau of Labor Statistics | GSA (Government Services Administration) |
| **Rates** | Market wages (unburdened) | Pre-negotiated (fully burdened) |
| **Indirect Rates** | Apply Fringe, OH, G&A, Fee | Already included |
| **Access** | All users | Admin-only |
| **Use Case** | Default pricing | Companies with GSA contracts |
| **Geographic** | 700+ areas | National only |
| **Percentiles** | 25th, 50th, 75th, 90th | Single rate per labor category |

## Related Documentation

**Pricing Workspace:**
- [Wage Data Tab: Viewing Details](../advanced-workspace/11-wage-data-tab.md)
- [Changing SOC Codes](../advanced-workspace/08-changing-soc-codes.md)
- [Understanding Wage Percentiles](../advanced-workspace/06-wage-percentiles.md)

**Advanced:**
- [Understanding FBLR Calculations](../advanced-workspace/02-fblr-calculations.md)
- [Indirect Rates: Fringe, OH, G&A, Fee](../advanced-workspace/03-indirect-rates.md)

**Creating Proposals:**
- [How Document Processing Works](../creating-proposals/01-document-processing.md)
- [Understanding Processing Results](../creating-proposals/03-understanding-results.md)

## Troubleshooting

**Wage data not found for position?**
- Check SOC code (may be too specific or rare occupation)
- Verify area code (some MSAs have limited data)
- Try changing to broader SOC code (e.g., "Software Developers" instead of "Software Quality Assurance")
- Try national area code if local area missing data

**SOC code seems wrong?**
- AI matching is 85-95% accurate (not perfect)
- Use "Change SOC Code" feature to correct
- Provide better job description for future uploads (more detail helps AI)

**Wage seems too low/high?**
- Check percentile selection (25th vs 75th big difference)
- Verify area code (DC wages ≠ rural wages)
- Check experience level in job description
- Verify indirect rates (low rates = low FBLR)

**GSA option not available?**
- GSA wage source is admin-only feature
- Ask organization admin to upload document with GSA option selected
- Or ask admin to promote your role to Admin

**Can't find a specific SOC code?**
- SOC codes use specific naming (e.g., "Software Developers, Applications" not "Software Engineer")
- Try searching by SOC code number (e.g., 15-1252)
- Browse BLS SOC structure: https://www.bls.gov/soc/
- Contact support for help finding correct code

---

**Last Updated**: January 15, 2026
**Category Priority**: P0 (Essential for understanding)
**Applies to**: All users, especially those validating wage data
