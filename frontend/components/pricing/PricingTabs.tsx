'use client';

interface PricingTabsProps {
  activeTab: 'overview' | 'main' | 'subcontractors' | 'rate-table';
  onTabChange: (tab: 'overview' | 'main' | 'subcontractors' | 'rate-table') => void;
  hasSubcontractors: boolean;
}

export const PricingTabs = ({
  activeTab,
  onTabChange,
  hasSubcontractors,
}: PricingTabsProps) => {
  const tabs = [
    {
      id: 'overview' as const,
      label: 'Overview',
      description: 'Cost analytics & summary',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
    },
    {
      id: 'main' as const,
      label: 'Pricing Workspace',
      description: 'Detailed cost proposal spreadsheet',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      ),
    },
    {
      id: 'subcontractors' as const,
      label: 'Subcontractor Labor',
      description: 'Subcontractor positions & costs',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      ),
      hidden: !hasSubcontractors,
    },
    {
      id: 'rate-table' as const,
      label: 'Rate Table',
      description: 'Subcontractor fee/MH markup calculations',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      ),
      hidden: !hasSubcontractors,
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
