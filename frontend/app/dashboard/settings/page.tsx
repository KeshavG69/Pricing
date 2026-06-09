'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { User, Lock, Mail, CheckCircle2, Trash2 } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { authApi } from '@/lib/api/auth';
import AccountDeletionModal from '@/components/settings/AccountDeletionModal';

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const toast = useToast();

  // Name edit state
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  // Password change form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Account deletion state
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSaveName = async () => {
    const trimmedName = nameInput.trim();

    // Don't save if empty or unchanged
    if (!trimmedName || trimmedName === `${user?.firstName} ${user?.lastName}`.trim()) {
      setIsEditingName(false);
      setNameInput('');
      return;
    }

    setIsSavingName(true);
    try {
      const result = await authApi.updateProfile(trimmedName);

      // Update the user in auth store
      const { fetchUser } = useAuthStore.getState();
      await fetchUser();

      toast.success('Name updated successfully');
      setIsEditingName(false);
      setNameInput('');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    // Validate password length
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long');
      return;
    }

    // Check if new password is same as current
    if (currentPassword === newPassword) {
      setPasswordError('New password must be different from current password');
      return;
    }

    setIsChangingPassword(true);

    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      toast.success('Password changed successfully');

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Clear success message after 5 seconds
      setTimeout(() => {
        setPasswordSuccess(false);
      }, 5000);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Failed to change password';
      setPasswordError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!user) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      
      </>
  );
  }

  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mt-2">
          <h1 className="text-3xl font-bold text-foreground mb-2">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your account information and security settings
          </p>
        </div>

        {/* Profile Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Your account details and organization membership
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Name */}
              {!isEditingName ? (
                <div
                  className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setIsEditingName(true);
                    setNameInput(`${user.firstName} ${user.lastName}`.trim());
                  }}
                  title="Click to edit"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-border">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">Full Name</p>
                    <p className="text-sm font-medium text-foreground">
                      {user.firstName} {user.lastName}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-border">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onBlur={handleSaveName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveName();
                      } else if (e.key === 'Escape') {
                        setIsEditingName(false);
                        setNameInput('');
                      }
                    }}
                    placeholder="Enter your full name"
                    autoFocus
                    disabled={isSavingName}
                    className="flex-1 border-none focus:ring-0 bg-transparent"
                  />
                </div>
              )}

              {/* Email */}
              <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">Email Address</p>
                  <p className="text-sm font-medium text-foreground">{user.email}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change Password Card */}
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Update your password to keep your account secure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              {passwordSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <p className="text-sm text-green-700">
                    Your password has been changed successfully!
                  </p>
                </div>
              )}

              {passwordError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                  {passwordError}
                </div>
              )}

              <Input
                type="password"
                label="Current Password"
                placeholder="Enter your current password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPasswordError(null);
                }}
                required
                autoComplete="current-password"
              />

              <Input
                type="password"
                label="New Password"
                placeholder="Enter your new password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(null);
                }}
                required
                autoComplete="new-password"
              />

              <Input
                type="password"
                label="Confirm New Password"
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordError(null);
                }}
                required
                autoComplete="new-password"
              />

              <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
                <strong className="text-foreground">Password requirements:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>At least 8 characters long</li>
                  <li>Different from your current password</li>
                </ul>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isChangingPassword}
                  disabled={!currentPassword || !newPassword || !confirmPassword}
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Change Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader>
            <CardTitle className="text-red-600">Danger Zone</CardTitle>
            <CardDescription className="text-red-600/80">
              Irreversible actions that will permanently affect your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-background rounded-lg border border-red-200">
              <h3 className="font-medium mb-2">Delete Account</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Account Deletion Modal */}
      <AccountDeletionModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
      />
    
    </>
  );
}
