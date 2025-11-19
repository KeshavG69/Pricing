# API Documentation - Government Contractor Pricing API

## Base Information

- **Base URL**: `http://localhost:8000`
- **API Version**: 1.0
- **Protocol**: HTTP/HTTPS
- **Content Types**:
  - Request: `multipart/form-data`
  - Response: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (Excel), `application/json`

## Authentication

Currently, the API does not require authentication. For production deployment, consider adding:
- API key authentication
- OAuth 2.0
- JWT tokens

## Rate Limiting

No rate limiting is currently implemented. Consider implementing rate limiting for production:
- Recommended: 10 requests per minute per IP
- Large file processing can take 2-5 minutes

## Endpoints

### 1. Root Endpoint

Get API information and links.

```http
GET /
```

#### Response

**Status**: 200 OK

```json
{
  "message": "Government Contractor Pricing API",
  "version": "1.0",
  "docs": "/docs",
  "health": "/health"
}
```

---

### 2. Health Check

Check if the API is running and healthy.

```http
GET /health
```

#### Response

**Status**: 200 OK

```json
{
  "status": "healthy"
}
```

#### Use Cases
- Monitoring and alerting
- Load balancer health checks
- Kubernetes liveness/readiness probes

---

### 3. Process Documents for Pricing

Upload documents containing job descriptions and receive wage analysis.

```http
POST /api/pricing/process
```

#### Request

**Headers**
```
Content-Type: multipart/form-data
```

**Body Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| files | file[] | Yes | One or more document files (PDF, DOCX, XLSX) |

**Supported File Formats**
- PDF (`.pdf`)
- Microsoft Word (`.docx`)
- Microsoft Excel (`.xlsx`, `.xls`)

**File Size Limits**
- Per file: 2 MB (default)
- Total request: 10 MB (recommended)

#### Request Examples

**cURL**

```bash
# Single file
curl -X POST \
  http://localhost:8000/api/pricing/process \
  -F "files=@Labor_Information.pdf" \
  -o pricing_results.xlsx

# Multiple files
curl -X POST \
  http://localhost:8000/api/pricing/process \
  -F "files=@document1.pdf" \
  -F "files=@document2.docx" \
  -F "files=@spreadsheet.xlsx" \
  -o pricing_results.xlsx
```

**JavaScript (Fetch API)**

```javascript
// Single file upload
const fileInput = document.querySelector('input[type="file"]');
const formData = new FormData();
formData.append('files', fileInput.files[0]);

fetch('http://localhost:8000/api/pricing/process', {
  method: 'POST',
  body: formData
})
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.blob();
  })
  .then(blob => {
    // Download the file
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pricing_results.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);
  })
  .catch(error => console.error('Error:', error));

// Multiple files upload
const files = document.querySelector('input[type="file"]').files;
const formData = new FormData();
Array.from(files).forEach(file => {
  formData.append('files', file);
});

fetch('http://localhost:8000/api/pricing/process', {
  method: 'POST',
  body: formData
})
  .then(response => response.blob())
  .then(blob => {
    // Handle blob...
  });
```

**Python (requests)**

```python
import requests

# Single file
with open('Labor_Information.pdf', 'rb') as f:
    files = {'files': f}
    response = requests.post(
        'http://localhost:8000/api/pricing/process',
        files=files
    )

with open('pricing_results.xlsx', 'wb') as f:
    f.write(response.content)

# Multiple files
files = [
    ('files', open('document1.pdf', 'rb')),
    ('files', open('document2.docx', 'rb')),
]
response = requests.post(
    'http://localhost:8000/api/pricing/process',
    files=files
)

with open('pricing_results.xlsx', 'wb') as f:
    f.write(response.content)
```

**Axios (JavaScript/TypeScript)**

```javascript
import axios from 'axios';

const formData = new FormData();
formData.append('files', fileInput.files[0]);

axios.post('http://localhost:8000/api/pricing/process', formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
  },
  responseType: 'blob',
})
  .then(response => {
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'pricing_results.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
  })
  .catch(error => console.error('Error:', error));
```

#### Response

**Status**: 200 OK

**Headers**
```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="pricing_results.xlsx"
```

**Body**: Excel file (binary)

**Excel File Structure**

The returned Excel file contains the following columns:

| Column Name | Data Type | Description | Example |
|-------------|-----------|-------------|---------|
| labor_category | string | Job title extracted from document | "Software Developer" |
| experience | integer/null | Years of experience required | 5 |
| location | string/null | Job location | "California" |
| hours | integer/null | Annual hours (typically 1920 for full-time) | 1920 |
| soc_code | string | Standard Occupational Classification code (6 digits) | "15-1252" |
| occupation_name | string | Official BLS occupation title | "Software Developers" |
| area | string | Geographic area for wage data | "California" |
| wage_10th | float/null | 10th percentile annual wage (USD) | 87290.00 |
| wage_25th | float/null | 25th percentile annual wage (USD) | 110140.00 |
| wage_50th | float/null | Median annual wage (USD) | 145220.00 |
| wage_75th | float/null | 75th percentile annual wage (USD) | 180790.00 |
| wage_90th | float/null | 90th percentile annual wage (USD) | 208620.00 |

**Example Output**

```
| labor_category      | experience | location   | hours | soc_code | occupation_name      | area       | wage_10th | wage_25th | wage_50th | wage_75th | wage_90th |
|---------------------|------------|------------|-------|----------|----------------------|------------|-----------|-----------|-----------|-----------|-----------|
| Software Developer  | 5          | California | 1920  | 15-1252  | Software Developers  | California | 87290     | 110140    | 145220    | 180790    | 208620    |
| Data Scientist      | 3          | New York   | 2080  | 15-2051  | Data Scientists      | New York   | 78340     | 101560    | 138320    | 179870    | 219330    |
| Project Manager     | 7          | Texas      | 2080  | 11-9021  | Construction Mgrs    | Texas      | 61490     | 80060     | 105780    | 141500    | 180130    |
```

#### Error Responses

**400 Bad Request**

No files uploaded or invalid file format.

```json
{
  "detail": "No files uploaded"
}
```

**422 Unprocessable Entity**

Validation error (e.g., file too large).

```json
{
  "detail": [
    {
      "loc": ["body", "files"],
      "msg": "File size exceeds maximum allowed size",
      "type": "value_error"
    }
  ]
}
```

**500 Internal Server Error**

Processing error occurred.

```json
{
  "detail": "Failed to process documents: [error message]"
}
```

#### Processing Details

**What Happens During Processing:**

1. **File Upload** (1-2 seconds)
   - Files saved to temporary directory
   - File validation and format detection

2. **Document Parsing** (5-15 seconds per file)
   - Text extraction using Unstructured library
   - Content grouped by page

3. **Job Description Extraction** (10-30 seconds)
   - GPT-4 analyzes document content
   - Structured extraction of job fields
   - Returns DataFrame with job descriptions

4. **Parallel Agent Processing** (20-60 seconds)
   - 10 concurrent workers process jobs
   - Each job goes through:
     - **Vector Search**: Semantic matching to find SOC code
     - **MongoDB Query**: Retrieve wage percentiles

5. **Excel Generation** (1-2 seconds)
   - Results compiled into DataFrame
   - Export to Excel format
   - Streaming response to client

**Total Processing Time:**
- Small files (1-5 pages): 30-60 seconds
- Medium files (5-20 pages): 1-3 minutes
- Large files (20+ pages): 3-5 minutes

**Timeout Recommendations:**
- Set client timeout to 5-10 minutes for large files
- Consider implementing progress callbacks for better UX

---

## Data Models

### Job Description (Extracted from Documents)

```typescript
interface JobDescription {
  labor_category: string;      // Required: Job title
  experience?: number;          // Optional: Years of experience
  location?: string;            // Optional: Geographic location
  hours?: number;               // Optional: Annual hours
}
```

**Example:**
```json
{
  "labor_category": "Software Developer",
  "experience": 5,
  "location": "California",
  "hours": 1920
}
```

### Wage Data (Retrieved from BLS OEWS)

```typescript
interface WageData {
  soc_code: string;             // 6-digit SOC code with hyphen
  occupation_name: string;      // Official BLS occupation title
  area: string;                 // Geographic area name
  wage_10th: number | null;     // 10th percentile wage (USD)
  wage_25th: number | null;     // 25th percentile wage (USD)
  wage_50th: number | null;     // Median wage (USD)
  wage_75th: number | null;     // 75th percentile wage (USD)
  wage_90th: number | null;     // 90th percentile wage (USD)
}
```

**Example:**
```json
{
  "soc_code": "15-1252",
  "occupation_name": "Software Developers",
  "area": "California",
  "wage_10th": 87290,
  "wage_25th": 110140,
  "wage_50th": 145220,
  "wage_75th": 180790,
  "wage_90th": 208620
}
```

### Complete Row (Job + Wage)

```typescript
interface PricingResult {
  // Input fields
  labor_category: string;
  experience?: number;
  location?: string;
  hours?: number;

  // Output fields
  soc_code: string;
  occupation_name: string;
  area: string;
  wage_10th: number | null;
  wage_25th: number | null;
  wage_50th: number | null;
  wage_75th: number | null;
  wage_90th: number | null;
}
```

---

## SOC Code Reference

### What is a SOC Code?

SOC (Standard Occupational Classification) codes are used by federal agencies to classify workers into occupational categories for collecting, calculating, and disseminating data.

**Format**: `XX-XXXX` (2 major group digits, hyphen, 4 detailed occupation digits)

**Example**: `15-1252`
- `15`: Computer and Mathematical Occupations (major group)
- `1252`: Software Developers (detailed occupation)

### Common SOC Codes

| SOC Code | Occupation Title | Example Jobs |
|----------|------------------|--------------|
| 15-1252 | Software Developers | Software Engineer, Application Developer |
| 15-2051 | Data Scientists | Data Scientist, Machine Learning Engineer |
| 11-9021 | Construction Managers | Project Manager (Construction) |
| 13-1111 | Management Analysts | Business Analyst, Consultant |
| 15-1244 | Network Architects | Network Engineer, Cloud Architect |
| 15-1299 | Computer Occupations, All Other | DevOps Engineer, Site Reliability Engineer |
| 17-2051 | Civil Engineers | Structural Engineer, Transportation Engineer |
| 19-4061 | Social Science Research Assistants | Research Analyst |

### SOC Code Hierarchy

```
15-0000  Computer and Mathematical Occupations (major group)
  15-1200  Computer Occupations (minor group)
    15-1250  Software and Web Developers (broad occupation)
      15-1251  Computer Programmers (detailed occupation)
      15-1252  Software Developers (detailed occupation)
      15-1253  Software Quality Assurance Analysts and Testers (detailed occupation)
      15-1254  Web Developers (detailed occupation)
      15-1255  Web and Digital Interface Designers (detailed occupation)
```

---

## Geographic Area Codes

### Area Types

1. **National**: Area code `0000000`
2. **State**: Area code `0SSXXXX` (SS = state FIPS code)
3. **Metropolitan**: Area code `00MMMMM` (MMMMM = metro area code)

### Common State Codes

| State | Area Code | Example Wage Query |
|-------|-----------|-------------------|
| California | 0600000 | "California", "CA" |
| New York | 3600000 | "New York", "NY" |
| Texas | 4800000 | "Texas", "TX" |
| Florida | 1200000 | "Florida", "FL" |
| Illinois | 1700000 | "Illinois", "IL" |

### Common Metro Areas

| Metro Area | Area Code | Example Query |
|------------|-----------|---------------|
| San Francisco-Oakland-Hayward, CA | 0004190 | "San Francisco", "Bay Area" |
| New York-Newark-Jersey City, NY-NJ-PA | 0003556 | "New York City", "NYC" |
| Los Angeles-Long Beach-Anaheim, CA | 0003118 | "Los Angeles", "LA" |
| Chicago-Naperville-Elgin, IL-IN-WI | 0001680 | "Chicago" |
| Washington-Arlington-Alexandria, DC-VA-MD-WV | 0004790 | "Washington DC", "DMV" |

### Area Resolution Logic

The system automatically resolves location strings:

1. **National**: No location specified → National average
2. **State**: "California", "CA" → California state average
3. **Metro**: "San Francisco, CA" → San Francisco metro area

---

## Best Practices

### File Upload

1. **File Formats**
   - Use PDF for scanned documents
   - Use DOCX for editable text documents
   - Use XLSX for spreadsheets with job descriptions

2. **File Organization**
   - One job description per page (recommended)
   - Clear section headers for job titles
   - Include location information when possible

3. **File Size**
   - Keep files under 2 MB per file
   - Consider splitting large documents

### Error Handling

Always implement comprehensive error handling:

```javascript
async function processDocuments(files) {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  try {
    const response = await fetch('http://localhost:8000/api/pricing/process', {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(300000) // 5 minute timeout
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const blob = await response.blob();
    // Handle successful response
    return blob;

  } catch (error) {
    if (error.name === 'TimeoutError') {
      console.error('Request timed out. File may be too large.');
    } else if (error.name === 'AbortError') {
      console.error('Request was cancelled.');
    } else {
      console.error('Error processing documents:', error.message);
    }
    throw error;
  }
}
```

### Performance Optimization

1. **Batch Processing**
   - Upload multiple files in one request
   - System processes up to 10 jobs concurrently

2. **Caching**
   - FAISS index is cached after first load
   - MongoDB connection pooling enabled

3. **Timeout Configuration**
   - Set realistic timeouts (5-10 minutes)
   - Show progress indicators to users

### Security Considerations

1. **File Validation**
   - Always validate file types on client side
   - API validates server-side as well

2. **File Size Limits**
   - Enforce client-side file size checks
   - Prevent users from uploading extremely large files

3. **Malware Scanning**
   - Consider implementing malware scanning for production
   - Use services like ClamAV or cloud-based scanning

4. **HTTPS**
   - Always use HTTPS in production
   - Protect API keys and credentials

---

## Testing

### Interactive API Testing

Visit the auto-generated API documentation:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Sample Test Files

Use the provided example files in the repository:
- `Labor Information.pdf` - Example input document
- `Example Output.xlsx` - Expected output format

### Test Scenarios

1. **Single File Upload**
   ```bash
   curl -X POST http://localhost:8000/api/pricing/process \
     -F "files=@Labor_Information.pdf" \
     -o test_output.xlsx
   ```

2. **Multiple File Upload**
   ```bash
   curl -X POST http://localhost:8000/api/pricing/process \
     -F "files=@document1.pdf" \
     -F "files=@document2.docx" \
     -o test_output.xlsx
   ```

3. **Health Check**
   ```bash
   curl http://localhost:8000/health
   ```

4. **API Info**
   ```bash
   curl http://localhost:8000/
   ```

---

## Troubleshooting

### Common Issues

1. **"No files uploaded" Error**
   - Ensure `files` field name is used
   - Check file is properly attached to FormData

2. **"Failed to extract job descriptions" Error**
   - Document format may be unsupported
   - Document content may not contain clear job descriptions
   - Try with a different file format

3. **Missing Wage Data (null values)**
   - SOC code may not have wage data for specified location
   - Try using a broader location (state instead of metro)
   - Check BLS data availability for occupation

4. **Timeout Errors**
   - Increase client timeout setting
   - Consider splitting large documents
   - Check server logs for processing errors

5. **CORS Errors (Browser)**
   - Ensure server CORS middleware is properly configured
   - Check allowed origins in `app/server.py`

### Debug Mode

Enable debug logging by setting environment variable:

```bash
LOG_LEVEL=DEBUG uvicorn app.server:app --reload
```

---

## Versioning

Current API version: **1.0**

The API follows semantic versioning:
- **Major**: Breaking changes
- **Minor**: New features, backwards compatible
- **Patch**: Bug fixes

---

## Support

For issues or questions:
1. Check the interactive docs at `/docs`
2. Review example files in the repository
3. Check server logs for detailed error messages
4. Contact the development team

---

## Changelog

### Version 1.0 (Current)
- Initial release
- Document processing endpoint
- Support for PDF, DOCX, XLSX formats
- Parallel processing with 10 workers
- BLS OEWS wage data integration
- FAISS vector search for SOC matching
