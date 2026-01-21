/**
 * Blocking Organization Card
 *
 * Displays a blocking organization where the user is the last admin.
 * Provides option to promote another member to admin to resolve the block.
 */

'use client';

import { useState } from 'react';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { UserPlus, AlertCircle } from 'lucide-react';
import { BlockingOrg } from '@/lib/api/account';

interface BlockingOrgCardProps {
  org: BlockingOrg;
  onPromote: (orgId: string, userId: string) => Promise<void>;
  isPromoting: boolean;
}

export default function BlockingOrgCard({ org, onPromote, isPromoting }: BlockingOrgCardProps) {
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePromote = async () => {
    if (!selectedMember) {
      setError('Please select a member to promote');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await onPromote(org.id, selectedMember);
      // Success - the parent will refresh the list
    } catch (error: any) {
      setError(error.message || 'Failed to promote member');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-yellow-500 border-2">
      <CardHeader>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-1 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{org.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {org.member_count} members • You are the last admin
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <p className="text-sm mb-4 text-muted-foreground">
          To delete your account, you must first promote another member to admin to ensure
          this organization continues to have administrative oversight.
        </p>

        {org.can_promote_members.length === 0 ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              No other members available to promote. You must invite another member to this
              organization before you can delete your account.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-2">
                <UserPlus className="w-4 h-4 inline mr-1" />
                Select a member to promote to admin
              </label>
              <select
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
                disabled={isPromoting || isSubmitting}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Choose a member...</option>
                {org.can_promote_members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.email})
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {error}
              </div>
            )}

            <Button
              onClick={handlePromote}
              disabled={!selectedMember || isPromoting || isSubmitting}
              isLoading={isSubmitting}
              className="w-full"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Promote to Admin
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
