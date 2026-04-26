'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import { Download, FileText, FileImage, Sheet } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const CHART_COLORS = [
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#D97706',
  '#059669',
  '#0891B2',
  '#DC2626',
  '#65A30D',
  '#9333EA',
  '#EA580C',
];

const hexToRGBA = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const normalizeChartType = (type: unknown): string => {
  if (typeof type !== 'string') return 'bar';
  const t = type.toLowerCase();
  if (t.includes('bar')) return 'bar';
  if (t.includes('line')) return 'line';
  if (t.includes('pie')) return 'pie';
  if (t.includes('doughnut')) return 'doughnut';
  return 'bar';
};

/**
 * Parse the chart_tool result into a Chart.js config object.
 *
 * The agent's chart_tool returns:
 *   { success, code: "{ type: 'bar', data: {...}, options: {...} }", ... }
 *
 * Agno surfaces this through several shapes — native dict, JSON string,
 * Python-repr string ({'success': True, ...}), or wrapper envelope. We try
 * them all. The `code` field is a JS object literal (not strict JSON).
 */
type ChartCfg = {
  type: string;
  data: { labels?: unknown[]; datasets?: Array<Record<string, unknown>> };
  options?: Record<string, unknown>;
};

export function parseChartConfig(raw: unknown): ChartCfg | null {
  if (raw == null) return null;

  // Object form — direct hit, or drill into common wrappers
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // Already a chart config
    if (typeof obj.type === 'string' && obj.data && typeof obj.data === 'object') {
      return obj as ChartCfg;
    }
    // chart_tool wrapper { success, code, ... } — recurse into code
    if ('code' in obj) {
      const found = parseChartConfig(obj.code);
      if (found) return found;
    }
    // Other generic wrappers
    for (const key of ['data', 'output', 'result', 'content', 'value']) {
      if (key in obj) {
        const found = parseChartConfig(obj[key]);
        if (found) return found;
      }
    }
    return null;
  }

  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .trim();
  if (!text) return null;

  // Try strict JSON
  try {
    const parsed = JSON.parse(text);
    const found = parseChartConfig(parsed);
    if (found) return found;
  } catch {
    /* fall through */
  }

  // Try direct JS-literal eval with Python booleans replaced. This is the
  // primary path for agno-serialized tool results: Python repr like
  //   {'success': True, 'code': "{ type: 'bar', data: {...} }", ...}
  // is valid JS once True/False/None are swapped — JS object literals accept
  // single-quoted keys and string values. Crucially we do NOT touch single
  // quotes here, so embedded JS literals inside string values stay intact.
  try {
    const jsLiteral = text
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null');
    const fn = new Function('return ' + jsLiteral);
    const value = fn();
    const found = parseChartConfig(value);
    if (found) return found;
  } catch {
    /* fall through */
  }

  // Try Python-style dict via JSON parse (single→double quote substitution).
  // Only works when there are no embedded double-quoted substrings — kept
  // as a last-resort alternative to the JS-literal path above.
  try {
    const sanitized = text
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
      .replace(/'/g, '"');
    const parsed = JSON.parse(sanitized);
    const found = parseChartConfig(parsed);
    if (found) return found;
  } catch {
    /* fall through */
  }

  // `new Chart(ctx, {...})` wrapper — extract the config arg
  const newChartMatch = text.match(/new\s+Chart\s*\([^,]+,\s*(\{[\s\S]*\})\s*\)/);
  if (newChartMatch) {
    try {
      const fn = new Function('return ' + newChartMatch[1]);
      const value = fn();
      const found = parseChartConfig(value);
      if (found) return found;
    } catch {
      /* ignore */
    }
  }

  // Last resort: extract the `code` field value via regex and recurse.
  // Handles cases where the surrounding envelope can't be evaluated but the
  // code string itself is well-formed.
  const codeFieldMatch = text.match(/['"]code['"]\s*:\s*(['"])([\s\S]*?)\1/);
  if (codeFieldMatch) {
    const found = parseChartConfig(codeFieldMatch[2]);
    if (found) return found;
  }

  return null;
}

interface ChartArtifactProps {
  config: {
    type: string;
    data: { labels?: unknown[]; datasets?: Array<Record<string, unknown>> };
    options?: Record<string, unknown>;
  };
}

const ChartArtifact = memo(({ config }: ChartArtifactProps) => {
  const chartType = useMemo(() => normalizeChartType(config.type), [config.type]);

  const chartData = useMemo(() => {
    const sourceData = config.data;
    if (!sourceData) return null;
    const data = { ...sourceData };
    if (data.datasets) {
      data.datasets = data.datasets.map((ds, idx) => {
        const newDs: Record<string, unknown> = { ...ds };
        const isPieish = chartType === 'pie' || chartType === 'doughnut';
        if (isPieish) {
          newDs.backgroundColor = (data.labels || []).map(
            (_, i) => CHART_COLORS[i % CHART_COLORS.length],
          );
          newDs.borderColor = 'transparent';
          newDs.borderWidth = 0;
        } else if (chartType === 'line') {
          const c = CHART_COLORS[idx % CHART_COLORS.length];
          newDs.backgroundColor = hexToRGBA(c, 0.1);
          newDs.borderColor = c;
          newDs.borderWidth = 2;
          newDs.pointBackgroundColor = c;
          newDs.pointBorderColor = '#fff';
          newDs.pointRadius = 4;
          newDs.pointHoverRadius = 6;
          newDs.tension = 0.3;
          newDs.fill = true;
        } else {
          newDs.backgroundColor = (data.labels || []).map(
            (_, i) => CHART_COLORS[i % CHART_COLORS.length],
          );
          newDs.borderColor = 'transparent';
          newDs.borderWidth = 0;
        }
        return newDs;
      });
    }
    return data;
  }, [config.data, chartType]);

  const chartOptions = useMemo(() => {
    const base = {
      ...(config.options || {}),
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...(config.options?.plugins as Record<string, unknown> | undefined),
        legend: {
          display: true,
          position: 'bottom' as const,
          labels: { boxWidth: 12, padding: 12, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: (ctx: {
              dataset: { label?: string };
              parsed: { y?: number } | number;
              raw: unknown;
            }) => {
              const label = ctx.dataset?.label ? `${ctx.dataset.label}: ` : '';
              const v =
                typeof ctx.parsed === 'object' && ctx.parsed !== null
                  ? (ctx.parsed as { y?: number }).y
                  : ctx.parsed;
              if (typeof v === 'number') {
                return label + new Intl.NumberFormat('en-US').format(v);
              }
              return label + String(ctx.raw);
            },
          },
        },
      },
      scales:
        chartType === 'pie' || chartType === 'doughnut'
          ? undefined
          : {
              x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: {
                  font: { size: 11 },
                  callback: (v: number | string) =>
                    typeof v === 'number'
                      ? new Intl.NumberFormat('en-US').format(v)
                      : v,
                },
              },
            },
    } as Record<string, unknown>;
    return base;
  }, [config.options, chartType]);

  const chartRef = useRef<ChartJS | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapperRef = useRef<HTMLDivElement | null>(null);

  // Close the export menu on outside-click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuWrapperRef.current && !menuWrapperRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const titleText = useMemo(() => {
    const t = (config.options?.plugins as { title?: { text?: unknown } } | undefined)
      ?.title?.text;
    return typeof t === 'string' ? t : 'chart';
  }, [config.options]);

  const baseFilename = useMemo(
    () =>
      titleText
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || 'chart',
    [titleText],
  );

  const triggerDownload = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, []);

  const handleDownloadPng = useCallback(() => {
    const inst = chartRef.current;
    const canvas = inst?.canvas;
    if (!canvas) return;
    // Composite onto a white background so transparency doesn't render black
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const ctx = tmp.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(canvas, 0, 0);
    tmp.toBlob((blob) => {
      if (blob) triggerDownload(blob, `${baseFilename}.png`);
    }, 'image/png');
    setMenuOpen(false);
  }, [baseFilename, triggerDownload]);

  const handleDownloadCsv = useCallback(() => {
    setMenuOpen(false);
    const labelsRaw = chartData?.labels;
    const datasets = chartData?.datasets;
    if (!labelsRaw || !datasets) return;

    const labels = labelsRaw.map((l) => String(l));
    const datasetNames = datasets.map(
      (d, i) => (typeof d.label === 'string' && d.label) || `Series ${i + 1}`,
    );

    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = ['Label', ...datasetNames].map(escape).join(',');
    const rows = labels.map((label, rowIdx) => {
      const cells = [
        label,
        ...datasets.map((d) => {
          const arr = d.data;
          return Array.isArray(arr) ? arr[rowIdx] : '';
        }),
      ];
      return cells.map(escape).join(',');
    });
    const csv = [header, ...rows].join('\n');
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${baseFilename}.csv`);
  }, [chartData, baseFilename, triggerDownload]);

  const handleDownloadPdf = useCallback(async () => {
    const inst = chartRef.current;
    const canvas = inst?.canvas;
    if (!canvas) return;
    setMenuOpen(false);
    try {
      const mod = await import('jspdf');
      const JsPdf = mod.default || mod.jsPDF;
      // Composite to white background first (transparent → black in PDF)
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const ctx = tmp.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, tmp.width, tmp.height);
      ctx.drawImage(canvas, 0, 0);
      const dataUrl = tmp.toDataURL('image/png');

      const isLandscape = canvas.width > canvas.height;
      const pdf = new JsPdf({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(dataUrl, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${baseFilename}.pdf`);
    } catch (err) {
      console.error('Chart PDF export failed', err);
    }
  }, [baseFilename]);

  if (!chartData) {
    return null;
  }

  const ChartTag =
    chartType === 'line'
      ? Line
      : chartType === 'pie'
        ? Pie
        : chartType === 'doughnut'
          ? Doughnut
          : Bar;

  return (
    <div className="group relative my-2 w-full rounded-lg border border-border bg-background p-3">
      {/* Hover-revealed export toolbar (top-right) */}
      <div
        ref={menuWrapperRef}
        className={`absolute right-3 top-3 z-10 transition-opacity ${
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Download chart"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-1 w-32 overflow-hidden rounded-md border border-border bg-background shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleDownloadPng}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
            >
              <FileImage className="h-3.5 w-3.5" />
              PNG
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleDownloadCsv}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
            >
              <Sheet className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleDownloadPdf}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
            >
              <FileText className="h-3.5 w-3.5" />
              PDF
            </button>
          </div>
        )}
      </div>

      <div className="h-72 w-full">
        {/* @ts-expect-error chart.js types are loose for this dynamic ChartTag */}
        <ChartTag ref={chartRef} data={chartData} options={chartOptions} />
      </div>
    </div>
  );
});

ChartArtifact.displayName = 'ChartArtifact';

export default ChartArtifact;
