'use client';

import { useState } from 'react';
import { FileText, Download, ExternalLink, RefreshCw, File, FileSpreadsheet } from 'lucide-react';
import Button from '@/components/ui/Button';
import { DocumentInfo } from '@/types';
import { proposalsApi } from '@/lib/api/proposals';
import { useToast } from '@/lib/hooks/useToast';

interface FilesTabProps {
  documents: DocumentInfo[];
  proposalId: string;
  onRefreshUrls?: () => void;
}

export function FilesTab({ documents, proposalId, onRefreshUrls }: FilesTabProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const toast = useToast();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
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

  const handleRefreshUrls = async () => {
    setIsRefreshing(true);
    try {
      await proposalsApi.refreshDocumentUrls(proposalId);
      toast.success('Document links refreshed');
      onRefreshUrls?.();
    } catch (error) {
      toast.error('Failed to refresh document links');
    } finally {
      setIsRefreshing(false);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Source Documents</h3>
          <p className="text-sm text-muted-foreground">
            {documents.length} file{documents.length !== 1 ? 's' : ''} uploaded for this proposal
          </p>
        </div>
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
                  <span>Uploaded {formatDate(doc.uploadDate)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
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

      {/* Info Note */}
      <div className="bg-muted/50 border border-border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> Download links expire after 7 days. Click "Refresh Links" if downloads aren't working.
        </p>
      </div>
    </div>
  );
}

export default FilesTab;
