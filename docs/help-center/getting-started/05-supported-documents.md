# What Documents Can I Upload?

**Article Type:** Reference | **Priority:** P0 | **Reading Time:** 2-3 minutes

Reference guide for supported file formats, size limits, and document requirements.

---

## Supported File Formats

PriceIQ's AI document processing supports the following formats:

### PDF Documents (.pdf)

**Compatibility:** ✅ Fully Supported

**Best For:**
- RFPs (Request for Proposals)
- SOWs (Statement of Work)
- PWS (Performance Work Statements)
- Scanned documents (OCR supported)

**Requirements:**
- Standard PDF (not password-protected)
- Text-based or image-based (OCR works on both)
- Maximum 2MB per file

**Processing:**
- LlamaExtract parses PDF structure
- OCR extracts text from images/scanned pages
- AI agents extract job positions

---

### Microsoft Word (.docx)

**Compatibility:** ✅ Fully Supported

**Best For:**
- Labor category matrices
- SOW documents
- CLIN descriptions

**Requirements:**
- .docx format (Word 2007+)
- .doc format (older Word) may work but .docx recommended
- Maximum 2MB per file

**Processing:**
- Document converted to structured JSON
- Text extracted preserving formatting
- Tables parsed for labor categories

---

### Microsoft Excel (.xlsx, .xls)

**Compatibility:** ✅ Fully Supported

**Best For:**
- Labor category tables
- CLIN matrices
- Pre-existing pricing spreadsheets

**Requirements:**
- .xlsx (Excel 2007+) or .xls (Excel 97-2003)
- Maximum 2MB per file
- Works best with structured tables (headers + data rows)

**Processing:**
- Each worksheet processed separately
- Tables detected and parsed
- Column headers used for field mapping

---

### Unsupported Formats

The following formats are **NOT** currently supported:
- ❌ .txt (plain text)
- ❌ .rtf (Rich Text Format)
- ❌ .odt (OpenDocument Text)
- ❌ .pages (Apple Pages)
- ❌ Images (.jpg, .png) - Convert to PDF first
- ❌ .zip or .rar (archives) - Extract and upload individual files

**Workaround:** Convert to PDF, DOCX, or XLSX before uploading.

---

## File Size Limits

### Per-File Limit

**Maximum:** 2MB per file

**Why This Limit:**
- Faster upload times
- Faster processing
- Server resource management

**If Your File Exceeds 2MB:**
1. **Compress PDF**:
   - Use Adobe Acrobat: File → Reduce File Size
   - Use online tool: smallpdf.com, ilovepdf.com
   - Remove images or reduce image quality

2. **Split Large Documents**:
   - Extract pages with labor categories
   - Upload only relevant sections
   - PriceIQ combines multiple files into one proposal

3. **Convert Format**:
   - Save Word as PDF (often smaller)
   - Save Excel as XLSX (not XLS - newer format smaller)

---

### Total Upload Limit

**Per Proposal:** Unlimited files (but max 2MB each)

**Best Practice:** Upload 1-5 files per proposal (more files = longer processing)

---

## Document Content Requirements

### What PriceIQ Looks For

The AI extraction works best when documents contain:

**1. Job Titles / Labor Categories**
- "Software Engineer"
- "Project Manager III"
- "Administrative Assistant"

**2. Hour Requirements**
- "2080 hours per year"
- "Full-time equivalent (FTE)"
- "960 hours Base Period, 1920 Option Year 1"

**3. Experience Levels** (optional but helpful)
- "Junior (< 3 years experience)"
- "Mid-Level (3-5 years)"
- "Senior (5+ years)"

**4. Job Descriptions** (optional but improves SOC matching)
- "Develops software applications using Java and Python"
- "Manages project schedules and budgets"

---

### Document Types That Work Well

**RFPs (Request for Proposals):**
- Section C: Description/Specifications
- Section L: Instructions to Offerors
- Labor category matrices in Section J or attachments

**SOWs (Statement of Work):**
- Labor requirements section
- Skill sets and experience levels
- Deliverables tied to labor categories

**PWS (Performance Work Statement):**
- Performance objectives tied to roles
- Staffing requirements
- Labor category definitions

**Labor Category Matrices:**
- Structured tables with:
  - Column 1: Labor category name
  - Column 2: Hours per year
  - Column 3: Experience level or description

**CLIN Descriptions:**
- Contract Line Item Number tables
- Labor categories per CLIN
- Hours and rates (if available - otherwise AI extracts hours only)

---

### Documents That May Not Work Well

**Narrative-Heavy Documents:**
- Executive summaries without specific labor requirements
- Marketing materials
- General capability statements

**Highly Formatted Documents:**
- Multi-column layouts (PDF)
- Text in images (poor OCR quality)
- Tables spanning multiple pages (may split incorrectly)

**Password-Protected Files:**
- PDF with restrictions (cannot parse)
- Encrypted Word documents

**Scanned Documents (Low Quality):**
- Blurry scans (OCR fails)
- Handwritten notes (OCR not reliable)
- Poor contrast (light gray text on white)

---

## Processing Time Expectations

### Small Documents (1-5 Labor Categories)

**Processing Time:** 30-60 seconds

**Example:**
- 3-page SOW with 5 labor categories
- Single-page labor matrix

---

### Medium Documents (6-20 Labor Categories)

**Processing Time:** 1-2 minutes

**Example:**
- 20-page RFP with labor requirements section
- Multi-sheet Excel workbook

---

### Large Documents (20+ Labor Categories)

**Processing Time:** 2-5 minutes

**Example:**
- 100-page RFP with multiple CLINs
- Large GSA Schedule with 50+ labor categories

---

### Multiple Files

**Processing Time:** Sum of individual files + 30 seconds overhead

**Example:**
- 3 files (2 small, 1 medium) = 30s + 30s + 90s + 30s = 3 minutes

---

## Best Practices for Document Preparation

### Before Uploading

1. **Review Document:**
   - Verify labor categories are clearly labeled
   - Check hours are specified
   - Confirm file size < 2MB

2. **Optimize File:**
   - Remove unnecessary pages (cover letters, boilerplate)
   - Compress images in PDF
   - Convert to PDF if Word/Excel is large

3. **Extract Relevant Sections:**
   - Don't upload entire 200-page RFP
   - Extract labor requirements section (Section C, Section J)
   - Upload only pages with labor categories

---

### Multiple File Strategy

**When to Upload Multiple Files:**
- RFP split across multiple PDFs (Section C, Section J, Attachments)
- Base Period in one doc, Option Years in another
- Prime labor in one file, Subcontractor labor in another

**How PriceIQ Handles Multiple Files:**
- Processes each file separately
- Combines extracted positions into single proposal
- Deduplicates if same position appears in multiple files

---

### Testing Document Extraction

**Recommended Workflow:**
1. **Test with Small Sample:**
   - Extract 1-2 pages with 3-4 labor categories
   - Upload as test proposal
   - Verify extraction accuracy (SOC codes, hours, experience)

2. **If Accurate:**
   - Upload full document for production proposal

3. **If Inaccurate:**
   - Try different format (Word → PDF)
   - Manually create labor categories (see [Adding Positions](../pricing-workspace/07-adding-positions.md))
   - Contact support for extraction troubleshooting

---

## Document Security & Privacy

### Upload Security

**Encryption:**
- Files encrypted in transit (HTTPS/TLS)
- Stored encrypted at rest (server-side)
- Automatically deleted after processing (optional setting)

**Access Control:**
- Only your organization can access uploaded documents
- Admins see all org documents, Users see own uploads
- Documents never shared between organizations

---

### Data Retention

**Source Documents:**
- Stored in MongoDB (permanently by default)
- Viewable in "Source Files" tab (pricing workspace)
- Can be downloaded later

**Extracted Data:**
- Stored in MongoDB (proposal collection)
- Persists unless proposal deleted

**Deletion:**
- Delete proposal → Deletes both document and extracted data
- Permanent deletion (cannot be undone)

---

## Troubleshooting

### "File too large" error

**Problem:** File exceeds 2MB limit

**Solutions:**
- Compress PDF (see tools above)
- Split document into multiple files
- Remove images/graphics
- Convert to different format

---

### "Unsupported file format" error

**Problem:** File format not recognized

**Solutions:**
- Verify file extension (.pdf, .docx, .xlsx)
- Convert to PDF (most reliable format)
- Check file isn't corrupted (try opening in native app first)

---

### "No labor categories found" error

**Problem:** AI didn't extract any positions

**Possible Causes:**
- Document doesn't contain labor categories
- Format too complex for AI to parse
- Scanned document with poor OCR quality

**Solutions:**
- Try different format (Word → PDF or Excel)
- Manually add positions (see [Adding Positions](../pricing-workspace/07-adding-positions.md))
- Contact support with document sample (we'll analyze and improve extraction)

---

### Processing stuck at "Parsing documents..."

**Problem:** Processing never completes

**Possible Causes:**
- File corrupted or malformed
- Server timeout (rare)
- Network connectivity issue

**Solutions:**
- Wait 5 minutes (large files take time)
- Refresh page and try re-uploading
- Try different browser
- Contact support if persists

---

## Related Articles

**Next Steps:**
- [Your First Proposal: 5-Minute Quick Start](03-first-proposal.md)
- [How Document Processing Works](../creating-proposals/01-document-processing.md)
- [Uploading Documents & Tracking Progress](../creating-proposals/02-uploading-documents.md)

**Troubleshooting:**
- [Document Processing Failed](../troubleshooting/01-processing-errors.md)
- [Handling Processing Errors](../creating-proposals/05-handling-errors.md)

---

## FAQs

**Q: Can I upload a 50MB RFP?**
A: No, max is 2MB per file. Extract relevant sections or compress the PDF.

**Q: Does PriceIQ support scanned documents?**
A: Yes, OCR extracts text from scanned PDFs. Quality matters - blurry scans may fail.

**Q: Can I upload multiple files at once?**
A: Yes! Select multiple files in the file picker (Ctrl+Click or Cmd+Click).

**Q: What if my document is in .doc format (not .docx)?**
A: Try uploading - may work. If not, open in Word and "Save As" → .docx.

**Q: Can I upload an image (screenshot) of a labor matrix?**
A: Convert to PDF first. Tools: Photoshop, Preview (Mac), online converters.

**Q: Will PriceIQ store my uploaded documents forever?**
A: Yes, unless you delete the proposal. Documents stored securely and encrypted.

---

**Need help?** Contact support@priceiq.com with document issues.

**Last Updated**: January 15, 2026
