'use client';

import { memo, useMemo } from 'react';
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

  // Try Python-style dict
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

  // JS object literal (chart configs use unquoted keys)
  try {
    const fn = new Function('return ' + text);
    const value = fn();
    const found = parseChartConfig(value);
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
    <div className="my-2 w-full rounded-lg border border-border bg-background p-3">
      <div className="h-72 w-full">
        {/* @ts-expect-error chart.js types are loose for this dynamic ChartTag */}
        <ChartTag data={chartData} options={chartOptions} />
      </div>
    </div>
  );
});

ChartArtifact.displayName = 'ChartArtifact';

export default ChartArtifact;
