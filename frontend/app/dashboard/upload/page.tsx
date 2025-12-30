'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { useCompanyRepositoryStore } from '@/lib/stores/companyRepositoryStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { useBillingStore } from '@/lib/stores/billingStore';
import { useProposalPolling } from '@/lib/hooks/useProposalPolling';
import Button from '@/components/ui/Button';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import ProcessingLoader from '@/components/ui/ProcessingLoader';
import { Upload, File, X, AlertCircle, Database, Building2 } from 'lucide-react';
import { isAdmin } from '@/lib/utils/permissions';

export default function UploadPage() {
  const router = useRouter();
  const { uploadDocuments, isLoading } = useProposalsStore();
  const { user } = useAuthStore();
  const { contracts, fetchContracts } = useCompanyRepositoryStore();
  const { status: billingStatus, fetchBillingStatus, setShowPaymentRequiredModal } = useBillingStore();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [proposalName, setProposalName] = useState('');
  const [solicitationNumber, setSolicitationNumber] = useState('');
  const [uploadedProposalId, setUploadedProposalId] = useState<string | null>(null);

  // Wage source state
  const [wageSourceType, setWageSourceType] = useState<'bls' | 'gsa'>('bls');
  const [selectedGsaContract, setSelectedGsaContract] = useState<string | null>(null);

  // Fetch billing status on mount
  useEffect(() => {
    if (user) {
      fetchBillingStatus();
    }
  }, [user, fetchBillingStatus]);

  // Show payment required modal if no payment method configured
  useEffect(() => {
    if (billingStatus && billingStatus.stripe_configured && !billingStatus.has_payment_method) {
      setShowPaymentRequiredModal(true);
    }
  }, [billingStatus, setShowPaymentRequiredModal]);

  // Fetch GSA contracts if admin
  useEffect(() => {
    if (user && isAdmin(user)) {
      fetchContracts();
    }
  }, [user, fetchContracts]);

  // Filter to only active GSA contracts
  const activeContracts = contracts.filter((c) => c.status === 'active');

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
    // Check billing status first - block if no payment method
    if (billingStatus?.stripe_configured && !billingStatus?.has_payment_method) {
      setShowPaymentRequiredModal(true);
      return;
    }

    if (files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    if (!proposalName.trim()) {
      setError('Please enter a proposal name');
      return;
    }

    // Validate GSA selection if GSA source is chosen
    if (wageSourceType === 'gsa' && !selectedGsaContract) {
      setError('Please select a GSA contract for rate lookup');
      return;
    }

    try {
      setError(null);
      const proposalId = await uploadDocuments(
        files,
        proposalName.trim(),
        solicitationNumber.trim() || undefined,
        wageSourceType,
        wageSourceType === 'gsa' ? selectedGsaContract || undefined : undefined
      );

      // Start polling for status (don't redirect immediately)
      setUploadedProposalId(proposalId);
    } catch (err: any) {
      // Only show errors from backend, ignore network/timeout errors
      // Network errors don't have a response from the server
      if (err.response) {
        // This is a backend error (4xx, 5xx) - show it to the user
        setError(err.response?.data?.detail || err.message || 'Upload failed. Please try again.');
      }
      // Silently ignore network errors (timeout, connection issues)
      // The backend will continue processing and we'll poll for status
    }
  };

  // Redirect when processing is complete
  useEffect(() => {
    if (status?.status === 'completed' && uploadedProposalId) {
      router.push(`/proposals/${uploadedProposalId}`);
    }
  }, [status, uploadedProposalId, router]);

  // Show polling error only if it's from backend (not network errors)
  // Network errors during polling are silently ignored - we keep polling
  useEffect(() => {
    if (pollingError && pollingError.includes('backend')) {
      // Only show explicit backend errors
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

            {/* Wage Source Selection - Admin only */}
            {user && isAdmin(user) && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-muted-foreground mb-3">
                  Rate Source
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* BLS Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setWageSourceType('bls');
                      setSelectedGsaContract(null);
                    }}
                    className={`relative flex items-start p-4 rounded-lg border-2 transition-all text-left ${
                      wageSourceType === 'bls'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                  >
                    <div className="flex items-center h-5">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          wageSourceType === 'bls'
                            ? 'border-primary'
                            : 'border-muted-foreground/50'
                        }`}
                      >
                        {wageSourceType === 'bls' && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">BLS Data</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          Default
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Use Bureau of Labor Statistics wage data with indirect rates
                      </p>
                    </div>
                  </button>

                  {/* GSA Option */}
                  <button
                    type="button"
                    onClick={() => setWageSourceType('gsa')}
                    disabled={activeContracts.length === 0}
                    className={`relative flex items-start p-4 rounded-lg border-2 transition-all text-left ${
                      wageSourceType === 'gsa'
                        ? 'border-primary bg-primary/5'
                        : activeContracts.length === 0
                        ? 'border-border opacity-50 cursor-not-allowed'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                  >
                    <div className="flex items-center h-5">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          wageSourceType === 'gsa'
                            ? 'border-primary'
                            : 'border-muted-foreground/50'
                        }`}
                      >
                        {wageSourceType === 'gsa' && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">GSA Rates</span>
                        {activeContracts.length === 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                            No contracts
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Use pre-approved GSA labor rates (no indirect rates applied)
                      </p>
                    </div>
                  </button>
                </div>

                {/* GSA Contract Dropdown */}
                {wageSourceType === 'gsa' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      Select GSA Contract <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedGsaContract || ''}
                      onChange={(e) => setSelectedGsaContract(e.target.value || null)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">Select a contract...</option>
                      {activeContracts.map((contract) => (
                        <option key={contract.file_id} value={contract.file_id}>
                          {contract.name}
                          {contract.contract_number && ` (${contract.contract_number})`}
                          {' - '}
                          {contract.labor_categories_count} labor categories
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

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
            <li>
              Each position will be matched to{' '}
              {wageSourceType === 'gsa' ? 'GSA labor categories' : 'BLS wage data'} automatically
            </li>
            {wageSourceType === 'gsa' && (
              <li>GSA rates are final - no indirect rates (fringe, OH, G&A, fee) are applied</li>
            )}
            <li>You'll be able to review and adjust the pricing in the next step</li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}
