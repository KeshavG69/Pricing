'use client';

import { FileText, BarChart3, Calculator, Building2 } from 'lucide-react';

export type PricingTabType = 'files' | 'overview' | 'main' | 'subcontractors';

interface PricingTabsProps {
  activeTab: PricingTabType;
  onTabChange: (tab: PricingTabType) => void;
  hasSubcontractors: boolean;
  hasFiles?: boolean;
  mode?: 'initial' | 'advanced'; // initial = only Overview + Pricing Workspace, advanced = all tabs
}

export const PricingTabs = ({
  activeTab,
  onTabChange,
  hasSubcontractors,
  hasFiles = true,
  mode = 'advanced', // default to advanced for backwards compatibility
}: PricingTabsProps) => {
  const tabs = [
    {
      id: 'files' as const,
      label: 'Source Files',
      description: 'Uploaded documents',
      icon: <FileText className="w-5 h-5" />,
      hidden: !hasFiles,
    },
    {
      id: 'overview' as const,
      label: 'Overview',
      description: 'Cost analytics & summary',
      icon: <BarChart3 className="w-5 h-5" />,
    },
    {
      id: 'main' as const,
      label: 'Pricing Workspace',
      description: 'Detailed cost proposal spreadsheet',
      icon: <Calculator className="w-5 h-5" />,
    },
    {
      id: 'subcontractors' as const,
      label: 'Subcontractor Labor',
      description: 'Subcontractor positions & costs',
      icon: <Building2 className="w-5 h-5" />,
      hidden: mode === 'initial' || !hasSubcontractors, // Hide in initial mode or when no subcontractors
    },
  ];

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-2">
        {tabs.map((tab) => {
          if (tab.hidden) return null;

          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                relative flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all
                ${
                  isActive
                    ? 'text-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }
              `}
            >
              {/* Icon */}
              <span
                className={`transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {tab.icon}
              </span>

              {/* Label & Description */}
              <div className="flex flex-col items-start">
                <span className="font-semibold">{tab.label}</span>
                <span className="text-xs text-muted-foreground">{tab.description}</span>
              </div>

              {/* Active indicator underline */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PricingTabs;
