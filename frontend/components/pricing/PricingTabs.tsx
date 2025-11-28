'use client';

interface PricingTabsProps {
  activeTab: 'main' | 'rate-table';
  onTabChange: (tab: 'main' | 'rate-table') => void;
  hasSubcontractors: boolean;
}

export const PricingTabs = ({
  activeTab,
  onTabChange,
  hasSubcontractors,
}: PricingTabsProps) => {
  const tabs = [
    {
      id: 'main' as const,
      label: 'Cost Proposal',
      description: 'Main spreadsheet view',
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
