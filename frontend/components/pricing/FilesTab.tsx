'use client';

import { useState, useEffect } from 'react';
import { FileText, Download, ExternalLink, RefreshCw, File, FileSpreadsheet, Eye, X, Loader2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import Button from '@/components/ui/Button';
import { DocumentInfo } from '@/types';
import { proposalsApi } from '@/lib/api/proposals';
import { useToast } from '@/lib/hooks/useToast';

interface FilesTabProps {
  documents: DocumentInfo[];
  proposalId: string;
  onUrlsRefreshed?: (updatedDocuments: DocumentInfo[]) => void;
}

// Helper to check if file is a spreadsheet (Excel or CSV)
const isSpreadsheetFile = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['xlsx', 'xls', 'csv'].includes(ext || '');
};

// Helper to check if file is a PDF
const isPdfFile = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'pdf';
};

// Helper to check if file is a text file (TXT, RTF)
const isTextFile = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['txt', 'rtf'].includes(ext || '');
};

// RTF to plain text converter
const stripRtf = (rtf: string): string => {
  // Remove font table, color table, stylesheet, and other header blocks
  let text = rtf
    // Remove {\fonttbl...}, {\colortbl...}, {\stylesheet...}, {\*\...} blocks
    .replace(/\{\\fonttbl[^{}]*(\{[^{}]*\}[^{}]*)*\}/gi, '')
    .replace(/\{\\colortbl[^{}]*\}/gi, '')
    .replace(/\{\\\*\\[^{}]*(\{[^{}]*\}[^{}]*)*\}/gi, '')
    .replace(/\{\\stylesheet[^{}]*(\{[^{}]*\}[^{}]*)*\}/gi, '')
    .replace(/\{\\info[^{}]*(\{[^{}]*\}[^{}]*)*\}/gi, '')
    .replace(/\{\\header[^{}]*(\{[^{}]*\}[^{}]*)*\}/gi, '')
    .replace(/\{\\footer[^{}]*(\{[^{}]*\}[^{}]*)*\}/gi, '');

  // Process the RTF content
  const output: string[] = [];
  let i = 0;
  let skipGroup = 0;

  while (i < text.length) {
    const char = text[i];

    if (char === '{') {
      // Check if this is a group to skip (like \*\, \pict, etc.)
      const ahead = text.slice(i + 1, i + 20);
      if (ahead.match(/^\\(\*|pict|object|fldinst|bkmk|xe|tc|rxe)/i)) {
        skipGroup++;
      }
      i++;
    } else if (char === '}') {
      if (skipGroup > 0) skipGroup--;
      i++;
    } else if (skipGroup > 0) {
      i++;
    } else if (char === '\\') {
      // Handle control words
      const match = text.slice(i).match(/^\\([a-z]+)(-?\d+)?[ ]?/i);
      if (match) {
        const word = match[1].toLowerCase();
        const param = match[2] ? parseInt(match[2]) : null;

        if (word === 'par' || word === 'line') {
          output.push('\n');
        } else if (word === 'tab') {
          output.push('\t');
        } else if (word === 'u' && param !== null) {
          // Unicode character
          output.push(String.fromCharCode(param < 0 ? param + 65536 : param));
        }
        i += match[0].length;
      } else if (text[i + 1] === "'") {
        // Hex character \'XX
        const hex = text.slice(i + 2, i + 4);
        if (/^[0-9a-f]{2}$/i.test(hex)) {
          output.push(String.fromCharCode(parseInt(hex, 16)));
          i += 4;
        } else {
          i++;
        }
      } else if (text[i + 1] === '\\' || text[i + 1] === '{' || text[i + 1] === '}') {
        // Escaped characters
        output.push(text[i + 1]);
        i += 2;
      } else {
        i++;
      }
    } else if (char === '\r' || char === '\n') {
      i++;
    } else {
      output.push(char);
      i++;
    }
  }

  return output.join('')
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .trim();
};

// Text Preview Component (handles TXT, RTF)
function TextPreview({ url, filename }: { url: string; filename: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    const fetchAndParse = async () => {
      try {
        setLoading(true);
        setError(null);

        const proxyUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/proposals/document-proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) {
          throw new Error('Failed to fetch document');
        }

        let text = await response.text();
        const ext = filename.split('.').pop()?.toLowerCase();

        // Strip RTF formatting if it's an RTF file
        if (ext === 'rtf' && text.startsWith('{\\rtf')) {
          text = stripRtf(text);
        }

        setContent(text);
      } catch (err) {
        console.error('Error loading text file:', err);
        setError('Failed to load text file. Try downloading instead.');
      } finally {
        setLoading(false);
      }
    };

    fetchAndParse();
  }, [url, filename]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading text file...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <FileText className="w-16 h-16 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto border border-border rounded bg-muted/20">
      <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words text-foreground">
        {content}
      </pre>
    </div>
  );
}

// Helper to format cell values (round numbers with long decimals to 2 decimal places)
const formatCellValue = (value: string): string => {
  if (!value || value.trim() === '') return value;

  // Check if value has a decimal point
  if (!value.includes('.')) return value;

  // Try to parse as a number
  const num = parseFloat(value);
  if (isNaN(num) || !isFinite(num)) return value;

  // Count decimal places in original value
  const decimalPart = value.split('.')[1];
  if (!decimalPart || decimalPart.length <= 2) {
    // Already 2 or fewer decimal places, leave as-is
    return value;
  }

  // Has more than 2 decimal places, round to 2
  return num.toFixed(2);
};

// Spreadsheet Preview Component (handles XLSX, XLS, CSV)
const MAX_ROWS = 1000; // Limit rows to prevent browser freeze

function SpreadsheetPreview({ url, filename }: { url: string; filename: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<{ name: string; headers: string[]; rows: string[][]; totalRows: number }[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    const fetchAndParse = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch through the proxy endpoint
        const proxyUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/proposals/document-proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) {
          throw new Error('Failed to fetch document');
        }

        const ext = filename.split('.').pop()?.toLowerCase();
        let workbook: XLSX.WorkBook;

        if (ext === 'csv') {
          const text = await response.text();
          workbook = XLSX.read(text, { type: 'string' });
        } else {
          const arrayBuffer = await response.arrayBuffer();
          workbook = XLSX.read(arrayBuffer, { type: 'array' });
        }

        // Convert each sheet to JSON (much more efficient than HTML)
        const sheetData = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name];
          const json = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
          const totalRows = json.length;
          const headers: string[] = Array.isArray(json[0]) ? json[0].map(h => String(h)) : [];
          const rows: string[][] = json.slice(1, MAX_ROWS + 1).map(row =>
            Array.isArray(row) ? row.map(cell => String(cell ?? '')) : []
          );
          return { name, headers, rows, totalRows };
        });

        setSheets(sheetData);
      } catch (err) {
        console.error('Error parsing spreadsheet:', err);
        setError('Failed to load spreadsheet. Try downloading the file instead.');
      } finally {
        setLoading(false);
      }
    };

    fetchAndParse();
  }, [url, filename]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading spreadsheet...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <FileSpreadsheet className="w-16 h-16 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  const currentSheet = sheets[activeSheet];

  return (
    <div className="flex flex-col h-full">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex border-b border-border mb-2 overflow-x-auto flex-shrink-0">
          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(index)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                activeSheet === index
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Row count info */}
      {currentSheet && currentSheet.totalRows > MAX_ROWS && (
        <div className="text-sm text-muted-foreground mb-2 flex-shrink-0">
          Showing {MAX_ROWS} of {currentSheet.totalRows - 1} rows. Download the file to view all data.
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto border border-border rounded">
        {currentSheet && (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {currentSheet.headers.map((header, i) => (
                  <th
                    key={i}
                    className="border-b border-r border-border px-3 py-2 text-left font-semibold whitespace-nowrap"
                  >
                    {String(header) || `Column ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentSheet.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-muted/50 even:bg-muted/20">
                  {currentSheet.headers.map((_, colIndex) => (
                    <td
                      key={colIndex}
                      className="border-b border-r border-border px-3 py-1.5 whitespace-nowrap"
                    >
                      {formatCellValue(String(row[colIndex] ?? ''))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function FilesTab({ documents, proposalId, onUrlsRefreshed }: FilesTabProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ doc: DocumentInfo; index: number } | null>(null);
  const [showReingestModal, setShowReingestModal] = useState(false);
  const [reingestFiles, setReingestFiles] = useState<File[]>([]);
  const [isReingesting, setIsReingesting] = useState(false);
  const toast = useToast();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return 'Unknown date';

    // Handle Python datetime format with microseconds (2025-12-29T15:11:09.201000)
    // Truncate to milliseconds for JS compatibility
    const normalizedDate = dateStr.replace(/(\.\d{3})\d*/, '$1');
    const date = new Date(normalizedDate);

    if (isNaN(date.getTime())) return 'Unknown date';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      return <FileText className="w-8 h-8 text-red-500" />;
    } else if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
      return <FileSpreadsheet className="w-8 h-8 text-green-600" />;
    } else if (['doc', 'docx'].includes(ext || '')) {
      return <FileText className="w-8 h-8 text-blue-600" />;
    } else if (['txt', 'rtf'].includes(ext || '')) {
      return <FileText className="w-8 h-8 text-gray-600" />;
    }
    return <File className="w-8 h-8 text-muted-foreground" />;
  };

  const handleDownload = (doc: DocumentInfo) => {
    if (doc.idrive_url) {
      window.open(doc.idrive_url, '_blank');
    } else {
      toast.error('Download link not available');
    }
  };

  const handlePreview = (doc: DocumentInfo, index: number) => {
    if (!doc.idrive_url) {
      toast.error('Preview not available - no document URL');
      return;
    }
    setPreviewDoc({ doc, index });
  };

  const handleRefreshUrls = async () => {
    setIsRefreshing(true);
    try {
      const updatedProposal = await proposalsApi.refreshDocumentUrls(proposalId);
      toast.success('Download links refreshed');
      onUrlsRefreshed?.(updatedProposal.documents || []);
    } catch (error) {
      toast.error('Failed to refresh document links');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleReingestSubmit = async () => {
    if (reingestFiles.length === 0) {
      toast.error('Please select at least one file');
      return;
    }

    setIsReingesting(true);
    let pollInterval: NodeJS.Timeout | null = null;

    try {
      // Start re-ingestion
      const response = await proposalsApi.reingest(proposalId, reingestFiles);
      console.log('[Re-ingest] Started:', response);

      toast.success(`Re-ingestion started! Processing ${reingestFiles.length} file(s)...`);
      setShowReingestModal(false);
      setReingestFiles([]);

      // Poll for completion
      let consecutiveErrors = 0;

      // Function to check status
      const checkStatus = async () => {
        try {
          console.log(`[Re-ingest] Polling status for proposal ${proposalId}...`);
          const status = await proposalsApi.getStatus(proposalId);
          console.log('[Re-ingest] Status response:', status);

          // Reset error counter on successful poll
          consecutiveErrors = 0;

          if (status.status === 'completed') {
            if (pollInterval) clearInterval(pollInterval);
            toast.success('Re-ingestion complete! Reloading...');
            setTimeout(() => {
              window.location.reload();
            }, 1000);
            return true; // Stop polling
          } else if (status.status === 'error') {
            if (pollInterval) clearInterval(pollInterval);
            const errorMsg = status.message || 'Unknown error';
            toast.error('Re-ingestion failed: ' + errorMsg);
            console.error('Re-ingestion error details:', status);
            setIsReingesting(false);
            return true; // Stop polling
          } else {
            // Still processing
            console.log(`[Re-ingest] Status: ${status.status}, Progress: ${status.progress}%, Message: ${status.message}`);
            return false; // Continue polling
          }
        } catch (error: any) {
          consecutiveErrors++;
          console.error(`[Re-ingest] Polling error (${consecutiveErrors}/3):`, error);
          console.error('[Re-ingest] Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
          });

          // After 3 consecutive failures, stop polling
          if (consecutiveErrors >= 3) {
            if (pollInterval) clearInterval(pollInterval);
            toast.error('Failed to check processing status. Please refresh the page.');
            setIsReingesting(false);
            return true; // Stop polling
          }
          return false; // Continue polling
        }
      };

      // Check immediately after 5 seconds
      setTimeout(async () => {
        const shouldStop = await checkStatus();
        if (shouldStop) return;
      }, 5000);

      // Then poll every 30 seconds
      pollInterval = setInterval(async () => {
        await checkStatus();
      }, 30000); // Poll every 30 seconds

      // Timeout after 10 minutes
      setTimeout(() => {
        if (pollInterval) clearInterval(pollInterval);
        if (isReingesting) {
          toast.error('Processing timeout - please refresh the page to check status');
          setIsReingesting(false);
        }
      }, 600000);

    } catch (error: any) {
      console.error('[Re-ingest] Submission error:', error);
      console.error('[Re-ingest] Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      toast.error(error.response?.data?.detail || 'Re-ingestion failed');
      setIsReingesting(false);
      if (pollInterval) clearInterval(pollInterval);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReingestFiles(Array.from(e.target.files));
    }
  };

  if (!documents || documents.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">No documents</h3>
        <p className="text-muted-foreground">No source files were uploaded with this proposal.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Processing Indicator */}
      {isReingesting && (
        <div className="bg-[#5B7FFF] text-white rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            <div>
              <p className="text-sm font-semibold">
                Re-ingesting documents...
              </p>
              <p className="text-xs opacity-90 mt-1">
                This may take a few minutes. Please don't close this page.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Source Documents</h3>
          <p className="text-sm text-muted-foreground">
            {documents.length} file{documents.length !== 1 ? 's' : ''} uploaded for this proposal
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReingestModal(true)}
          >
            <Upload className="w-4 h-4 mr-2" />
            Re-Upload & Replace
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshUrls}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Links
          </Button>
        </div>
      </div>

      {/* File List */}
      <div className="border border-border rounded-lg divide-y divide-border">
        {documents.map((doc, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-4">
              {getFileIcon(doc.filename)}
              <div>
                <p className="font-medium text-foreground">{doc.filename}</p>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{formatFileSize(doc.file_size)}</span>
                  <span>•</span>
                  <span>Uploaded {formatDate((doc as any).upload_date || doc.uploadDate)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePreview(doc, index)}
                disabled={!doc.idrive_url}
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(doc)}
                disabled={!doc.idrive_url}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              {doc.idrive_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(doc.idrive_url, '_blank')}
                  title="Open in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Re-Ingest Modal */}
      {showReingestModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowReingestModal(false)}
        >
          <div
            className="bg-background rounded-lg shadow-xl w-[500px] max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Re-Upload & Replace Data</h3>
                <p className="text-sm text-muted-foreground mt-1">Upload new files to replace proposal data</p>
              </div>
              <button
                onClick={() => setShowReingestModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Warning */}
              <div className="bg-[#5B7FFF]/10 border border-[#5B7FFF]/30 rounded-lg p-4">
                <p className="text-sm text-[#5B7FFF] font-semibold mb-2">
                  ⚠️ This will replace all proposal data
                </p>
                <ul className="text-sm text-[#5B7FFF]/90 space-y-1 list-disc list-inside">
                  <li>All positions will be deleted and replaced with new data</li>
                  <li>Subcontractor names will be kept (positions cleared)</li>
                </ul>
              </div>

              {/* File Input */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Select Files
                </label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.xlsx,.xls,.txt,.rtf"
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-foreground
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-primary file:text-primary-foreground
                    hover:file:bg-primary/90
                    cursor-pointer"
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  Supported: PDF, Word, Excel, Text (multiple files allowed)
                </p>
              </div>

              {/* Selected Files */}
              {reingestFiles.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    Selected Files ({reingestFiles.length})
                  </label>
                  <div className="border border-border rounded-lg divide-y divide-border max-h-40 overflow-y-auto">
                    {reingestFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.name)}
                          <div>
                            <p className="text-sm font-medium text-foreground">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
              <Button
                variant="outline"
                onClick={() => setShowReingestModal(false)}
                disabled={isReingesting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReingestSubmit}
                disabled={isReingesting || reingestFiles.length === 0}
              >
                {isReingesting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload & Replace
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="bg-background rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                {getFileIcon(previewDoc.doc.filename)}
                <div>
                  <h3 className="font-semibold text-foreground">{previewDoc.doc.filename}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(previewDoc.doc.file_size)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(previewDoc.doc)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 p-4 overflow-hidden">
              {isSpreadsheetFile(previewDoc.doc.filename) ? (
                <SpreadsheetPreview
                  url={previewDoc.doc.idrive_url}
                  filename={previewDoc.doc.filename}
                />
              ) : isPdfFile(previewDoc.doc.filename) ? (
                <iframe
                  src={`${process.env.NEXT_PUBLIC_API_URL}/api/proposals/document-proxy?url=${encodeURIComponent(previewDoc.doc.idrive_url)}&filename=${encodeURIComponent(previewDoc.doc.filename)}`}
                  className="w-full h-full border border-border rounded"
                  title={previewDoc.doc.filename}
                />
              ) : isTextFile(previewDoc.doc.filename) ? (
                <TextPreview
                  url={previewDoc.doc.idrive_url}
                  filename={previewDoc.doc.filename}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <File className="w-16 h-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-foreground mb-2">Preview not available</p>
                  <p className="text-muted-foreground mb-4">
                    This file type cannot be previewed. Please download to view.
                  </p>
                  <Button onClick={() => handleDownload(previewDoc.doc)}>
                    <Download className="w-4 h-4 mr-2" />
                    Download File
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FilesTab;
