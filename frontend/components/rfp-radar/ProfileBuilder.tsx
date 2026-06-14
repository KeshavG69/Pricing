'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useCapabilityBuilderStore } from '@/lib/stores/capabilityBuilderStore';

/**
 * First-time profile build experience.
 *
 * One required input: the company name. UEI is collected as an optional
 * disambiguator (shown in a collapsible "advanced" section) — most users
 * don't memorize it, and the backend resolves the dominant UEI from the
 * award data when one isn't provided.
 *
 * Styled with the app's standard Card + CardHeader/Description + Button
 * + Input components so it lives naturally inside Organization →
 * RFP Radar alongside the Settings/Team/Billing tabs.
 */
export default function ProfileBuilder() {
  const buildProfile = useCapabilityBuilderStore((s) => s.buildProfile);
  const profileBuilding = useCapabilityBuilderStore((s) => s.profileBuilding);
  const profileError = useCapabilityBuilderStore((s) => s.profileError);

  const [companyName, setCompanyName] = useState('');
  const [uei, setUei] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canSubmit = companyName.trim().length >= 2 && !profileBuilding;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await buildProfile({
        company_search: companyName.trim(),
        uei_filter: uei.trim() || null,
      });
    } catch {
      // Error stays in store.profileError — rendered below.
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <CardTitle>Build your capability profile</CardTitle>
        <CardDescription>
          Tell us your company name. We&apos;ll pull your federal contract
          history from USASpending.gov and auto-build your scope, agencies,
          set-asides, and NAICS codes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="company-name"
            label="Company name"
            type="text"
            autoFocus
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Your company name"
            disabled={profileBuilding}
            helperText="Use the name as it appears on your federal contracts. Partial matches work — we'll show you what we found."
          />

          {/* Advanced — UEI disambiguator */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              {showAdvanced ? '−' : '+'} Advanced (UEI disambiguator)
            </button>
            {showAdvanced && (
              <div className="mt-3">
                <Input
                  id="uei"
                  label="UEI (optional)"
                  type="text"
                  value={uei}
                  onChange={(e) => setUei(e.target.value.toUpperCase())}
                  placeholder="12-character UEI"
                  maxLength={12}
                  disabled={profileBuilding}
                  className="tabular-nums"
                  helperText="12-character SAM.gov identifier. Use this if your company name is ambiguous on USASpending."
                />
              </div>
            )}
          </div>

          {profileError && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>{profileError}</p>
            </div>
          )}

          <div>
            <Button
              type="submit"
              variant="primary"
              disabled={!canSubmit}
            >
              {profileBuilding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Building from your past wins…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Build my profile
                </>
              )}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Takes about 5 seconds. Free — uses public USASpending.gov data.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
