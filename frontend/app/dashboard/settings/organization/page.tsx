'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useOrganizationStore } from '@/lib/stores/organizationStore';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Dialog from '@/components/ui/Dialog';
import { Building, Save, Info } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { isAdmin } from '@/lib/utils/permissions';
import { OrganizationSettings } from '@/types';
import apiClient from '@/lib/api/client';

export default function OrganizationSettingsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { organization, fetchOrganization, updateSettings, isLoading } = useOrganizationStore();
  const toast = useToast();

  // Form state
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Preset dialog state
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetRates, setPresetRates] = useState({
    fringe: 0,
    oh: 0,
    ga: 0,
    fee: 0,
    smh: 0,
    sub_fee: 0,
    ga_passthrough: 0,
  });

  useEffect(() => {
    // Redirect non-admins
    if (user && !isAdmin(user)) {
      router.push('/dashboard');
      return;
    }

    // Fetch organization
    if (user) {
      fetchOrganization();
    }
  }, [user, router, fetchOrganization]);

  useEffect(() => {
    if (organization?.settings) {
      setSettings(organization.settings);
    }
  }, [organization]);

  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    try {
      // Only send the fields that are part of the UpdateSettingsRequest
      const { default_rates, default_escalation_rate, allow_user_rate_override } = settings;
      await updateSettings({
        default_rates,
        default_escalation_rate,
        allow_user_rate_override,
      });
      toast.success('Settings updated successfully');
      setHasChanges(false);
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  const updateDefaultRate = (key: string, value: string) => {
    if (!settings) return;

    // Allow empty string for clearing
    if (value === '') {
      setSettings({
        ...settings,
        default_rates: {
          ...settings.default_rates,
          [key]: 0,
        },
      });
      setHasChanges(true);
      return;
    }

    // Parse and validate the number
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setSettings({
        ...settings,
        default_rates: {
          ...settings.default_rates,
          [key]: numValue / 100, // Convert percentage to decimal
        },
      });
      setHasChanges(true);
    }
  };

  const updateDefaultEscalationRate = (value: string) => {
    if (!settings) return;

    // Allow empty string for clearing
    if (value === '') {
      setSettings({
        ...settings,
        default_escalation_rate: 0,
      });
      setHasChanges(true);
      return;
    }

    // Parse and validate the number
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setSettings({
        ...settings,
        default_escalation_rate: numValue / 100, // Convert percentage to decimal
      });
      setHasChanges(true);
    }
  };


  const toggleUserRateOverride = () => {
    if (!settings) return;

    setSettings({
      ...settings,
      allow_user_rate_override: !settings.allow_user_rate_override,
    });
    setHasChanges(true);
  };

  const handleCreatePreset = async () => {
    if (!settings || !presetName.trim()) return;

    try {
      const response = await apiClient.post('/organizations/me/rate-presets', {
        name: presetName.trim(),
        fringe: presetRates.fringe / 100, // Convert to decimal
        oh: presetRates.oh / 100,
        ga: presetRates.ga / 100,
        fee: presetRates.fee / 100,
        smh: presetRates.smh / 100,
        sub_fee: presetRates.sub_fee / 100,
        ga_passthrough: presetRates.ga_passthrough / 100,
      });

      // Update local state
      setSettings({
        ...settings,
        rate_presets: [...(settings.rate_presets || []), response.data],
      });

      toast.success(`Preset "${presetName}" created successfully`);
      setShowPresetDialog(false);
      setPresetName('');
      setPresetRates({
        fringe: 0,
        oh: 0,
        ga: 0,
        fee: 0,
        smh: 0,
        sub_fee: 0,
        ga_passthrough: 0,
      });
      await fetchOrganization(); // Refresh org data
    } catch (error) {
      console.error('Create preset error:', error);
      toast.error('Failed to create preset');
    }
  };

  const handleDeletePreset = async (presetId: string, presetName: string) => {
    if (!settings) return;
    if (!confirm(`Delete preset "${presetName}"? This action cannot be undone.`)) return;

    try {
      await apiClient.delete(`/organizations/me/rate-presets/${presetId}`);

      // Update local state
      setSettings({
        ...settings,
        rate_presets: settings.rate_presets?.filter(p => p.id !== presetId) || [],
      });

      toast.success(`Preset "${presetName}" deleted successfully`);
      await fetchOrganization(); // Refresh org data
    } catch (error) {
      console.error('Delete preset error:', error);
      toast.error('Failed to delete preset');
    }
  };

  // Helper to format decimal to percentage display (fixes floating point precision)
  const toPercentageDisplay = (decimal: number): number => {
    return Math.round(decimal * 10000) / 100; // Round to 2 decimal places in percentage
  };

  // Show loading state
  if (!user || !isAdmin(user) || !settings || !organization) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Organization Settings</h1>
            <p className="text-muted-foreground">
              Configure default rates and settings for your organization
            </p>
          </div>
          <Button
            variant="primary"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={!hasChanges}
            className="shadow-md shadow-primary/10"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>

        {/* Organization Info */}
        <Card>
          <CardHeader>
            <CardTitle>Organization Information</CardTitle>
            <CardDescription>
              Basic details about your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Organization Name
                </label>
                <div className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg">
                  <Building className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{organization.name}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Subscription Plan
                </label>
                <div className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                    {organization.subscription.plan.toUpperCase()}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {organization.subscription.seats} seats
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Default Indirect Rates */}
        <Card>
          <CardHeader>
            <CardTitle>Default Indirect Rates</CardTitle>
            <CardDescription>
              Default rates applied to all new proposals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Fringe Rate"
                type="number"
                value={toPercentageDisplay(settings.default_rates.fringe)}
                onChange={(e) => updateDefaultRate('fringe', e.target.value)}
                placeholder="24.70"
                suffix="%"
              />
              <Input
                label="Overhead (OH) Rate"
                type="number"
                value={toPercentageDisplay(settings.default_rates.oh)}
                onChange={(e) => updateDefaultRate('oh', e.target.value)}
                placeholder="7.11"
                suffix="%"
              />
              <Input
                label="G&A Rate"
                type="number"
                value={toPercentageDisplay(settings.default_rates.ga)}
                onChange={(e) => updateDefaultRate('ga', e.target.value)}
                placeholder="22.43"
                suffix="%"
              />
              <Input
                label="Fee Rate (Prime Labor)"
                type="number"
                value={toPercentageDisplay(settings.default_rates.fee)}
                onChange={(e) => updateDefaultRate('fee', e.target.value)}
                placeholder="7.00"
                suffix="%"
              />
              <Input
                label="S&MH Rate (Subcontractor)"
                type="number"
                value={toPercentageDisplay(settings.default_rates.smh)}
                onChange={(e) => updateDefaultRate('smh', e.target.value)}
                placeholder="6.50"
                suffix="%"
              />
              <Input
                label="Fee Rate (Sub Labor)"
                type="number"
                value={toPercentageDisplay(settings.default_rates.sub_fee)}
                onChange={(e) => updateDefaultRate('sub_fee', e.target.value)}
                placeholder="5.00"
                suffix="%"
              />
              <Input
                label="G&A Passthrough Rate"
                type="number"
                value={toPercentageDisplay(settings.default_rates.ga_passthrough)}
                onChange={(e) => updateDefaultRate('ga_passthrough', e.target.value)}
                placeholder="2.50"
                suffix="%"
              />
            </div>
          </CardContent>
        </Card>

        {/* Rate Presets */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Rate Presets</CardTitle>
                <CardDescription>
                  Create reusable rate templates that can be quickly applied in pricing workspaces
                </CardDescription>
              </div>
              <button
                onClick={() => setShowPresetDialog(true)}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
                title="Add new preset"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {/* List of existing presets */}
            {settings.rate_presets && settings.rate_presets.length > 0 ? (
              <div className="space-y-3">
                {settings.rate_presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-foreground">{preset.name}</h4>
                      <button
                        onClick={() => handleDeletePreset(preset.id, preset.name)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Fringe: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.fringe)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">OH: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.oh)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">G&A: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.ga)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Fee: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.fee)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">S&MH: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.smh)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sub Fee: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.sub_fee)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">G&A Pass: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.ga_passthrough)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No rate presets created yet.</p>
                <p className="text-sm mt-1">Click the + button above to create your first preset.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Default Escalation Rate */}
        <Card>
          <CardHeader>
            <CardTitle>Default Escalation Rate</CardTitle>
            <CardDescription>
              Default year-over-year escalation rate for labor costs (can be customized per proposal)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-md">
              <Input
                label="Annual Escalation Rate"
                type="number"
                value={toPercentageDisplay(settings.default_escalation_rate || 0)}
                onChange={(e) => updateDefaultEscalationRate(e.target.value)}
                placeholder="3.00"
                suffix="%"
              />
              <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                This rate will be used as the default for all year-to-year escalations. You can customize rates for each year when creating proposals.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Additional Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Settings</CardTitle>
            <CardDescription>
              Other organization preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Allow User Rate Overrides
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Allow non-admin users to override default rates in their proposals
                  </p>
                </div>
                <button
                  onClick={toggleUserRateOverride}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    settings.allow_user_rate_override ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.allow_user_rate_override ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Banner */}
        {hasChanges && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900 mb-1">
                You have unsaved changes
              </p>
              <p className="text-xs text-blue-700">
                Click "Save Changes" to apply your updates to the organization settings.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Create Preset Dialog */}
      <Dialog
        isOpen={showPresetDialog}
        onClose={() => {
          setShowPresetDialog(false);
          setPresetName('');
          setPresetRates({
            fringe: 0,
            oh: 0,
            ga: 0,
            fee: 0,
            smh: 0,
            sub_fee: 0,
            ga_passthrough: 0,
          });
        }}
        title="Create New Rate Preset"
        size="lg"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowPresetDialog(false);
                setPresetName('');
                setPresetRates({
                  fringe: 0,
                  oh: 0,
                  ga: 0,
                  fee: 0,
                  smh: 0,
                  sub_fee: 0,
                  ga_passthrough: 0,
                });
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreatePreset}
              disabled={!presetName.trim()}
            >
              Create Preset
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a reusable rate template that can be quickly applied in pricing workspaces.
          </p>

          <Input
            label="Preset Name"
            placeholder='e.g., "Federal Contract", "Commercial", "Non-Profit"'
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            autoFocus
          />

          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium text-foreground mb-3">Rate Values</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Fringe Rate"
                type="number"
                value={presetRates.fringe || ''}
                onChange={(e) => setPresetRates({ ...presetRates, fringe: parseFloat(e.target.value) || 0 })}
                placeholder="24.70"
                suffix="%"
              />
              <Input
                label="Overhead (OH) Rate"
                type="number"
                value={presetRates.oh || ''}
                onChange={(e) => setPresetRates({ ...presetRates, oh: parseFloat(e.target.value) || 0 })}
                placeholder="7.11"
                suffix="%"
              />
              <Input
                label="G&A Rate"
                type="number"
                value={presetRates.ga || ''}
                onChange={(e) => setPresetRates({ ...presetRates, ga: parseFloat(e.target.value) || 0 })}
                placeholder="22.43"
                suffix="%"
              />
              <Input
                label="Fee Rate (Prime Labor)"
                type="number"
                value={presetRates.fee || ''}
                onChange={(e) => setPresetRates({ ...presetRates, fee: parseFloat(e.target.value) || 0 })}
                placeholder="7.00"
                suffix="%"
              />
              <Input
                label="S&MH Rate (Subcontractor)"
                type="number"
                value={presetRates.smh || ''}
                onChange={(e) => setPresetRates({ ...presetRates, smh: parseFloat(e.target.value) || 0 })}
                placeholder="6.50"
                suffix="%"
              />
              <Input
                label="Fee Rate (Sub Labor)"
                type="number"
                value={presetRates.sub_fee || ''}
                onChange={(e) => setPresetRates({ ...presetRates, sub_fee: parseFloat(e.target.value) || 0 })}
                placeholder="5.00"
                suffix="%"
              />
              <Input
                label="G&A Passthrough Rate"
                type="number"
                value={presetRates.ga_passthrough || ''}
                onChange={(e) => setPresetRates({ ...presetRates, ga_passthrough: parseFloat(e.target.value) || 0 })}
                placeholder="2.50"
                suffix="%"
              />
            </div>
          </div>
        </div>
      </Dialog>
    </DashboardLayout>
  );
}
