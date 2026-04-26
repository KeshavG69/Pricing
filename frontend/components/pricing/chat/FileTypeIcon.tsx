'use client';

import { memo } from 'react';

/**
 * Colored file-tile icons matching Kroolo's enterprise-search-frontend
 * design. Each icon is a 40x40 rounded square in the format's brand color
 * with the format abbreviation in white.
 *
 * Inspired by the SVGs in Kroolo's custom-icons.tsx (PDF=red, DOC=blue,
 * XLS=green, PPT=orange) but reimplemented as compact, theme-agnostic
 * components with no drop-shadow filters.
 */

type Props = { size?: number; className?: string };

const TileBase = ({
  size = 40,
  className,
  fill,
  label,
}: Props & { fill: string; label: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect width="40" height="40" rx="6" fill={fill} />
    {/* Folded corner accent */}
    <path d="M27 8 L32 13 L27 13 Z" fill="rgba(255,255,255,0.18)" />
    <text
      x="20"
      y="29"
      textAnchor="middle"
      fontFamily="Helvetica, Arial, sans-serif"
      fontSize="11"
      fontWeight="700"
      fill="#ffffff"
      letterSpacing="0.5"
    >
      {label}
    </text>
  </svg>
);

export const PdfTileIcon = memo((p: Props) => (
  <TileBase {...p} fill="#E62B1E" label="PDF" />
));
PdfTileIcon.displayName = 'PdfTileIcon';

export const DocxTileIcon = memo((p: Props) => (
  <TileBase {...p} fill="#2B579A" label="DOC" />
));
DocxTileIcon.displayName = 'DocxTileIcon';

export const XlsxTileIcon = memo((p: Props) => (
  <TileBase {...p} fill="#107C41" label="XLS" />
));
XlsxTileIcon.displayName = 'XlsxTileIcon';

export const PptxTileIcon = memo((p: Props) => (
  <TileBase {...p} fill="#D24726" label="PPT" />
));
PptxTileIcon.displayName = 'PptxTileIcon';

export const CsvTileIcon = memo((p: Props) => (
  <TileBase {...p} fill="#107C41" label="CSV" />
));
CsvTileIcon.displayName = 'CsvTileIcon';

export const ImageTileIcon = memo((p: Props) => (
  <TileBase {...p} fill="#7C3AED" label="IMG" />
));
ImageTileIcon.displayName = 'ImageTileIcon';

export const TxtTileIcon = memo((p: Props) => (
  <TileBase {...p} fill="#475569" label="TXT" />
));
TxtTileIcon.displayName = 'TxtTileIcon';

export const GenericTileIcon = memo((p: Props) => (
  <TileBase {...p} fill="#64748B" label="FILE" />
));
GenericTileIcon.displayName = 'GenericTileIcon';

/**
 * Pick and render the correct tile icon for a given filename in one shot.
 * Built as a component (not a factory) so React Compiler / hooks rules
 * don't complain about creating components during render.
 */
export const FileTileIcon = memo(
  ({ filename, size, className }: Props & { filename: string }) => {
    const ext =
      filename.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return <PdfTileIcon size={size} className={className} />;
    if (['doc', 'docx'].includes(ext))
      return <DocxTileIcon size={size} className={className} />;
    if (['xls', 'xlsx', 'xlsm', 'xlsb'].includes(ext))
      return <XlsxTileIcon size={size} className={className} />;
    if (ext === 'csv') return <CsvTileIcon size={size} className={className} />;
    if (['ppt', 'pptx'].includes(ext))
      return <PptxTileIcon size={size} className={className} />;
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(ext))
      return <ImageTileIcon size={size} className={className} />;
    if (['txt', 'md', 'log', 'rst'].includes(ext))
      return <TxtTileIcon size={size} className={className} />;
    return <GenericTileIcon size={size} className={className} />;
  },
);
FileTileIcon.displayName = 'FileTileIcon';
