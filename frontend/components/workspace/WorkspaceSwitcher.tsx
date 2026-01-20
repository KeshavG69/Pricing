'use client';

import { useEffect, useState } from 'react';
import { Building, ChevronDown, Check } from 'lucide-react';
import { workspaceApi, UserOrganization } from '@/lib/api/workspace';
import { useAuthStore } from '@/lib/stores/authStore';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { useRouter } from 'next/navigation';
import { cacheManager } from '@/lib/cache';

interface WorkspaceSwitcherProps {
  isCollapsed?: boolean;
}

export default function WorkspaceSwitcher({ isCollapsed = false }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const { user, fetchUser } = useAuthStore();
  const { resetPagination } = useProposalsStore();
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      setIsLoading(true);
      const orgs = await workspaceApi.getUserOrganizations();
      setOrganizations(orgs);
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitch = async (orgId: string) => {
    if (isSwitching) return;

    try {
      setIsSwitching(true);

      // 1. Get current org before switch
      const currentOrgId = user?.organization_id;

      // 2. Switch organization (backend)
      await workspaceApi.switchOrganization(orgId);

      // 3. Invalidate old org caches
      if (currentOrgId) {
        console.log(`[WORKSPACE] Clearing cache for org: ${currentOrgId}`);
        cacheManager.invalidate(`proposals:list:${currentOrgId}`);
        cacheManager.invalidate(`proposal:${currentOrgId}:*`);
        cacheManager.invalidate(`org:${currentOrgId}:*`);
      }

      // 4. Invalidate all caches (old and new org)
      console.log(`[WORKSPACE] Clearing cache for org: ${currentOrgId} and ${orgId}`);
      cacheManager.invalidate(); // Clear ALL cache to ensure fresh data

      // 5. Close dropdown
      setIsOpen(false);

      console.log('[WORKSPACE] Successfully switched to organization:', orgId);
      console.log('[WORKSPACE] Reloading page to refresh all data...');

      // 6. Full page reload to ensure all state is fresh
      // This is necessary because:
      // - User state needs to be fully refreshed
      // - All organization-scoped data needs to reload
      // - Prevents race conditions and stale state
      window.location.reload();
    } catch (error) {
      console.error('[WORKSPACE] Failed to switch organization:', error);
      setIsSwitching(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isOpen && !target.closest('.workspace-switcher-container')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (isLoading) {
    return (
      <div className={`px-4 py-3 ${isCollapsed ? 'flex justify-center' : ''}`}>
        <div className="animate-pulse">
          <div className="h-10 bg-muted rounded-lg"></div>
        </div>
      </div>
    );
  }

  const currentOrg = organizations.find(org => org.is_current);

  // If only one organization, show it without dropdown
  if (organizations.length <= 1) {
    if (isCollapsed) {
      return (
        <div className="px-4 py-3 flex justify-center" title={currentOrg?.name || 'Organization'}>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center border border-border">
            <Building className="w-5 h-5 text-primary" />
          </div>
        </div>
      );
    }

    return (
      <div className="px-4 py-3">
        <div className="flex items-center space-x-3 px-3 py-2.5 rounded-lg bg-muted/30 border border-border">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {currentOrg?.name || 'Organization'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Multiple organizations - show dropdown
  if (isCollapsed) {
    return (
      <div className="relative workspace-switcher-container px-4 py-3">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center border border-border hover:bg-primary/20 transition-colors"
          title={currentOrg?.name || 'Switch workspace'}
        >
          <Building className="w-5 h-5 text-primary" />
        </button>

        {/* Dropdown - positioned to the right when collapsed */}
        {isOpen && (
          <div className="absolute left-full ml-2 top-0 w-64 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Switch Workspace
              </p>
            </div>
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => handleSwitch(org.id)}
                disabled={org.is_current || isSwitching}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <Building className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-foreground font-medium truncate w-full">
                      {org.name}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {org.role}
                    </span>
                  </div>
                </div>
                {org.is_current && (
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative workspace-switcher-container px-4 py-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {currentOrg?.name || 'Select workspace'}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {currentOrg?.role || 'No role'}
            </p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-4 right-4 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Switch Workspace
            </p>
          </div>
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => handleSwitch(org.id)}
              disabled={org.is_current || isSwitching}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <Building className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-foreground font-medium truncate w-full">
                    {org.name}
                  </span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {org.role}
                  </span>
                </div>
              </div>
              {org.is_current && (
                <Check className="w-4 h-4 text-primary flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
