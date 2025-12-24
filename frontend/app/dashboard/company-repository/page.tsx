'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useCompanyRepositoryStore } from '@/lib/stores/companyRepositoryStore';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Dialog from '@/components/ui/Dialog';
import { Building2, Upload, Trash2, Calendar, FileText, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { isAdmin } from '@/lib/utils/permissions';
import { GSAContract } from '@/types';

export default function CompanyRepositoryPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    contracts,
    isLoading,
    isUploading,
    error,
    fetchContracts,
    uploadContract,
    updateStartDate,
    deleteContract,
    pollStatus,
    clearError,
  } = useCompanyRepositoryStore();
  const toast = useToast();

  // Upload dialog state
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Date dialog state
  const [showDateDialog, setShowDateDialog] = useState(false);
  const [selectedContract, setSelectedContract] = useState<GSAContract | null>(null);
  const [startDate, setStartDate] = useState('');

  // Polling for processing contracts
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Redirect non-admins
    if (user && !isAdmin(user)) {
      router.push('/dashboard');
      return;
    }

    // Fetch contracts
    if (user) {
      fetchContracts();
    }
  }, [user, router, fetchContracts]);

  // Poll for processing contracts
  useEffect(() => {
    const processingContracts = contracts.filter((c) => c.status === 'processing');
    if (processingContracts.length === 0) return;

    const interval = setInterval(async () => {
      for (const contract of processingContracts) {
        if (!pollingIds.has(contract.file_id)) {
          setPollingIds((prev) => new Set(prev).add(contract.file_id));
          try {
            const updated = await pollStatus(contract.file_id);
            if (updated.status !== 'processing') {
              setPollingIds((prev) => {
                const next = new Set(prev);
                next.delete(contract.file_id);
                return next;
              });
              if (updated.status === 'active') {
                toast.success(`Contract "${contract.name}" is ready!`);
              } else if (updated.status === 'needs_date') {
                toast.info(`Contract "${contract.name}" needs a start date.`);
              }
            }
          } catch (e) {
            setPollingIds((prev) => {
              const next = new Set(prev);
              next.delete(contract.file_id);
              return next;
            });
          }
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [contracts, pollStatus, pollingIds, toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!uploadName) {
        // Auto-fill name from filename
        setUploadName(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadName.trim()) return;

    try {
      await uploadContract(selectedFile, uploadName.trim());
      toast.success('Contract uploaded! Processing started...');
      setShowUploadDialog(false);
      setUploadName('');
      setSelectedFile(null);
    } catch (e) {
      toast.error('Failed to upload contract');
    }
  };

  const handleSetDate = async () => {
    if (!selectedContract || !startDate) return;

    try {
      await updateStartDate(selectedContract.file_id, startDate);
      toast.success('Contract start date updated!');
      setShowDateDialog(false);
      setSelectedContract(null);
      setStartDate('');
    } catch (e) {
      toast.error('Failed to update start date');
    }
  };

  const handleDelete = async (contract: GSAContract) => {
    if (!confirm(`Delete "${contract.name}"? This action cannot be undone.`)) return;

    try {
      await deleteContract(contract.file_id);
      toast.success('Contract deleted');
    } catch (e) {
      toast.error('Failed to delete contract');
    }
  };

  const getStatusBadge = (status: GSAContract['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
            <CheckCircle className="w-3 h-3" />
            Active
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Processing
          </span>
        );
      case 'needs_date':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
            <Calendar className="w-3 h-3" />
            Needs Date
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            <AlertCircle className="w-3 h-3" />
            Error
          </span>
        );
      default:
        return null;
    }
  };

  // Show loading state
  if (!user || !isAdmin(user)) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Company Repository</h1>
            <p className="text-muted-foreground">
              Upload and manage GSA contracts for rate lookups
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowUploadDialog(true)}
            className="shadow-md shadow-primary/10"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Contract
          </Button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-sm text-red-800">{error}</p>
            <button
              onClick={clearError}
              className="ml-auto text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Contracts List */}
        <Card>
          <CardHeader>
            <CardTitle>GSA Contracts</CardTitle>
            <CardDescription>
              Uploaded GSA rate schedules that can be used for proposal pricing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && contracts.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : contracts.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No contracts uploaded</h3>
                <p className="text-muted-foreground mb-4">
                  Upload a GSA rate schedule to get started
                </p>
                <Button variant="outline" onClick={() => setShowUploadDialog(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Contract
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {contracts.map((contract) => (
                  <div
                    key={contract.file_id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground">{contract.name}</h4>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                            {contract.contract_number && (
                              <span>Contract: {contract.contract_number}</span>
                            )}
                            {contract.company_name && (
                              <span>Company: {contract.company_name}</span>
                            )}
                            <span>{contract.labor_categories_count} labor categories</span>
                          </div>
                          {contract.contract_start_date && (
                            <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              Start: {new Date(contract.contract_start_date).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(contract.status)}
                        {contract.status === 'needs_date' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedContract(contract);
                              setStartDate(contract.contract_start_date || '');
                              setShowDateDialog(true);
                            }}
                          >
                            <Calendar className="w-3 h-3 mr-1" />
                            Set Date
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(contract)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground mb-1">
                  How it works
                </h4>
                <p className="text-sm text-muted-foreground">
                  Upload a GSA rate schedule (PDF, Excel, or RTF). We'll extract all labor categories
                  and rates. When creating a proposal, you can choose to use GSA rates instead of BLS data.
                  GSA rates are final - no indirect rates (fringe, OH, G&A, fee) are applied.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Dialog */}
      <Dialog
        isOpen={showUploadDialog}
        onClose={() => {
          setShowUploadDialog(false);
          setUploadName('');
          setSelectedFile(null);
        }}
        title="Upload GSA Contract"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadDialog(false);
                setUploadName('');
                setSelectedFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpload}
              isLoading={isUploading}
              disabled={!selectedFile || !uploadName.trim()}
            >
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a GSA rate schedule document. Supported formats: PDF, Excel (.xlsx, .xls), RTF
          </p>

          <Input
            label="Contract Name"
            placeholder='e.g., "GSA MAS Contract 2024"'
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
          />

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Document File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.rtf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">{selectedFile.name}</span>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to select a file or drag and drop
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </Dialog>

      {/* Set Date Dialog */}
      <Dialog
        isOpen={showDateDialog}
        onClose={() => {
          setShowDateDialog(false);
          setSelectedContract(null);
          setStartDate('');
        }}
        title="Set Contract Start Date"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowDateDialog(false);
                setSelectedContract(null);
                setStartDate('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSetDate}
              disabled={!startDate}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The contract start date is needed to calculate which year's rates apply to your proposals.
          </p>

          <Input
            label="Contract Start Date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
      </Dialog>
    </DashboardLayout>
  );
}
