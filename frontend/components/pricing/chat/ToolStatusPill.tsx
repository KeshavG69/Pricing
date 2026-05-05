'use client';

import { memo } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Code,
  BarChart3,
  Upload,
  BookOpen,
  Search,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import ShimmerText from './ShimmerText';

export type ToolStatus = 'running' | 'completed' | 'error';

export interface ToolPillSpec {
  id: string;
  name: string;
  status: ToolStatus;
  /**
   * Resolved human-readable title (parent computes this from tool_args
   * and result — see resolveToolCallTitle in PricingChatPanel).
   */
  title: string;
  /** stdout from python_repl_tool, shown as a small code block on completion. */
  output?: string;
}

const TOOL_ICONS: Record<string, LucideIcon> = {
  python_repl_tool: Code,
  chart_tool: BarChart3,
  s3_upload_tool: Upload,
  get_skill_instructions: BookOpen,
  // Exa web search — agno registers the toolkit under "exa" with sub-methods
  // like search_exa / get_contents_exa. Map all variants to the search icon.
  exa: Search,
  search_exa: Search,
  exa_search: Search,
  web_search: Search,
  exa_answer: Search,
  get_contents_exa: Search,
};

interface ToolStatusPillProps {
  tool: ToolPillSpec;
  /** True when this is the most-recent running tool. Drives shimmer animation. */
  isActiveStreamingTool?: boolean;
  /** True when this is NOT the last item — draws timeline line below. */
  showTimelineConnector?: boolean;
}

/**
 * Tool-call row matching Kroolo's StreamingToolCalls timeline variant:
 * - Status icon in a small circular badge on the left
 * - Vertical 1px timeline line connecting consecutive rows
 * - Shimmering title for the actively running tool
 * - Static muted title for completed tools
 */
const ToolStatusPill = memo(
  ({ tool, isActiveStreamingTool = false, showTimelineConnector = false }: ToolStatusPillProps) => {
    const ToolIcon = TOOL_ICONS[tool.name] || Wrench;

    let StatusIcon: LucideIcon;
    let statusClass: string;
    if (tool.status === 'running') {
      StatusIcon = Loader2;
      statusClass = 'text-muted-foreground animate-spin';
    } else if (tool.status === 'error') {
      StatusIcon = XCircle;
      statusClass = 'text-red-500';
    } else {
      StatusIcon = CheckCircle2;
      statusClass = 'text-emerald-500';
    }

    return (
      <div className="relative flex items-start gap-3 py-1.5">
        {/* Vertical timeline line connecting to the next row below */}
        {showTimelineConnector && (
          <div
            aria-hidden="true"
            className="absolute left-[10.5px] top-[28px] h-[calc(100%-12px)] w-px bg-border"
          />
        )}

        {/* Status icon — small circular badge on the timeline */}
        <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background">
          <StatusIcon className={`h-3.5 w-3.5 ${statusClass}`} />
        </div>

        {/* Title with optional shimmer + output */}
        <div className="min-w-0 flex-1 pt-[1px]">
          <div className="flex items-center gap-2">
            <ToolIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            {isActiveStreamingTool ? (
              <ShimmerText
                text={tool.title}
                className="min-w-0 truncate text-[13px] text-foreground"
              />
            ) : (
              <span className="min-w-0 truncate text-[13px] text-muted-foreground">
                {tool.title}
              </span>
            )}
          </div>
          {tool.status === 'completed' && tool.output && (
            <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-muted px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
              {tool.output}
            </pre>
          )}
        </div>
      </div>
    );
  },
);

ToolStatusPill.displayName = 'ToolStatusPill';

export default ToolStatusPill;
