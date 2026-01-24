'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useCompanyRepositoryStore } from '@/lib/stores/companyRepositoryStore';
import { useOrganizationStore } from '@/lib/stores/organizationStore';
import { cacheManager } from '@/lib/cache';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Dialog from '@/components/ui/Dialog';
import { Building2, Upload, Trash2, Calendar, FileText, CheckCircle, AlertCircle, Clock, RefreshCw, ChevronDown, ChevronRight, ExternalLink, Plus, Info, X, Loader2, File, FileSpreadsheet, Download } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { isAdmin } from '@/lib/utils/permissions';
import { GSAContract, GSALaborCategory, OrganizationSettings } from '@/types';
import apiClient from '@/lib/api/client';
import * as XLSX from 'xlsx';

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

        const response = await fetch(url);

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

        const response = await fetch(url);

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
                      {String(row[colIndex] ?? '')}
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

export default function CompanyRepositoryPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    contracts,
    isLoading,
    isUploading,
    error,
    fetchContracts,
    fetchContract,
    uploadContract,
    updateStartDate,
    deleteContract,
    pollStatus,
    clearError,
  } = useCompanyRepositoryStore();
  const { organization, fetchOrganization } = useOrganizationStore();
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

  // Expanded contract state (stores full contract data with labor_categories)
  const [expandedContract, setExpandedContract] = useState<GSAContract | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Create preset dialog state
  const [showCreatePresetDialog, setShowCreatePresetDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);

  // Manual preset creation dialog state
  const [showManualPresetDialog, setShowManualPresetDialog] = useState(false);
  const [manualPresetName, setManualPresetName] = useState('');
  const [manualPresetRates, setManualPresetRates] = useState({
    fringe: 0,
    oh_onsite: 0,
    oh_offsite: 0,
    ga: 0,
    fee: 0,
    smh: 0,
    sub_fee: 0,
    ga_passthrough: 0,
    escalation_rate: 0,
    ot_multiplier: 0,
    surge_multiplier: 0,
  });

  // Edit preset dialog state
  const [showEditPresetDialog, setShowEditPresetDialog] = useState(false);
  const [editingPreset, setEditingPreset] = useState<{ id: string; name: string } | null>(null);

  // Text modal state (for viewing full description/experience)
  const [textModal, setTextModal] = useState<{ title: string; content: string } | null>(null);

  // Delete confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<GSAContract | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Document preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewContractName, setPreviewContractName] = useState<string>('');
  const [previewFilename, setPreviewFilename] = useState<string>('');

  const [editPresetName, setEditPresetName] = useState('');
  const [editPresetRates, setEditPresetRates] = useState({
    fringe: 0,
    oh_onsite: 0,
    oh_offsite: 0,
    ga: 0,
    fee: 0,
    smh: 0,
    sub_fee: 0,
    ga_passthrough: 0,
    escalation_rate: 0,
    ot_multiplier: 0,
    surge_multiplier: 0,
  });

  // Organization settings state (for user overrides)
  const [allowUserRateOverride, setAllowUserRateOverride] = useState(true);
  const [hasSettingsChanges, setHasSettingsChanges] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    // Fetch contracts and organization
    if (user) {
      fetchContracts();
      fetchOrganization();
    }
  }, [user, fetchContracts, fetchOrganization]);

  // Poll for processing contracts
  useEffect(() => {
    const processingContracts = contracts.filter((c) => c.status === 'processing');
    if (processingContracts.length === 0) return;

    const interval = setInterval(async () => {
      for (const contract of processingContracts) {
        // Skip if already polling this contract (prevent duplicate requests)
        if (pollingIds.has(contract.file_id)) continue;

        setPollingIds((prev) => new Set(prev).add(contract.file_id));
        try {
          const updated = await pollStatus(contract.file_id);
          // Always remove from polling set after request completes
          setPollingIds((prev) => {
            const next = new Set(prev);
            next.delete(contract.file_id);
            return next;
          });

          if (updated.status !== 'processing') {
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
    }, 5000);

    return () => clearInterval(interval);
  }, [contracts, pollStatus, pollingIds, toast]);

  // Load organization settings
  useEffect(() => {
    if (organization?.settings) {
      setAllowUserRateOverride(organization.settings.allow_user_rate_override ?? true);
    }
  }, [organization]);

  // Handler functions for organization settings
  const handleToggleUserRateOverride = () => {
    setAllowUserRateOverride(!allowUserRateOverride);
    setHasSettingsChanges(true);
  };

  const handleSaveSettings = async () => {
    if (!hasSettingsChanges) return;

    setIsSavingSettings(true);
    try {
      await apiClient.patch('/organizations/me/settings', {
        allow_user_rate_override: allowUserRateOverride,
      });
      toast.success('Settings updated successfully');
      setHasSettingsChanges(false);
      await fetchOrganization(); // Refresh organization data
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

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

  const handleDeleteClick = (contract: GSAContract) => {
    setContractToDelete(contract);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!contractToDelete) return;

    setIsDeleting(true);
    try {
      await deleteContract(contractToDelete.file_id);
      toast.success('Contract deleted');
      setShowDeleteDialog(false);
      setContractToDelete(null);
    } catch (e) {
      toast.error('Failed to delete contract');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleExpand = async (contract: GSAContract) => {
    // If already expanded, collapse
    if (expandedContract?.file_id === contract.file_id) {
      setExpandedContract(null);
      return;
    }

    // Fetch full contract details including labor_categories (with caching)
    try {
      setIsLoadingDetails(true);
      await fetchContract(contract.file_id);
      // Get the contract from selectedContract in store
      const fullContract = useCompanyRepositoryStore.getState().selectedContract;
      if (fullContract) {
        setExpandedContract(fullContract);
      }
    } catch (e) {
      toast.error('Failed to load contract details');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleCreatePreset = async () => {
    if (!presetName.trim() || !expandedContract) return;

    setIsCreatingPreset(true);
    try {
      // For now, we'll create a preset with placeholder rates
      // In a real implementation, you'd extract these from the contract
      const presetData = {
        name: presetName.trim(),
        fringe: 0.247,
        oh: 0.0711,
        ga: 0.2243,
        fee: 0.07,
        smh: 0.065,
        sub_fee: 0.05,
        ga_passthrough: 0.025,
      };

      await apiClient.post('/organizations/me/rate-presets', presetData);
      toast.success(`Preset "${presetName}" created successfully!`);
      setShowCreatePresetDialog(false);
      setPresetName('');

      // Invalidate cache and force refresh to get updated presets
      if (user?.organization_id) {
        cacheManager.invalidate(`org:${user.organization_id}`);
      }
      await fetchOrganization(true);
    } catch {
      toast.error('Failed to create preset');
    } finally {
      setIsCreatingPreset(false);
    }
  };

  const handleCreateManualPreset = async () => {
    if (!manualPresetName.trim()) return;

    setIsCreatingPreset(true);
    try {
      const presetData = {
        name: manualPresetName.trim(),
        fringe: manualPresetRates.fringe / 100,
        oh_onsite: manualPresetRates.oh_onsite / 100,
        oh_offsite: manualPresetRates.oh_offsite / 100,
        ga: manualPresetRates.ga / 100,
        fee: manualPresetRates.fee / 100,
        smh: manualPresetRates.smh / 100,
        sub_fee: manualPresetRates.sub_fee / 100,
        ga_passthrough: manualPresetRates.ga_passthrough / 100,
        escalation_rate: manualPresetRates.escalation_rate / 100,
        ot_multiplier: manualPresetRates.ot_multiplier / 100,  // NEW: OT multiplier
        surge_multiplier: manualPresetRates.surge_multiplier / 100,  // NEW: Surge multiplier
      };

      await apiClient.post('/organizations/me/rate-presets', presetData);
      toast.success(`Preset "${manualPresetName}" created successfully!`);
      setShowManualPresetDialog(false);
      setManualPresetName('');
      setManualPresetRates({
        fringe: 0,
        oh_onsite: 0,
        oh_offsite: 0,
        ga: 0,
        fee: 0,
        smh: 0,
        sub_fee: 0,
        ga_passthrough: 0,
        escalation_rate: 0,
        ot_multiplier: 0,
        surge_multiplier: 0,
      });

      // Invalidate cache and force refresh to get updated presets
      if (user?.organization_id) {
        cacheManager.invalidate(`org:${user.organization_id}`);
      }
      await fetchOrganization(true);
    } catch {
      toast.error('Failed to create preset');
    } finally {
      setIsCreatingPreset(false);
    }
  };

  const handleDeletePreset = async (presetId: string, presetName: string) => {
    if (!confirm(`Delete preset "${presetName}"? This action cannot be undone.`)) return;

    try {
      await apiClient.delete(`/organizations/me/rate-presets/${presetId}`);
      toast.success(`Preset "${presetName}" deleted successfully`);

      // Invalidate cache and force refresh to get updated presets
      if (user?.organization_id) {
        cacheManager.invalidate(`org:${user.organization_id}`);
      }
      await fetchOrganization(true);
    } catch {
      toast.error('Failed to delete preset');
    }
  };

  const handleSetAsDefault = async (presetId: string, presetName: string) => {
    try {
      await apiClient.post(`/organizations/me/rate-presets/${presetId}/apply-as-default`);
      toast.success(`"${presetName}" set as default rates`);

      // Invalidate cache and force refresh
      if (user?.organization_id) {
        cacheManager.invalidate(`org:${user.organization_id}`);
      }
      await fetchOrganization(true);
    } catch {
      toast.error('Failed to set default rates');
    }
  };

  const handleEditPreset = (preset: any) => {
    setEditingPreset({ id: preset.id, name: preset.name });
    setEditPresetName(preset.name);

    // Handle migration from old 'oh' field to new 'oh_onsite' and 'oh_offsite'
    const ohOnsite = preset.oh_onsite !== undefined ? preset.oh_onsite : preset.oh || 0;
    const ohOffsite = preset.oh_offsite !== undefined ? preset.oh_offsite : preset.oh || 0;

    setEditPresetRates({
      fringe: toPercentageNumber(preset.fringe),
      oh_onsite: toPercentageNumber(ohOnsite),
      oh_offsite: toPercentageNumber(ohOffsite),
      ga: toPercentageNumber(preset.ga),
      fee: toPercentageNumber(preset.fee),
      smh: toPercentageNumber(preset.smh),
      sub_fee: toPercentageNumber(preset.sub_fee),
      ga_passthrough: toPercentageNumber(preset.ga_passthrough),
      escalation_rate: toPercentageNumber(preset.escalation_rate || 0),
      ot_multiplier: toPercentageNumber(preset.ot_multiplier || 1.5),  // NEW: Load OT multiplier
      surge_multiplier: toPercentageNumber(preset.surge_multiplier || 1.15),  // NEW: Load Surge multiplier
    });
    setShowEditPresetDialog(true);
  };

  const handleUpdatePreset = async () => {
    if (!editingPreset || !editPresetName.trim()) return;

    setIsCreatingPreset(true);
    try {
      const presetData = {
        name: editPresetName.trim(),
        fringe: editPresetRates.fringe / 100,
        oh_onsite: editPresetRates.oh_onsite / 100,
        oh_offsite: editPresetRates.oh_offsite / 100,
        ga: editPresetRates.ga / 100,
        fee: editPresetRates.fee / 100,
        smh: editPresetRates.smh / 100,
        sub_fee: editPresetRates.sub_fee / 100,
        ga_passthrough: editPresetRates.ga_passthrough / 100,
        escalation_rate: editPresetRates.escalation_rate / 100,
        ot_multiplier: editPresetRates.ot_multiplier / 100,
        surge_multiplier: editPresetRates.surge_multiplier / 100,
      };

      await apiClient.put(`/organizations/me/rate-presets/${editingPreset.id}`, presetData);
      toast.success(`Preset "${editPresetName}" updated successfully!`);
      setShowEditPresetDialog(false);
      setEditingPreset(null);
      setEditPresetName('');
      setEditPresetRates({
        fringe: 0,
        oh_onsite: 0,
        oh_offsite: 0,
        ga: 0,
        fee: 0,
        smh: 0,
        sub_fee: 0,
        ga_passthrough: 0,
        escalation_rate: 0,
        ot_multiplier: 0,
        surge_multiplier: 0,
      });

      // Invalidate cache and force refresh to get updated presets
      if (user?.organization_id) {
        cacheManager.invalidate(`org:${user.organization_id}`);
      }
      await fetchOrganization(true);
    } catch {
      toast.error('Failed to update preset');
    } finally {
      setIsCreatingPreset(false);
    }
  };

  const toPercentageDisplay = (value: number): string => {
    return (value * 100).toFixed(2);
  };

  const toPercentageNumber = (value: number): number => {
    return parseFloat((value * 100).toFixed(2));
  };

  const handleViewContract = async (contract: GSAContract) => {
    try {
      const response = await apiClient.get(`/company-repository/${contract.file_id}/document-url`);
      if (response.data.url) {
        // Use the actual filename from backend (with extension) for correct content-type detection
        const filename = response.data.filename || 'document.pdf';
        // Use proxy URL for better CORS handling and caching
        const proxyUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/proposals/document-proxy?url=${encodeURIComponent(response.data.url)}&filename=${encodeURIComponent(filename)}`;
        setPreviewUrl(proxyUrl);
        setPreviewContractName(contract.name);
        setPreviewFilename(filename);
        setShowPreviewModal(true);
      }
    } catch (error) {
      toast.error('Failed to get document link');
      console.error('Error fetching document URL:', error);
    }
  };

  const handleOpenInNewTab = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  // Get year columns from labor categories with actual calendar years
  const getYearColumns = (laborCategories: GSALaborCategory[] | undefined, contract: GSAContract) => {
    if (!laborCategories || laborCategories.length === 0) return [];

    // Get all years that have data
    const years = new Set<string>();
    laborCategories.forEach((lc) => {
      Object.keys(lc.rates_by_year || {}).forEach((year) => {
        // Only include years that have actual rate values
        if (lc.rates_by_year?.[year]) {
          years.add(year);
        }
      });
    });

    // Sort years numerically
    const sortedYears = Array.from(years).sort((a, b) => parseInt(a) - parseInt(b));

    // Calculate actual calendar years based on contract start date
    const currentYear = new Date().getFullYear();
    const contractStartYear = contract.contract_start_date
      ? new Date(contract.contract_start_date).getFullYear()
      : currentYear;

    return sortedYears.map((yearNum) => ({
      yearNum,
      displayYear: contractStartYear + parseInt(yearNum) - 1
    }));
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

  // Show loading state while checking auth
  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  const userIsAdmin = isAdmin(user);

  return (
    <DashboardLayout>
      <div className="space-y-2 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">Company Rates</h1>
            <p className="text-muted-foreground pl-1">
              Upload and manage GSA contracts for rate lookups
            </p>
          </div>
          {userIsAdmin && (
            <Button
              variant="primary"
              onClick={() => setShowUploadDialog(true)}
              className="shadow-md shadow-primary/10"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload a New Contract
            </Button>
          )}
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
                  {userIsAdmin ? 'Upload a GSA rate schedule to get started' : 'No GSA contracts available yet'}
                </p>
                {userIsAdmin && (
                  <Button variant="outline" onClick={() => setShowUploadDialog(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload a New Contract
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {contracts.map((contract) => (
                  <div
                    key={contract.file_id}
                    className="border border-border rounded-lg overflow-hidden"
                  >
                    <div className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {/* Expand/Collapse Button */}
                          {contract.status === 'active' && contract.labor_categories_count > 0 && (
                            <button
                              onClick={() => handleToggleExpand(contract)}
                              className="p-2 hover:bg-muted rounded-lg transition-colors mt-0.5"
                              disabled={isLoadingDetails}
                            >
                              {isLoadingDetails && expandedContract?.file_id === contract.file_id ? (
                                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                              ) : expandedContract?.file_id === contract.file_id ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                            </button>
                          )}
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <FileText className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h4
                              className={`font-medium text-foreground ${
                                contract.status === 'active' && contract.labor_categories_count > 0
                                  ? 'cursor-pointer hover:text-primary hover:underline transition-colors'
                                  : ''
                              }`}
                              onClick={() => {
                                if (contract.status === 'active' && contract.labor_categories_count > 0) {
                                  handleToggleExpand(contract);
                                }
                              }}
                              title={
                                contract.status === 'active' && contract.labor_categories_count > 0
                                  ? 'Click to expand labor categories'
                                  : ''
                              }
                            >
                              {contract.name}
                            </h4>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                              {contract.contract_number && (
                                <span>Contract: {contract.contract_number}</span>
                              )}
                              {contract.company_name && (
                                <span>Company: {contract.company_name}</span>
                              )}
                              {contract.status !== 'processing' && (
                                <span className="text-base font-bold text-foreground">
                                  {contract.labor_categories_count} Labour categories
                                </span>
                              )}
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
                          {userIsAdmin && contract.status === 'needs_date' && (
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
                            onClick={() => handleViewContract(contract)}
                            className="text-primary hover:text-primary/80"
                            title="Preview document"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                          {userIsAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(contract)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Labor Categories Table */}
                    {expandedContract?.file_id === contract.file_id && expandedContract.labor_categories && (
                      <div className="border-t border-border bg-muted/20">
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="text-sm font-medium text-foreground">
                              Labor Categories ({expandedContract.labor_categories.length})
                            </h5>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border">
                                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Title</th>
                                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">SIN</th>
                                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Description</th>
                                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Experience</th>
                                  {getYearColumns(expandedContract.labor_categories, contract).map(({ yearNum, displayYear }) => (
                                    <th key={yearNum} className="text-right py-2 px-3 font-medium text-muted-foreground">
                                      {displayYear}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {expandedContract.labor_categories.map((lc, index) => (
                                  <tr
                                    key={lc.lcat_id || index}
                                    className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                                  >
                                    <td className="py-2 px-3 text-foreground">{lc.title}</td>
                                    <td className="py-2 px-3 text-muted-foreground">{lc.sin || '-'}</td>
                                    <td className="py-2 px-3 text-muted-foreground">
                                      <div
                                        className="max-w-[300px] max-h-[80px] overflow-auto text-sm cursor-pointer hover:bg-muted/50 p-1 rounded"
                                        onDoubleClick={() => lc.description && setTextModal({ title: `${lc.title} - Description`, content: lc.description })}
                                      >
                                        {lc.description || '-'}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-muted-foreground">
                                      <div
                                        className="max-w-[250px] max-h-[80px] overflow-auto text-sm cursor-pointer hover:bg-muted/50 p-1 rounded"
                                        onDoubleClick={() => lc.experience && setTextModal({ title: `${lc.title} - Experience`, content: lc.experience })}
                                      >
                                        {lc.experience || '-'}
                                      </div>
                                    </td>
                                    {getYearColumns(expandedContract.labor_categories, contract).map(({ yearNum }) => (
                                      <td key={yearNum} className="py-2 px-3 text-right text-foreground font-mono">
                                        {lc.rates_by_year?.[yearNum]
                                          ? `$${lc.rates_by_year[yearNum].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                          : '-'}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rate Presets */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Rate Presets</CardTitle>
                <CardDescription>
                  Reusable rate templates that can be quickly applied in pricing workspaces
                </CardDescription>
              </div>
              {userIsAdmin && (
                <button
                  onClick={() => setShowManualPresetDialog(true)}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
                  title="Create new preset"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {organization?.settings?.rate_presets && organization.settings.rate_presets.length > 0 ? (
              <div className="space-y-3">
                {organization.settings.rate_presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-foreground">{preset.name}</h4>
                        {organization?.settings?.default_rates &&
                          preset.fringe === organization.settings.default_rates.fringe &&
                          (preset.oh_onsite !== undefined ? preset.oh_onsite : preset.oh) === organization.settings.default_rates.oh_onsite &&
                          (preset.oh_offsite !== undefined ? preset.oh_offsite : preset.oh) === organization.settings.default_rates.oh_offsite &&
                          preset.ga === organization.settings.default_rates.ga &&
                          preset.fee === organization.settings.default_rates.fee && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                            Default
                          </span>
                        )}
                      </div>
                      {userIsAdmin && (
                        <div className="flex gap-3">
                          {!(organization?.settings?.default_rates &&
                            preset.fringe === organization.settings.default_rates.fringe &&
                            (preset.oh_onsite !== undefined ? preset.oh_onsite : preset.oh) === organization.settings.default_rates.oh_onsite &&
                            (preset.oh_offsite !== undefined ? preset.oh_offsite : preset.oh) === organization.settings.default_rates.oh_offsite &&
                            preset.ga === organization.settings.default_rates.ga &&
                            preset.fee === organization.settings.default_rates.fee) && (
                            <button
                              onClick={() => handleSetAsDefault(preset.id, preset.name)}
                              className="text-green-600 hover:text-green-700 text-sm font-medium"
                            >
                              Set as Default
                            </button>
                          )}
                          <button
                            onClick={() => handleEditPreset(preset)}
                            className="text-primary hover:text-primary/80 text-sm font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeletePreset(preset.id, preset.name)}
                            className="text-red-600 hover:text-red-700 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Fringe: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.fringe)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">OH On-Site: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.oh_onsite !== undefined ? preset.oh_onsite : preset.oh || 0)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">OH Off-Site: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.oh_offsite !== undefined ? preset.oh_offsite : preset.oh || 0)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">G&A: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.ga)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Fee: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.fee)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">S&MH: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.smh)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sub Fee: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.sub_fee)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">G&A Pass: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.ga_passthrough)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Escalation: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.escalation_rate || 0)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">OT Mult: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.ot_multiplier || 1.5)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Surge Mult: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.surge_multiplier || 1.15)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No rate presets created yet.</p>
                {userIsAdmin && (
                  <p className="text-sm mt-1">Click the + button above to create your first preset.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Additional Settings */}
        {userIsAdmin && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Additional Settings</CardTitle>
                  <CardDescription>
                    Other organization preferences
                  </CardDescription>
                </div>
                {hasSettingsChanges && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveSettings}
                    isLoading={isSavingSettings}
                    className="shadow-md shadow-primary/10"
                  >
                    Save Changes
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Allow User Rate Overrides
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Allow non-admin users to override default rates in their proposals
                  </p>
                </div>
                <button
                  onClick={handleToggleUserRateOverride}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    allowUserRateOverride ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      allowUserRateOverride ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </CardContent>
          </Card>
        )}

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

      {/* Create Preset Dialog */}
      <Dialog
        isOpen={showCreatePresetDialog}
        onClose={() => {
          setShowCreatePresetDialog(false);
          setPresetName('');
        }}
        title="Create Rate Preset from Contract"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreatePresetDialog(false);
                setPresetName('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreatePreset}
              disabled={!presetName.trim() || isCreatingPreset}
              isLoading={isCreatingPreset}
            >
              Create Preset
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a reusable rate preset that can be quickly applied in pricing workspaces.
            The rates will be extracted from this contract's labor categories.
          </p>

          <Input
            label="Preset Name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="e.g., FSS 2024 Rates"
          />

          {expandedContract && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="text-muted-foreground mb-1">Source Contract:</p>
              <p className="font-medium text-foreground">{expandedContract.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {expandedContract.labor_categories?.length || 0} labor categories
              </p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Manual Create Preset Dialog */}
      <Dialog
        isOpen={showManualPresetDialog}
        onClose={() => {
          setShowManualPresetDialog(false);
          setManualPresetName('');
          setManualPresetRates({
            fringe: 0,
            oh_onsite: 0,
            oh_offsite: 0,
            ga: 0,
            fee: 0,
            smh: 0,
            sub_fee: 0,
            ga_passthrough: 0,
            escalation_rate: 0,
            ot_multiplier: 0,
            surge_multiplier: 0,
          });
        }}
        title="Create New Rate Preset"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowManualPresetDialog(false);
                setManualPresetName('');
                setManualPresetRates({
                  fringe: 0,
                  oh_onsite: 0,
                  oh_offsite: 0,
                  ga: 0,
                  fee: 0,
                  smh: 0,
                  sub_fee: 0,
                  ga_passthrough: 0,
                  escalation_rate: 0,
                  ot_multiplier: 0,
                  surge_multiplier: 0,
                });
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateManualPreset}
              disabled={!manualPresetName.trim() || isCreatingPreset}
              isLoading={isCreatingPreset}
            >
              Create Preset
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Preset Name"
            placeholder='e.g., "Federal Contract", "Commercial"'
            value={manualPresetName}
            onChange={(e) => setManualPresetName(e.target.value)}
          />
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium text-foreground mb-3">Rate Values (%)</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Fringe Rate"
                type="number"
                value={manualPresetRates.fringe || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, fringe: parseFloat(e.target.value) || 0 })}
                placeholder="24.70"
              />
              <Input
                label="OH (On-Site) Rate"
                type="number"
                value={manualPresetRates.oh_onsite || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, oh_onsite: parseFloat(e.target.value) || 0 })}
                placeholder="7.11"
              />
              <Input
                label="OH (Off-Site) Rate"
                type="number"
                value={manualPresetRates.oh_offsite || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, oh_offsite: parseFloat(e.target.value) || 0 })}
                placeholder="7.11"
              />
              <Input
                label="G&A Rate"
                type="number"
                value={manualPresetRates.ga || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, ga: parseFloat(e.target.value) || 0 })}
                placeholder="22.43"
              />
              <Input
                label="Fee Rate (Prime Labor)"
                type="number"
                value={manualPresetRates.fee || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, fee: parseFloat(e.target.value) || 0 })}
                placeholder="7.00"
              />
              <Input
                label="S&MH Rate (Subcontractor)"
                type="number"
                value={manualPresetRates.smh || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, smh: parseFloat(e.target.value) || 0 })}
                placeholder="6.50"
              />
              <Input
                label="Fee Rate (Sub Labor)"
                type="number"
                value={manualPresetRates.sub_fee || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, sub_fee: parseFloat(e.target.value) || 0 })}
                placeholder="5.00"
              />
              <Input
                label="G&A Passthrough Rate"
                type="number"
                value={manualPresetRates.ga_passthrough || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, ga_passthrough: parseFloat(e.target.value) || 0 })}
                placeholder="2.50"
              />
              <Input
                label="Escalation Rate"
                type="number"
                value={manualPresetRates.escalation_rate || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, escalation_rate: parseFloat(e.target.value) || 0 })}
                placeholder="3.00"
              />
              <Input
                label="OT Multiplier"
                type="number"
                value={manualPresetRates.ot_multiplier || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, ot_multiplier: parseFloat(e.target.value) || 0 })}
                placeholder="150.00"
                helperText="Overtime multiplier (e.g., 150 for 1.5x time-and-a-half)"
              />
              <Input
                label="Surge Multiplier"
                type="number"
                value={manualPresetRates.surge_multiplier || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, surge_multiplier: parseFloat(e.target.value) || 0 })}
                placeholder="115.00"
                helperText="Surge pricing premium (e.g., 115 for 1.15x or 15% premium)"
              />
            </div>
          </div>
        </div>
      </Dialog>

      {/* Edit Preset Dialog */}
      <Dialog
        isOpen={showEditPresetDialog}
        onClose={() => {
          setShowEditPresetDialog(false);
          setEditingPreset(null);
          setEditPresetName('');
          setEditPresetRates({
            fringe: 0,
            oh_onsite: 0,
            oh_offsite: 0,
            ga: 0,
            fee: 0,
            smh: 0,
            sub_fee: 0,
            ga_passthrough: 0,
            escalation_rate: 0,
            ot_multiplier: 0,
            surge_multiplier: 0,
          });
        }}
        title="Edit Rate Preset"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditPresetDialog(false);
                setEditingPreset(null);
                setEditPresetName('');
                setEditPresetRates({
                  fringe: 0,
                  oh_onsite: 0,
                  oh_offsite: 0,
                  ga: 0,
                  fee: 0,
                  smh: 0,
                  sub_fee: 0,
                  ga_passthrough: 0,
                  escalation_rate: 0,
                  ot_multiplier: 0,
                  surge_multiplier: 0,
                });
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpdatePreset}
              disabled={!editPresetName.trim() || isCreatingPreset}
              isLoading={isCreatingPreset}
            >
              Update Preset
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Preset Name"
            placeholder='e.g., "Federal Contract", "Commercial"'
            value={editPresetName}
            onChange={(e) => setEditPresetName(e.target.value)}
          />
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium text-foreground mb-3">Rate Values (%)</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Fringe Rate"
                type="number"
                value={editPresetRates.fringe || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, fringe: parseFloat(e.target.value) || 0 })}
                placeholder="24.70"
              />
              <Input
                label="OH (On-Site) Rate"
                type="number"
                value={editPresetRates.oh_onsite || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, oh_onsite: parseFloat(e.target.value) || 0 })}
                placeholder="7.11"
              />
              <Input
                label="OH (Off-Site) Rate"
                type="number"
                value={editPresetRates.oh_offsite || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, oh_offsite: parseFloat(e.target.value) || 0 })}
                placeholder="7.11"
              />
              <Input
                label="G&A Rate"
                type="number"
                value={editPresetRates.ga || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, ga: parseFloat(e.target.value) || 0 })}
                placeholder="22.43"
              />
              <Input
                label="Fee Rate (Prime Labor)"
                type="number"
                value={editPresetRates.fee || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, fee: parseFloat(e.target.value) || 0 })}
                placeholder="7.00"
              />
              <Input
                label="S&MH Rate (Subcontractor)"
                type="number"
                value={editPresetRates.smh || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, smh: parseFloat(e.target.value) || 0 })}
                placeholder="6.50"
              />
              <Input
                label="Fee Rate (Sub Labor)"
                type="number"
                value={editPresetRates.sub_fee || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, sub_fee: parseFloat(e.target.value) || 0 })}
                placeholder="5.00"
              />
              <Input
                label="G&A Passthrough Rate"
                type="number"
                value={editPresetRates.ga_passthrough || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, ga_passthrough: parseFloat(e.target.value) || 0 })}
                placeholder="2.50"
              />
              <Input
                label="Escalation Rate"
                type="number"
                value={editPresetRates.escalation_rate || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, escalation_rate: parseFloat(e.target.value) || 0 })}
                placeholder="3.00"
              />
              <Input
                label="OT Multiplier"
                type="number"
                value={editPresetRates.ot_multiplier || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, ot_multiplier: parseFloat(e.target.value) || 0 })}
                placeholder="150.00"
                helperText="Overtime multiplier (e.g., 150 for 1.5x time-and-a-half)"
              />
              <Input
                label="Surge Multiplier"
                type="number"
                value={editPresetRates.surge_multiplier || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, surge_multiplier: parseFloat(e.target.value) || 0 })}
                placeholder="115.00"
                helperText="Surge pricing premium (e.g., 115 for 1.15x or 15% premium)"
              />
            </div>
          </div>
        </div>
      </Dialog>

      {/* Text View Modal (for full description/experience) */}
      <Dialog
        isOpen={!!textModal}
        onClose={() => setTextModal(null)}
        title={textModal?.title || ''}
      >
        <div className="whitespace-pre-wrap text-sm text-foreground">
          {textModal?.content}
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setContractToDelete(null);
        }}
        title="Delete Contract"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setContractToDelete(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmDelete}
              isLoading={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this contract? This action cannot be undone.
          </p>
          {contractToDelete && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium text-foreground">{contractToDelete.name}</p>
              {contractToDelete.contract_number && (
                <p className="text-sm text-muted-foreground mt-1">
                  Contract: {contractToDelete.contract_number}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {contractToDelete.labor_categories_count} labor categories
              </p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Document Preview Modal */}
      {showPreviewModal && previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            setShowPreviewModal(false);
            setPreviewUrl(null);
            setPreviewContractName('');
          }}
        >
          <div
            className="bg-background rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-semibold text-foreground">{previewContractName}</h3>
                  <p className="text-sm text-muted-foreground">GSA Contract Document</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenInNewTab}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in New Tab
                </Button>
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    setPreviewUrl(null);
                    setPreviewContractName('');
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 p-4 overflow-hidden">
              {isSpreadsheetFile(previewFilename) ? (
                <SpreadsheetPreview
                  url={previewUrl}
                  filename={previewFilename}
                />
              ) : isPdfFile(previewFilename) ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border border-border rounded"
                  title={previewContractName}
                />
              ) : isTextFile(previewFilename) ? (
                <TextPreview
                  url={previewUrl}
                  filename={previewFilename}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <File className="w-16 h-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-foreground mb-2">Preview not available</p>
                  <p className="text-muted-foreground mb-4">
                    This file type cannot be previewed. Please download to view.
                  </p>
                  <Button onClick={handleOpenInNewTab}>
                    <Download className="w-4 h-4 mr-2" />
                    Download File
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
