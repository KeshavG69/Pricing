# Government Contractor Pricing API - Documentation

## Overview

This API provides endpoints for government contractor pricing workflows:

1. **Document Processing** - Parse job descriptions and fetch wage data
2. **Excel Generation** - Create professional cost proposal Excel files
3. **Authentication** - User management with Google OAuth

## Base URL

```
http://localhost:8000
```

## Interactive Documentation

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## Excel Export Endpoints

### 1. Get Configuration Template

**Endpoint:** `GET /api/excel/template`

Get a template showing the required structure for generating Excel cost proposals.

### 2. Generate Excel from Job Data (Recommended)

**Endpoint:** `POST /api/excel/generate-from-data`

Generate Excel cost proposal from pre-processed job data.

### 3. Generate Excel from Documents (Full Pipeline)

**Endpoint:** `POST /api/excel/generate-from-documents`

Upload documents and generate Excel in one step. Uses default configuration.

---

## Complete Workflow

Visit `http://localhost:8000/docs` for interactive API documentation with full examples and schemas.

