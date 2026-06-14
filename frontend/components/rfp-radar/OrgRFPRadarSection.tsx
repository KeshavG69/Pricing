'use client';

/**
 * Organization → RFP Radar tab content.
 *
 * Styled to match the other Organization tabs (Settings, Team, Billing,
 * Legal): outer Cards with CardHeader/CardDescription, neutral `bg-muted`
 * rows, the project's <Button> component, and the same stat-tile pattern
 * the Team tab uses. No bespoke indigo gradients or low-contrast chips.
 *
 * Two phases:
 *   1. No profile → renders <ProfileBuilder /> (initial build flow).
 *   2. Profile exists → identity card + editable lists + danger zone.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle,
  DollarSign,
  Loader2,
  MapPin,
  Plus,
  RefreshCcw,
  Tag,
  Trash2,
  X,
  AlertCircle,
} from 'lucide-react';

import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ProfileBuilder from '@/components/rfp-radar/ProfileBuilder';
import { useCapabilityBuilderStore } from '@/lib/stores/capabilityBuilderStore';

function formatMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ── Chip list — neutral, matches the app's standard chip style ────────

interface ChipListProps {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

function ChipList({ values, onChange, placeholder = 'Add…' }: ChipListProps) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setDraft('');
  };

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted border border-border px-3 py-1 text-sm font-medium text-foreground"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            aria-label={`Remove ${v}`}
            className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-background px-3 py-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="w-[140px] bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────

export default function OrgRFPRadarSection() {
  const profile = useCapabilityBuilderStore((s) => s.profile);
  const profileLoading = useCapabilityBuilderStore((s) => s.profileLoading);
  const profileError = useCapabilityBuilderStore((s) => s.profileError);

  const loadProfile = useCapabilityBuilderStore((s) => s.loadProfile);
  const updateProfile = useCapabilityBuilderStore((s) => s.updateProfile);
  const deleteProfile = useCapabilityBuilderStore((s) => s.deleteProfile);
  const buildProfile = useCapabilityBuilderStore((s) => s.buildProfile);
  const profileBuilding = useCapabilityBuilderStore((s) => s.profileBuilding);

  // Inline-add forms (NAICS + Agencies)
  const [addNaicsOpen, setAddNaicsOpen] = useState(false);
  const [newNaicsCode, setNewNaicsCode] = useState('');
  const [newNaicsDesc, setNewNaicsDesc] = useState('');
  const [newNaicsWins, setNewNaicsWins] = useState('');
  const [newNaicsTotal, setNewNaicsTotal] = useState('');

  const [addAgencyOpen, setAddAgencyOpen] = useState(false);
  const [newAgencyName, setNewAgencyName] = useState('');
  const [newAgencyWins, setNewAgencyWins] = useState('');
  const [newAgencyTotal, setNewAgencyTotal] = useState('');

  // Profile-actions confirmations
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const rebuiltLabel = useMemo(() => {
    if (!profile) return '';
    const built = new Date(profile.built_at);
    return `Built ${built.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}${profile.rebuilt_count ? ` · rebuilt ${profile.rebuilt_count}×` : ''}`;
  }, [profile]);

  // ── Loading ──
  if (profileLoading && profile === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Empty → build flow ──
  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl">
        <ProfileBuilder />
      </div>
    );
  }

  // ── View + edit ──

  const resetNaicsForm = () => {
    setAddNaicsOpen(false);
    setNewNaicsCode('');
    setNewNaicsDesc('');
    setNewNaicsWins('');
    setNewNaicsTotal('');
  };

  const resetAgencyForm = () => {
    setAddAgencyOpen(false);
    setNewAgencyName('');
    setNewAgencyWins('');
    setNewAgencyTotal('');
  };

  /** Add a new NAICS row. Wins/Total are optional — empty means 0. */
  const handleAddNaics = () => {
    const code = newNaicsCode.trim();
    if (!code) return;
    if (profile.naics_codes.some((n) => n.code === code)) {
      resetNaicsForm();
      return;
    }
    void updateProfile({
      naics_codes: [
        ...profile.naics_codes,
        {
          code,
          description: newNaicsDesc.trim() || 'Manually added',
          wins: Math.max(0, parseInt(newNaicsWins || '0', 10) || 0),
          total_amount: Math.max(0, parseFloat(newNaicsTotal || '0') || 0),
        },
      ],
    });
    resetNaicsForm();
  };

  /** Add a new sub-agency row. Wins/Total are optional — empty means 0. */
  const handleAddAgency = () => {
    const name = newAgencyName.trim();
    if (!name) return;
    if (profile.sub_agencies_of_interest.some((s) => s.name === name)) {
      resetAgencyForm();
      return;
    }
    void updateProfile({
      sub_agencies_of_interest: [
        ...profile.sub_agencies_of_interest,
        {
          name,
          wins: Math.max(0, parseInt(newAgencyWins || '0', 10) || 0),
          total_amount: Math.max(0, parseFloat(newAgencyTotal || '0') || 0),
        },
      ],
    });
    resetAgencyForm();
  };

  const handleRebuild = async () => {
    setConfirmRebuild(false);
    try {
      await buildProfile({
        company_search: profile.company_name,
        uei_filter: profile.uei,
      });
    } catch {
      /* error in store */
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await deleteProfile();
    } catch {
      /* error in store */
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Overview — matches Team-tab stat-tile pattern */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Overview</CardTitle>
          <CardDescription>
            Federal contract history powering the daily RFP scan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Company identity row — matches Company Info row style */}
            <div className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg">
              <Building2 className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {profile.company_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  UEI {profile.uei}
                  {profile.hq_location && ` · ${profile.hq_location}`}
                </p>
              </div>
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                {rebuiltLabel}
              </p>
            </div>

            {profileError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{profileError}</p>
              </div>
            )}

            {/* Stat tiles */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="hover-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Award className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                      Awards
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {profile.past_awards_count.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Past contracts</p>
                </CardContent>
              </Card>

              <Card className="hover-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                      Total
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {formatMoney(profile.past_awards_total)}
                  </p>
                  <p className="text-sm text-muted-foreground">Total awarded</p>
                </CardContent>
              </Card>

              <Card className="hover-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-orange-600" />
                    </div>
                    <span className="text-xs font-medium text-orange-700 bg-orange-100 px-2 py-1 rounded-full">
                      Recent
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {profile.most_recent_award_date?.slice(0, 10) ?? '—'}
                  </p>
                  <p className="text-sm text-muted-foreground">Latest award</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NAICS codes — table list, matches Team list style */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Industries (NAICS)</CardTitle>
            <CardDescription>
              Auto-extracted from your past wins. Add or remove to fine-tune what gets surfaced.
            </CardDescription>
          </div>
          {!addNaicsOpen && (
            <Button variant="outline" onClick={() => setAddNaicsOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add NAICS
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {addNaicsOpen && (
            <div className="p-4 bg-muted/30 border-b border-border space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-3">
                  <Input
                    placeholder="541512"
                    label="NAICS Code"
                    value={newNaicsCode}
                    onChange={(e) =>
                      setNewNaicsCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddNaics();
                      if (e.key === 'Escape') resetNaicsForm();
                    }}
                    autoFocus
                    className="font-mono"
                  />
                </div>
                <div className="sm:col-span-5">
                  <Input
                    placeholder="Computer Systems Design Services"
                    label="Description"
                    value={newNaicsDesc}
                    onChange={(e) => setNewNaicsDesc(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddNaics();
                      if (e.key === 'Escape') resetNaicsForm();
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    placeholder="0"
                    label="Wins"
                    type="number"
                    min={0}
                    value={newNaicsWins}
                    onChange={(e) => setNewNaicsWins(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddNaics();
                      if (e.key === 'Escape') resetNaicsForm();
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    placeholder="0"
                    label="Total"
                    type="number"
                    min={0}
                    step="any"
                    prefix="$"
                    value={newNaicsTotal}
                    onChange={(e) => setNewNaicsTotal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddNaics();
                      if (e.key === 'Escape') resetNaicsForm();
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={resetNaicsForm}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAddNaics}
                  disabled={!newNaicsCode.trim()}
                >
                  Add NAICS
                </Button>
              </div>
            </div>
          )}
          {profile.naics_codes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Briefcase className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
              No NAICS codes yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      NAICS
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Description
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Wins
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Total
                    </th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profile.naics_codes.map((n) => (
                    <tr key={n.code} className="hover:bg-muted/30 transition-colors">
                      <td className="py-4 px-6 text-sm font-mono font-medium text-foreground">
                        {n.code}
                      </td>
                      <td className="py-4 px-6 text-sm text-foreground">
                        {n.description || 'Unknown'}
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {n.wins}
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {formatMoney(n.total_amount)}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            void updateProfile({
                              naics_codes: profile.naics_codes.filter(
                                (x) => x.code !== n.code,
                              ),
                            })
                          }
                          aria-label={`Remove ${n.code}`}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sub-agencies */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Agencies You&apos;ve Worked With</CardTitle>
            <CardDescription>
              The scanner gives extra weight to matches with your warm customers.
            </CardDescription>
          </div>
          {!addAgencyOpen && (
            <Button variant="outline" onClick={() => setAddAgencyOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Agency
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {addAgencyOpen && (
            <div className="p-4 bg-muted/30 border-b border-border space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8">
                  <Input
                    placeholder="Department of the Navy"
                    label="Agency Name"
                    value={newAgencyName}
                    onChange={(e) => setNewAgencyName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddAgency();
                      if (e.key === 'Escape') resetAgencyForm();
                    }}
                    autoFocus
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    placeholder="0"
                    label="Wins"
                    type="number"
                    min={0}
                    value={newAgencyWins}
                    onChange={(e) => setNewAgencyWins(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddAgency();
                      if (e.key === 'Escape') resetAgencyForm();
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    placeholder="0"
                    label="Total"
                    type="number"
                    min={0}
                    step="any"
                    prefix="$"
                    value={newAgencyTotal}
                    onChange={(e) => setNewAgencyTotal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddAgency();
                      if (e.key === 'Escape') resetAgencyForm();
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={resetAgencyForm}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAddAgency}
                  disabled={!newAgencyName.trim()}
                >
                  Add Agency
                </Button>
              </div>
            </div>
          )}
          {profile.sub_agencies_of_interest.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Award className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
              No sub-agencies yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Agency
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Wins
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Total
                    </th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profile.sub_agencies_of_interest.map((s) => (
                    <tr key={s.name} className="hover:bg-muted/30 transition-colors">
                      <td className="py-4 px-6 text-sm font-medium text-foreground">
                        {s.name}
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {s.wins}
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {formatMoney(s.total_amount)}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            void updateProfile({
                              sub_agencies_of_interest:
                                profile.sub_agencies_of_interest.filter(
                                  (x) => x.name !== s.name,
                                ),
                            })
                          }
                          aria-label={`Remove ${s.name}`}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Set-asides */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-muted-foreground" />
            Set-Asides You Qualify For
          </CardTitle>
          <CardDescription>
            Drives the +20 set-aside bonus on matches. Verify these are current.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChipList
            values={profile.set_asides_qualified}
            onChange={(next) => void updateProfile({ set_asides_qualified: next })}
            placeholder="WOSB, 8(a)…"
          />
        </CardContent>
      </Card>

      {/* Scope keywords */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-muted-foreground" />
            Scope Keywords
          </CardTitle>
          <CardDescription>
            Used for the +25 keyword boost. Match what&apos;s in your wheelhouse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChipList
            values={profile.scope_keywords}
            onChange={(next) => void updateProfile({ scope_keywords: next })}
            placeholder="SATCOM, cybersecurity…"
          />
        </CardContent>
      </Card>

      {/* PoP states */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-muted-foreground" />
            Place-of-Performance States
          </CardTitle>
          <CardDescription>
            Where you typically deliver. Not currently used by scoring — for your reference.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChipList
            values={profile.pop_states_primary}
            onChange={(next) => void updateProfile({ pop_states_primary: next })}
            placeholder="VA, NJ…"
          />
        </CardContent>
      </Card>

      {/* Profile actions — rebuild / delete (neutral styling) */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Actions</CardTitle>
          <CardDescription>
            Refresh the profile from your latest contract data, or remove it entirely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted/30 rounded-lg border border-border">
            <h3 className="font-medium mb-2 text-foreground">Rebuild from latest wins</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Re-fetches USASpending data and overwrites the auto-built fields.{' '}
              <strong className="text-foreground">Your edits will be lost.</strong>
            </p>
            {confirmRebuild ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setConfirmRebuild(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleRebuild()}
                  disabled={profileBuilding}
                >
                  {profileBuilding ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Rebuilding…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Yes, rebuild
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setConfirmRebuild(true)}>
                <RefreshCcw className="w-4 h-4 mr-2" />
                Rebuild
              </Button>
            )}
          </div>

          <div className="p-4 bg-muted/30 rounded-lg border border-border">
            <h3 className="font-medium mb-2 text-foreground">Delete profile</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Removes the profile entirely. The daily scanner won&apos;t produce
              matches until you build a new one.
            </p>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => void handleDelete()}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Yes, delete
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Profile
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
