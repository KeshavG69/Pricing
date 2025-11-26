'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import Button from '@/components/ui/Button';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Upload, File, X, AlertCircle } from 'lucide-react';

export default function UploadPage() {
  const router = useRouter();
  const { uploadDocuments, isLoading } = useProposalsStore();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    setFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: true,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    try {
      setError(null);
      const proposalId = await uploadDocuments(files);

      // Redirect to proposal page to see status
      router.push(`/proposals/${proposalId}`);
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <DashboardLayout>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-50 mb-2">Upload Documents</h1>
          <p className="text-slate-400">
            Upload RFPs, SOWs, or other documents containing job descriptions
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Document Upload</CardTitle>
            <CardDescription>
              Supported formats: PDF, DOCX, XLSX, XLS
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
                transition-colors
                ${
                  isDragActive
                    ? 'border-emerald-500 bg-emerald-500/5'
                    : 'border-slate-700 hover:border-slate-600'
                }
              `}
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              {isDragActive ? (
                <p className="text-emerald-400">Drop files here...</p>
              ) : (
                <>
                  <p className="text-slate-300 mb-2">
                    Drag and drop files here, or click to browse
                  </p>
                  <p className="text-sm text-slate-500">
                    PDF, DOCX, XLSX files up to 50MB each
                  </p>
                </>
              )}
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-6 space-y-2">
                <p className="text-sm font-medium text-slate-300 mb-3">
                  Selected files ({files.length})
                </p>
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-900/30 border border-slate-800"
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <File className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-50 truncate">{file.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleUpload}
                isLoading={isLoading}
                disabled={files.length === 0}
              >
                Upload & Process
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="mt-6 text-sm text-slate-400">
          <p className="mb-2">What happens next:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-500">
            <li>Documents will be analyzed using AI to extract job descriptions</li>
            <li>Each position will be matched to BLS wage data automatically</li>
            <li>You'll be able to review and adjust the pricing in the next step</li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}
