'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { useProposalPolling } from '@/lib/hooks/useProposalPolling';
import Button from '@/components/ui/Button';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import ProcessingLoader from '@/components/ui/ProcessingLoader';
import { Upload, File, X, AlertCircle } from 'lucide-react';

export default function UploadPage() {
  const router = useRouter();
  const { uploadDocuments, isLoading } = useProposalsStore();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [proposalName, setProposalName] = useState('');
  const [solicitationNumber, setSolicitationNumber] = useState('');
  const [uploadedProposalId, setUploadedProposalId] = useState<string | null>(null);

  // Poll status after upload
  const { status, isPolling, error: pollingError } = useProposalPolling(uploadedProposalId);

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

    if (!proposalName.trim()) {
      setError('Please enter a proposal name');
      return;
    }

    try {
      setError(null);
      const proposalId = await uploadDocuments(
        files,
        proposalName.trim(),
        solicitationNumber.trim() || undefined
      );

      // Start polling for status (don't redirect immediately)
      setUploadedProposalId(proposalId);
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    }
  };

  // Redirect when processing is complete
  useEffect(() => {
    if (status?.status === 'completed' && uploadedProposalId) {
      router.push(`/proposals/${uploadedProposalId}`);
    }
  }, [status, uploadedProposalId, router]);

  // Show polling error if it occurs
  useEffect(() => {
    if (pollingError) {
      setError(pollingError);
    }
  }, [pollingError]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Show processing loader while uploading or polling
  if (isLoading || isPolling) {
    return (
      <DashboardLayout>
        <div className="h-[calc(100vh-100px)] flex items-center justify-center">
          <ProcessingLoader
            progress={status?.progress || 0}
            message={status?.message || 'Uploading documents...'}
            status={status?.status || 'processing'}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Upload Documents</h1>
          <p className="text-muted-foreground">
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
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 flex items-start space-x-2">
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
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }
              `}
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              {isDragActive ? (
                <p className="text-primary font-medium">Drop files here...</p>
              ) : (
                <>
                  <p className="text-foreground font-medium mb-2">
                    Drag and drop files here, or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground">
                    PDF, DOCX, XLSX files up to 50MB each
                  </p>
                </>
              )}
            </div>

            {/* Proposal Details */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Proposal Name <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g., Navy IT Support Services"
                  value={proposalName}
                  onChange={(e) => setProposalName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Solicitation Number (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g., N0017825R3013"
                  value={solicitationNumber}
                  onChange={(e) => setSolicitationNumber(e.target.value)}
                />
              </div>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-6 space-y-2">
                <p className="text-sm font-medium text-foreground mb-3">
                  Selected files ({files.length})
                </p>
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border"
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <File className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-muted-foreground hover:text-red-600 transition-colors"
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
                disabled={files.length === 0 || !proposalName.trim()}
              >
                Upload & Process
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="mt-6 text-sm text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">What happens next:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Documents will be analyzed using AI to extract job descriptions</li>
            <li>Each position will be matched to BLS wage data automatically</li>
            <li>You'll be able to review and adjust the pricing in the next step</li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}
