# Frontend Integration Guide

Complete guide for frontend developers to integrate with the Government Contractor Pricing API.

## Table of Contents

- [Quick Start](#quick-start)
- [API Overview](#api-overview)
- [Implementation Examples](#implementation-examples)
- [UI/UX Recommendations](#uiux-recommendations)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Production Checklist](#production-checklist)

## Quick Start

### Prerequisites

- Backend API running at `http://localhost:8000`
- Modern browser with Fetch API support
- Basic understanding of FormData and Blob handling

### 30-Second Integration

```html
<!DOCTYPE html>
<html>
<head>
  <title>Pricing Upload</title>
</head>
<body>
  <form id="uploadForm">
    <input type="file" id="fileInput" multiple accept=".pdf,.docx,.xlsx" />
    <button type="submit">Process Documents</button>
  </form>
  <div id="status"></div>

  <script>
    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = document.getElementById('status');

      status.textContent = 'Processing...';

      const formData = new FormData();
      const files = document.getElementById('fileInput').files;
      Array.from(files).forEach(file => formData.append('files', file));

      try {
        const response = await fetch('http://localhost:8000/api/pricing/process', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pricing_results.xlsx';
        a.click();

        status.textContent = 'Success! File downloaded.';
      } catch (error) {
        status.textContent = 'Error: ' + error.message;
      }
    });
  </script>
</body>
</html>
```

## API Overview

### Base Configuration

```javascript
const API_CONFIG = {
  baseURL: 'http://localhost:8000',
  endpoints: {
    health: '/health',
    process: '/api/pricing/process'
  },
  timeout: 300000, // 5 minutes
  maxFileSize: 2 * 1024 * 1024, // 2 MB per file
  allowedTypes: ['.pdf', '.docx', '.xlsx']
};
```

### Expected Response Times

| File Size | Job Count | Processing Time |
|-----------|-----------|-----------------|
| < 1 MB | 1-5 jobs | 30-60 seconds |
| 1-5 MB | 5-20 jobs | 1-3 minutes |
| 5-10 MB | 20+ jobs | 3-5 minutes |

## Implementation Examples

### Vanilla JavaScript

#### Complete Implementation

```javascript
class PricingAPIClient {
  constructor(baseURL = 'http://localhost:8000') {
    this.baseURL = baseURL;
    this.timeout = 300000; // 5 minutes
  }

  async checkHealth() {
    const response = await fetch(`${this.baseURL}/health`);
    return response.json();
  }

  async processDocuments(files, options = {}) {
    const {
      onProgress,
      onError,
      signal
    } = options;

    // Validate files
    const errors = this.validateFiles(files);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }

    // Create FormData
    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });

    // Create timeout signal
    const timeoutSignal = AbortSignal.timeout(this.timeout);
    const combinedSignal = signal ?
      AbortSignal.any([signal, timeoutSignal]) :
      timeoutSignal;

    try {
      if (onProgress) onProgress('Uploading files...');

      const response = await fetch(`${this.baseURL}/api/pricing/process`, {
        method: 'POST',
        body: formData,
        signal: combinedSignal
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      if (onProgress) onProgress('Processing documents...');

      const blob = await response.blob();

      if (onProgress) onProgress('Download ready!');

      return blob;

    } catch (error) {
      if (onError) onError(error);
      throw error;
    }
  }

  validateFiles(files) {
    const errors = [];
    const allowedExtensions = ['.pdf', '.docx', '.xlsx'];
    const maxSize = 2 * 1024 * 1024; // 2 MB

    Array.from(files).forEach((file, index) => {
      // Check extension
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        errors.push(`File ${index + 1}: Invalid format (${ext})`);
      }

      // Check size
      if (file.size > maxSize) {
        errors.push(`File ${index + 1}: Too large (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      }
    });

    return errors;
  }

  downloadBlob(blob, filename = 'pricing_results.xlsx') {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}

// Usage
const client = new PricingAPIClient();

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const fileInput = document.getElementById('fileInput');
  const statusDiv = document.getElementById('status');

  try {
    const blob = await client.processDocuments(fileInput.files, {
      onProgress: (message) => {
        statusDiv.textContent = message;
      },
      onError: (error) => {
        console.error('Processing error:', error);
      }
    });

    client.downloadBlob(blob);
    statusDiv.textContent = 'Success! Check your downloads.';

  } catch (error) {
    statusDiv.textContent = `Error: ${error.message}`;
  }
});
```

### React Implementation

#### Using Hooks

```jsx
import React, { useState, useCallback } from 'react';
import axios from 'axios';

function PricingUpload() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);

  const validateFiles = useCallback((fileList) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const maxSize = 2 * 1024 * 1024; // 2 MB

    for (let file of fileList) {
      if (!allowedTypes.includes(file.type)) {
        return `Invalid file type: ${file.name}`;
      }
      if (file.size > maxSize) {
        return `File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      }
    }
    return null;
  }, []);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const validationError = validateFiles(selectedFiles);

    if (validationError) {
      setError(validationError);
      setFiles([]);
    } else {
      setError(null);
      setFiles(selectedFiles);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress('Uploading files...');

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const response = await axios.post(
        'http://localhost:8000/api/pricing/process',
        formData,
        {
          responseType: 'blob',
          timeout: 300000, // 5 minutes
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(`Uploading: ${percentCompleted}%`);
          }
        }
      );

      setProgress('Processing complete!');

      // Download the file
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'pricing_results.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setProgress('File downloaded successfully!');
      setTimeout(() => {
        setProgress('');
        setFiles([]);
      }, 3000);

    } catch (err) {
      console.error('Error:', err);
      if (err.code === 'ECONNABORTED') {
        setError('Request timed out. Please try with a smaller file.');
      } else if (err.response) {
        setError(`Server error: ${err.response.status}`);
      } else {
        setError('Network error. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pricing-upload">
      <h2>Upload Documents for Pricing</h2>

      <form onSubmit={handleSubmit}>
        <div className="file-input-wrapper">
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx"
            onChange={handleFileChange}
            disabled={loading}
          />
          {files.length > 0 && (
            <div className="file-list">
              <strong>Selected files:</strong>
              <ul>
                {files.map((file, index) => (
                  <li key={index}>
                    {file.name} ({(file.size / 1024).toFixed(2)} KB)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button type="submit" disabled={loading || files.length === 0}>
          {loading ? 'Processing...' : 'Upload & Process'}
        </button>
      </form>

      {progress && (
        <div className="progress-message">
          {progress}
        </div>
      )}

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
    </div>
  );
}

export default PricingUpload;
```

#### Custom Hook

```jsx
import { useState, useCallback } from 'react';
import axios from 'axios';

function usePricingAPI(baseURL = 'http://localhost:8000') {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');

  const processDocuments = useCallback(async (files) => {
    setLoading(true);
    setError(null);
    setProgress('Uploading...');

    const formData = new FormData();
    Array.from(files).forEach(file => formData.append('files', file));

    try {
      const response = await axios.post(
        `${baseURL}/api/pricing/process`,
        formData,
        {
          responseType: 'blob',
          timeout: 300000,
          onUploadProgress: (progressEvent) => {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(`Uploading: ${percent}%`);
          }
        }
      );

      setProgress('Processing complete!');
      return response.data;

    } catch (err) {
      const errorMessage = err.code === 'ECONNABORTED'
        ? 'Request timed out'
        : err.response?.data?.detail || err.message;

      setError(errorMessage);
      throw err;

    } finally {
      setLoading(false);
      setTimeout(() => setProgress(''), 3000);
    }
  }, [baseURL]);

  const downloadBlob = useCallback((blob, filename = 'pricing_results.xlsx') => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }, []);

  const checkHealth = useCallback(async () => {
    const response = await axios.get(`${baseURL}/health`);
    return response.data;
  }, [baseURL]);

  return {
    loading,
    error,
    progress,
    processDocuments,
    downloadBlob,
    checkHealth
  };
}

export default usePricingAPI;

// Usage
function MyComponent() {
  const { loading, error, progress, processDocuments, downloadBlob } = usePricingAPI();

  const handleSubmit = async (files) => {
    try {
      const blob = await processDocuments(files);
      downloadBlob(blob);
    } catch (err) {
      console.error('Failed to process:', err);
    }
  };

  return (
    <div>
      {loading && <p>{progress}</p>}
      {error && <p>Error: {error}</p>}
      {/* Your UI here */}
    </div>
  );
}
```

### Vue.js Implementation

```vue
<template>
  <div class="pricing-upload">
    <h2>Upload Documents for Pricing</h2>

    <form @submit.prevent="handleSubmit">
      <div class="file-input-wrapper">
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx"
          @change="handleFileChange"
          ref="fileInput"
          :disabled="loading"
        />

        <div v-if="files.length > 0" class="file-list">
          <strong>Selected files:</strong>
          <ul>
            <li v-for="(file, index) in files" :key="index">
              {{ file.name }} ({{ (file.size / 1024).toFixed(2) }} KB)
            </li>
          </ul>
        </div>
      </div>

      <button type="submit" :disabled="loading || files.length === 0">
        {{ loading ? 'Processing...' : 'Upload & Process' }}
      </button>
    </form>

    <div v-if="progress" class="progress-message">
      {{ progress }}
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'PricingUpload',

  data() {
    return {
      files: [],
      loading: false,
      progress: '',
      error: null,
      apiBaseURL: 'http://localhost:8000'
    };
  },

  methods: {
    handleFileChange(event) {
      this.files = Array.from(event.target.files);
      this.error = null;

      // Validate files
      const validationError = this.validateFiles(this.files);
      if (validationError) {
        this.error = validationError;
        this.files = [];
      }
    },

    validateFiles(fileList) {
      const maxSize = 2 * 1024 * 1024; // 2 MB
      const allowedExts = ['.pdf', '.docx', '.xlsx'];

      for (let file of fileList) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();

        if (!allowedExts.includes(ext)) {
          return `Invalid file type: ${file.name}`;
        }

        if (file.size > maxSize) {
          return `File too large: ${file.name}`;
        }
      }

      return null;
    },

    async handleSubmit() {
      if (this.files.length === 0) {
        this.error = 'Please select at least one file';
        return;
      }

      this.loading = true;
      this.error = null;
      this.progress = 'Uploading files...';

      const formData = new FormData();
      this.files.forEach(file => formData.append('files', file));

      try {
        const response = await axios.post(
          `${this.apiBaseURL}/api/pricing/process`,
          formData,
          {
            responseType: 'blob',
            timeout: 300000,
            onUploadProgress: (progressEvent) => {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              this.progress = `Uploading: ${percent}%`;
            }
          }
        );

        this.progress = 'Processing complete!';
        this.downloadBlob(response.data);

        setTimeout(() => {
          this.progress = '';
          this.files = [];
          this.$refs.fileInput.value = '';
        }, 3000);

      } catch (err) {
        console.error('Error:', err);

        if (err.code === 'ECONNABORTED') {
          this.error = 'Request timed out. Try a smaller file.';
        } else {
          this.error = err.response?.data?.detail || err.message;
        }
      } finally {
        this.loading = false;
      }
    },

    downloadBlob(blob) {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pricing_results.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
    }
  }
};
</script>

<style scoped>
.pricing-upload {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.file-input-wrapper {
  margin: 20px 0;
}

.file-list {
  margin-top: 10px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 4px;
}

.progress-message {
  color: #007bff;
  margin-top: 10px;
}

.error-message {
  color: #dc3545;
  margin-top: 10px;
}

button {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
```

### Angular Implementation

```typescript
// pricing-upload.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PricingUploadService {
  private baseURL = 'http://localhost:8000';

  constructor(private http: HttpClient) {}

  processDocuments(files: File[]): Observable<Blob> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    return this.http.post(
      `${this.baseURL}/api/pricing/process`,
      formData,
      {
        responseType: 'blob',
        reportProgress: true,
        observe: 'events'
      }
    ).pipe(
      map((event: HttpEvent<any>) => {
        if (event.type === HttpEventType.Response) {
          return event.body;
        }
        return null;
      }),
      catchError(error => {
        console.error('Upload error:', error);
        return throwError(() => error);
      })
    );
  }

  checkHealth(): Observable<any> {
    return this.http.get(`${this.baseURL}/health`);
  }

  downloadBlob(blob: Blob, filename = 'pricing_results.xlsx'): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }
}

// pricing-upload.component.ts
import { Component } from '@angular/core';
import { PricingUploadService } from './pricing-upload.service';

@Component({
  selector: 'app-pricing-upload',
  templateUrl: './pricing-upload.component.html',
  styleUrls: ['./pricing-upload.component.css']
})
export class PricingUploadComponent {
  files: File[] = [];
  loading = false;
  progress = '';
  error: string | null = null;

  constructor(private pricingService: PricingUploadService) {}

  onFileChange(event: any): void {
    this.files = Array.from(event.target.files);
    this.error = null;
  }

  onSubmit(): void {
    if (this.files.length === 0) {
      this.error = 'Please select at least one file';
      return;
    }

    this.loading = true;
    this.error = null;
    this.progress = 'Processing...';

    this.pricingService.processDocuments(this.files).subscribe({
      next: (blob) => {
        if (blob) {
          this.pricingService.downloadBlob(blob);
          this.progress = 'Success!';
          setTimeout(() => {
            this.progress = '';
            this.files = [];
          }, 3000);
        }
      },
      error: (error) => {
        this.error = error.error?.detail || 'Processing failed';
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      }
    });
  }
}

// pricing-upload.component.html
<div class="pricing-upload">
  <h2>Upload Documents for Pricing</h2>

  <form (ngSubmit)="onSubmit()">
    <input
      type="file"
      multiple
      accept=".pdf,.docx,.xlsx"
      (change)="onFileChange($event)"
      [disabled]="loading"
    />

    <div *ngIf="files.length > 0" class="file-list">
      <strong>Selected files:</strong>
      <ul>
        <li *ngFor="let file of files">
          {{ file.name }} ({{ (file.size / 1024).toFixed(2) }} KB)
        </li>
      </ul>
    </div>

    <button type="submit" [disabled]="loading || files.length === 0">
      {{ loading ? 'Processing...' : 'Upload & Process' }}
    </button>
  </form>

  <div *ngIf="progress" class="progress-message">
    {{ progress }}
  </div>

  <div *ngIf="error" class="error-message">
    {{ error }}
  </div>
</div>
```

## UI/UX Recommendations

### File Upload Interface

```jsx
// Drag-and-drop file upload component
import React, { useState, useCallback } from 'react';

function DragDropUpload({ onFilesSelected }) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  }, [onFilesSelected]);

  const handleChange = useCallback((e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
  }, [onFilesSelected]);

  return (
    <div
      className={`drag-drop-area ${dragActive ? 'active' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx"
        onChange={handleChange}
        style={{ display: 'none' }}
        id="fileInput"
      />
      <label htmlFor="fileInput">
        <p>Drag and drop files here, or click to browse</p>
        <p className="hint">Supported formats: PDF, DOCX, XLSX</p>
      </label>
    </div>
  );
}

// CSS
/*
.drag-drop-area {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
}

.drag-drop-area.active {
  border-color: #007bff;
  background-color: #f0f8ff;
}

.drag-drop-area:hover {
  border-color: #007bff;
}

.hint {
  font-size: 14px;
  color: #666;
  margin-top: 8px;
}
*/
```

### Progress Indicator

```jsx
function ProgressIndicator({ status, progress }) {
  return (
    <div className="progress-indicator">
      <div className="progress-steps">
        <Step
          title="Uploading"
          active={status === 'uploading'}
          completed={['processing', 'complete'].includes(status)}
        />
        <Step
          title="Processing"
          active={status === 'processing'}
          completed={status === 'complete'}
        />
        <Step
          title="Complete"
          active={status === 'complete'}
          completed={status === 'complete'}
        />
      </div>

      {progress > 0 && progress < 100 && (
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Step({ title, active, completed }) {
  return (
    <div className={`step ${active ? 'active' : ''} ${completed ? 'completed' : ''}`}>
      <div className="step-icon">
        {completed ? '✓' : '○'}
      </div>
      <div className="step-title">{title}</div>
    </div>
  );
}
```

### File Preview

```jsx
function FilePreview({ files, onRemove }) {
  return (
    <div className="file-preview">
      {files.map((file, index) => (
        <div key={index} className="file-item">
          <div className="file-icon">
            {getFileIcon(file.name)}
          </div>
          <div className="file-info">
            <div className="file-name">{file.name}</div>
            <div className="file-size">
              {(file.size / 1024).toFixed(2)} KB
            </div>
          </div>
          <button
            className="remove-button"
            onClick={() => onRemove(index)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄',
    docx: '📝',
    xlsx: '📊'
  };
  return icons[ext] || '📎';
}
```

## Error Handling

### Comprehensive Error Handler

```javascript
class APIError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.detail = detail;
  }
}

async function handleAPIRequest(request) {
  try {
    return await request();
  } catch (error) {
    // Network errors
    if (error.name === 'AbortError') {
      throw new APIError('Request was cancelled', 0, 'User cancelled');
    }

    if (error.name === 'TimeoutError' || error.code === 'ECONNABORTED') {
      throw new APIError(
        'Request timed out. The file may be too large or the server is busy.',
        408,
        'Timeout'
      );
    }

    if (!navigator.onLine) {
      throw new APIError(
        'No internet connection. Please check your network.',
        0,
        'Network offline'
      );
    }

    // HTTP errors
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail || error.message;

      if (status === 400) {
        throw new APIError('Invalid request. Please check your files.', status, detail);
      }

      if (status === 422) {
        throw new APIError('Validation failed. Please check file formats and sizes.', status, detail);
      }

      if (status === 500) {
        throw new APIError('Server error. Please try again later.', status, detail);
      }

      throw new APIError(`Request failed with status ${status}`, status, detail);
    }

    // Unknown errors
    throw new APIError('An unexpected error occurred', 0, error.message);
  }
}

// Usage
try {
  await handleAPIRequest(async () => {
    return await processDocuments(files);
  });
} catch (error) {
  if (error instanceof APIError) {
    console.error(`Error ${error.status}: ${error.message}`);
    // Show user-friendly message
    showToast(error.message, 'error');
  } else {
    console.error('Unexpected error:', error);
    showToast('Something went wrong', 'error');
  }
}
```

### User-Friendly Error Messages

```javascript
const ERROR_MESSAGES = {
  400: {
    title: 'Invalid Request',
    message: 'The files you uploaded couldn\'t be processed. Please check the format and try again.',
    action: 'Check files'
  },
  408: {
    title: 'Request Timeout',
    message: 'The request took too long. Try uploading fewer or smaller files.',
    action: 'Try smaller files'
  },
  422: {
    title: 'Validation Error',
    message: 'Some files don\'t meet the requirements. Please check file types and sizes.',
    action: 'Review requirements'
  },
  500: {
    title: 'Server Error',
    message: 'Something went wrong on our end. Please try again in a few minutes.',
    action: 'Try again'
  },
  0: {
    title: 'Connection Error',
    message: 'Unable to connect to the server. Please check your internet connection.',
    action: 'Check connection'
  }
};

function showErrorNotification(error) {
  const errorInfo = ERROR_MESSAGES[error.status] || ERROR_MESSAGES[0];

  // Show notification (example with toast)
  toast({
    title: errorInfo.title,
    description: errorInfo.message,
    action: errorInfo.action,
    variant: 'destructive'
  });
}
```

## Testing

### Unit Tests (Jest)

```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import PricingUpload from './PricingUpload';

const server = setupServer(
  rest.post('http://localhost:8000/api/pricing/process', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      ctx.body(new Blob(['fake excel data']))
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('uploads files and downloads result', async () => {
  render(<PricingUpload />);

  const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
  const input = screen.getByLabelText(/upload/i);

  fireEvent.change(input, { target: { files: [file] } });

  const submitButton = screen.getByRole('button', { name: /upload/i });
  fireEvent.click(submitButton);

  await waitFor(() => {
    expect(screen.getByText(/success/i)).toBeInTheDocument();
  });
});

test('shows error on failed upload', async () => {
  server.use(
    rest.post('http://localhost:8000/api/pricing/process', (req, res, ctx) => {
      return res(
        ctx.status(500),
        ctx.json({ detail: 'Server error' })
      );
    })
  );

  render(<PricingUpload />);

  const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
  const input = screen.getByLabelText(/upload/i);

  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /upload/i }));

  await waitFor(() => {
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
```

### End-to-End Tests (Cypress)

```javascript
describe('Pricing Upload', () => {
  beforeEach(() => {
    cy.visit('/pricing-upload');
  });

  it('uploads a file and downloads results', () => {
    // Intercept API request
    cy.intercept('POST', '/api/pricing/process', {
      statusCode: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      body: 'fake excel data'
    }).as('uploadRequest');

    // Upload file
    cy.get('input[type="file"]').selectFile('cypress/fixtures/test.pdf');

    // Submit form
    cy.get('button[type="submit"]').click();

    // Wait for request
    cy.wait('@uploadRequest');

    // Check success message
    cy.contains('Success').should('be.visible');
  });

  it('shows error for invalid file type', () => {
    cy.get('input[type="file"]').selectFile('cypress/fixtures/invalid.txt');
    cy.contains('Invalid file type').should('be.visible');
  });

  it('handles server errors gracefully', () => {
    cy.intercept('POST', '/api/pricing/process', {
      statusCode: 500,
      body: { detail: 'Server error' }
    }).as('uploadError');

    cy.get('input[type="file"]').selectFile('cypress/fixtures/test.pdf');
    cy.get('button[type="submit"]').click();

    cy.wait('@uploadError');
    cy.contains('error', { matchCase: false }).should('be.visible');
  });
});
```

## Production Checklist

### Pre-Deployment

- [ ] Update API base URL to production endpoint
- [ ] Enable CORS for your domain in backend
- [ ] Configure proper error tracking (Sentry, LogRocket, etc.)
- [ ] Add analytics tracking for file uploads
- [ ] Implement rate limiting on client side
- [ ] Add file size validation before upload
- [ ] Test with production-sized files
- [ ] Verify HTTPS is enforced

### Security

- [ ] Validate file types on client and server
- [ ] Implement CSRF protection if using cookies
- [ ] Add authentication if required
- [ ] Sanitize file names before display
- [ ] Implement virus scanning for uploads
- [ ] Use HTTPS for all requests
- [ ] Add Content Security Policy headers

### Performance

- [ ] Implement upload progress tracking
- [ ] Add file compression before upload
- [ ] Use lazy loading for heavy components
- [ ] Implement request caching where appropriate
- [ ] Add loading skeletons for better UX
- [ ] Optimize bundle size (code splitting)

### Monitoring

- [ ] Log all errors to monitoring service
- [ ] Track upload success/failure rates
- [ ] Monitor average processing times
- [ ] Set up alerts for high error rates
- [ ] Track user engagement metrics

### User Experience

- [ ] Add tooltips for file requirements
- [ ] Show estimated processing time
- [ ] Implement retry mechanism for failed uploads
- [ ] Add confirmation before leaving page during upload
- [ ] Provide sample files for testing
- [ ] Add help documentation link

## Support

For additional help:
- API Documentation: See `API_DOCUMENTATION.md`
- Backend Setup: See `README.md`
- Interactive API Testing: Visit `/docs` endpoint

## Examples Repository

Check the `examples/` directory (if available) for:
- Complete working examples
- Sample files for testing
- Additional integration patterns
- Advanced use cases
