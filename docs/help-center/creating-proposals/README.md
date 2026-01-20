# Creating Proposals

Learn how to upload documents and process them into cost proposals using PriceIQ's AI-powered extraction pipeline.

## Overview

This category covers everything from uploading your first RFP document to reviewing the extracted positions and handling processing errors. PriceIQ uses advanced AI technology to automatically extract job positions, match them to SOC codes, and retrieve accurate wage data.

## What You'll Learn

- How the AI document processing pipeline works
- How to upload documents through the web interface
- How to review and validate extraction results
- How to verify position accuracy before editing
- How to troubleshoot common processing errors

## Articles in This Category

### [How Document Processing Works](01-document-processing.md)
**Priority: P0 | Type: Explainer with diagram**

Understand the AI pipeline that transforms your RFP documents into structured pricing data. Learn about LlamaExtract, SOC matching with FAISS vector search, BLS wage lookup, and automatic position splitting.

**Read time: 5 minutes**

---

### [Uploading Documents & Tracking Progress](02-uploading-documents.md)
**Priority: P0 | Type: Tutorial**

Step-by-step guide to uploading documents through the web interface. Learn about supported file formats, required fields, wage source selection (BLS vs GSA for admins), and how to monitor processing progress.

**Read time: 7 minutes**

---

### [Understanding Processing Results](03-understanding-results.md)
**Priority: P0 | Type: Visual guide**

Learn how to read and interpret the extraction results. Understand what each field means, how to spot potential issues, and when results need review vs when they're ready to use.

**Read time: 6 minutes**

---

### [Reviewing Extracted Positions](04-reviewing-positions.md)
**Priority: P0 | Type: Best practices**

Best practices for validating extracted positions before making edits. Learn how to check SOC code accuracy, verify wage data, validate experience levels, and spot common extraction errors.

**Read time: 8 minutes**

---

### [Handling Processing Errors](05-handling-errors.md)
**Priority: P2 | Type: Troubleshooting guide**

Troubleshoot common processing errors and learn recovery strategies. Covers timeout errors, parsing failures, missing wage data, invalid SOC codes, and when to re-upload vs manually fix.

**Read time: 10 minutes**

---

## Quick Start: Your First Upload

If you're new to PriceIQ, follow this quick path:

1. **Start here**: [Uploading Documents & Tracking Progress](02-uploading-documents.md)
2. **Then read**: [Understanding Processing Results](03-understanding-results.md)
3. **Finally review**: [Reviewing Extracted Positions](04-reviewing-positions.md)

For a deeper understanding of how the technology works, read [How Document Processing Works](01-document-processing.md).

## Key Concepts

**Document Processing**: The AI pipeline that extracts job positions, matches SOC codes, and retrieves wage data automatically.

**SOC Matching**: Using FAISS vector search to find the closest Standard Occupational Classification code for each job description.

**Position Splitting**: Automatic division of positions with more than 1920 hours (full-time equivalent) into multiple rows.

**Wage Source**: Choice between BLS (Bureau of Labor Statistics) data or GSA Schedule rates (admin only).

**Processing Status**: Real-time updates showing extraction progress (parsing, SOC matching, wage lookup).

## Typical Processing Time

- **Small documents** (1-5 positions): 30-60 seconds
- **Medium documents** (6-20 positions): 1-2 minutes
- **Large documents** (20+ positions): 2-5 minutes

Processing happens in the background with 10 parallel agents working simultaneously.

## Supported Document Formats

- PDF (.pdf)
- Word Documents (.docx)
- Excel Spreadsheets (.xlsx, .xls)

The AI parser works best with:
- RFPs (Request for Proposals)
- SOWs (Statements of Work)
- PWS (Performance Work Statements)
- Labor category matrices
- CLIN descriptions

## Common Questions

**Q: Can I upload multiple files at once?**
A: Yes! The upload page supports multiple file selection. All files are processed together into a single proposal.

**Q: What happens if processing fails?**
A: You can retry the upload without additional charges. See [Handling Processing Errors](05-handling-errors.md) for troubleshooting.

**Q: Can I edit positions after extraction?**
A: Absolutely! Extraction is just the starting point. You can edit hours, rates, SOC codes, and everything else in the Pricing Workspace.

**Q: How accurate is the AI extraction?**
A: Typically 85-95% accurate. Always review results before finalizing. See [Reviewing Extracted Positions](04-reviewing-positions.md) for validation tips.

**Q: Do I need to specify anything before uploading?**
A: Only the proposal name is required. Solicitation number is optional. Admins can choose between BLS or GSA wage sources.

## Next Steps

After processing completes, you'll be redirected to the Pricing Workspace where you can:
- Edit hours and rates
- Add subcontractors
- Include ODCs and travel costs
- Export to Excel

See [Pricing Workspace Overview](../pricing-workspace/01-workspace-overview.md) to continue.

---

**Need Help?**
If you encounter issues during upload or processing, see [Handling Processing Errors](05-handling-errors.md) or contact support@priceiq.com.

**Last Updated**: January 15, 2026
