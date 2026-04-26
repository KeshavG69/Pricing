'use client';

import { memo, useMemo } from 'react';
import { Download } from 'lucide-react';
import { FileTileIcon } from './FileTypeIcon';

export type ArtifactPayload = {
  filename: string;
  url: string;
  size_bytes?: number;
};

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
};

const getExt = (filename: string): string => {
  const clean = filename.split('?')[0].split('#')[0].trim();
  return clean.split('.').pop()?.toLowerCase() ?? '';
};

const getKindLabel = (filename: string): { left: string; right: string } => {
  const ext = getExt(filename);
  if (ext === 'pdf') return { left: 'Document', right: 'PDF' };
  if (['doc', 'docx'].includes(ext)) return { left: 'Document', right: 'Word' };
  if (['ppt', 'pptx'].includes(ext))
    return { left: 'Presentation', right: 'PowerPoint' };
  if (ext === 'csv') return { left: 'Table', right: 'CSV' };
  if (['xls', 'xlsx', 'xlsm', 'xlsb'].includes(ext))
    return { left: 'Table', right: 'Excel' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(ext))
    return { left: 'Image', right: ext.toUpperCase() };
  if (['txt', 'md', 'log'].includes(ext)) return { left: 'Text', right: 'TXT' };
  return { left: 'File', right: ext ? ext.toUpperCase() : 'File' };
};

/**
 * Parse the s3_upload_tool result into a download payload.
 *
 * The agent's s3_upload_tool returns:
 *   { success, url, filename, object_key, error }
 *
 * Agno surfaces this through its tool runtime as one of several shapes —
 * native dict, JSON string, Python-repr string ({'success': True, ...}),
 * or a wrapper envelope ({output: "...", data: {...}}). We try them all.
 */
export function parseArtifactPayload(raw: unknown): ArtifactPayload | null {
  if (raw == null) return null;

  // Object form — drill in
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // Direct hit on the s3 payload fields
    if (
      obj.success === true &&
      typeof obj.url === 'string' &&
      typeof obj.filename === 'string'
    ) {
      return {
        url: obj.url,
        filename: obj.filename,
        size_bytes: typeof obj.size_bytes === 'number' ? obj.size_bytes : undefined,
      };
    }
    // Common wrappers — try each known field that might contain the payload
    for (const key of ['data', 'output', 'result', 'content', 'value']) {
      if (key in obj) {
        const found = parseArtifactPayload(obj[key]);
        if (found) return found;
      }
    }
    return null;
  }

  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  // Try strict JSON first
  try {
    return parseArtifactPayload(JSON.parse(text));
  } catch {
    /* fall through */
  }

  // Try Python-style dict (single quotes, True/False/None) — agno often
  // hands tool results back as `str(dict)` which is Python repr.
  try {
    const sanitized = text
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
      .replace(/'/g, '"');
    return parseArtifactPayload(JSON.parse(sanitized));
  } catch {
    /* fall through */
  }

  // Last resort — regex out the URL + filename from a freeform string
  const urlMatch = text.match(/https?:\/\/\S+?(?=["'\s,}]|$)/);
  const filenameMatch =
    text.match(/['"]filename['"]\s*:\s*['"]([^'"]+)['"]/) ||
    text.match(/filename["']?\s*:\s*["']?([^"',}\s]+)/i);
  if (urlMatch && filenameMatch) {
    return { url: urlMatch[0], filename: filenameMatch[1] };
  }

  return null;
}

interface ArtifactDownloadCardProps {
  payload: ArtifactPayload;
}

const ArtifactDownloadCard = memo(({ payload }: ArtifactDownloadCardProps) => {
  const kind = useMemo(() => getKindLabel(payload.filename), [payload.filename]);
  const baseName = useMemo(
    () => payload.filename.replace(/\.[^.]+$/, '') || payload.filename,
    [payload.filename],
  );
  const sizeStr = useMemo(
    () => (typeof payload.size_bytes === 'number' ? formatFileSize(payload.size_bytes) : ''),
    [payload.size_bytes],
  );

  return (
    <div className="my-2 flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:border-foreground/20">
      <div className="shrink-0">
        <FileTileIcon filename={payload.filename} size={40} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{baseName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {kind.left}
          <span className="opacity-50"> · </span>
          {kind.right}
          {sizeStr && <span className="opacity-70"> · {sizeStr}</span>}
        </div>
      </div>
      <a
        href={payload.url}
        download={payload.filename}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        aria-label={`Download ${payload.filename}`}
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </a>
    </div>
  );
});

ArtifactDownloadCard.displayName = 'ArtifactDownloadCard';

export default ArtifactDownloadCard;
