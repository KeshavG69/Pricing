'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { invitationsApi } from '@/lib/api/invitations';
import { useAuthStore } from '@/lib/stores/authStore';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import RoleBadge from '@/components/ui/RoleBadge';
import { Mail, Building, User, CheckCircle, XCircle, AlertCircle, BarChart3 } from 'lucide-react';
import { ValidateTokenResponse, AcceptInvitationRequest } from '@/types';

function AcceptInvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { user, fetchUser } = useAuthStore();

  const [validationStatus, setValidationStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired'>('loading');
  const [invitationData, setInvitationData] = useState<ValidateTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setValidationStatus('invalid');
      setError('No invitation token provided');
      return;
    }

    validateToken();
  }, [token]);

  const validateToken = async () => {
    if (!token) return;

    try {
      setValidationStatus('loading');
      const data = await invitationsApi.validateToken(token);
      setInvitationData(data);
      setValidationStatus('valid');
      setError(null);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Invalid or expired invitation';

      if (errorMessage.includes('expired')) {
        setValidationStatus('expired');
      } else {
        setValidationStatus('invalid');
      }

      setError(errorMessage);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Invalid invitation token');
      return;
    }

    const isExistingUser = invitationData?.user_exists;

    // Validation for new users only
    if (!isExistingUser) {
      if (!firstName.trim() || !lastName.trim()) {
        setError('Please enter your first and last name');
        return;
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters long');
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      if (!termsAccepted) {
        setError('You must accept the terms and conditions to create an account');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const data: AcceptInvitationRequest = {
        token,
        ...(isExistingUser ? {} : {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password,
          terms_accepted: termsAccepted,
        })
      };

      const response = await invitationsApi.acceptInvitation(data);

      // Store tokens
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);

      // Update user state to reflect new organization membership
      await fetchUser();

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to accept invitation';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Loading state
  if (validationStatus === 'loading') {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Validating invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid or expired token
  if (validationStatus === 'invalid' || validationStatus === 'expired') {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Logo */}
          <Link href="/" className="flex items-center justify-center space-x-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-primary-foreground">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-foreground">PriceIQ</span>
              <span className="text-xs text-muted-foreground">Gov Pricing Intelligence</span>
            </div>
          </Link>

          <Card className="border-border shadow-lg">
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
                  {validationStatus === 'expired' ? (
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  ) : (
                    <XCircle className="w-8 h-8 text-red-600" />
                  )}
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  {validationStatus === 'expired' ? 'Invitation Expired' : 'Invalid Invitation'}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {error || 'This invitation link is no longer valid.'}
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  Please contact your organization administrator to receive a new invitation.
                </p>
                <Link href="/auth/login">
                  <Button variant="primary">
                    Go to Login
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Valid invitation - show acceptance form
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center space-x-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-primary-foreground">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-foreground">PriceIQ</span>
            <span className="text-xs text-muted-foreground">Gov Pricing Intelligence</span>
          </div>
        </Link>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">You're Invited!</CardTitle>
            <CardDescription>
              {invitationData?.user_exists
                ? 'Accept this invitation to join the team'
                : 'Create your account to join the team'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Invitation Info */}
            {invitationData && (
              <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {invitationData.organization_name}
                    </p>
                    <p className="text-xs text-muted-foreground">Organization</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {invitationData.invited_by_name}
                    </p>
                    <p className="text-xs text-muted-foreground">Invited you</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{invitationData.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">Role:</p>
                      <RoleBadge role={invitationData.role as 'admin' | 'user'} size="sm" />
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                  Expires: {formatDate(invitationData.expiresAt)}
                </p>
              </div>
            )}

            {/* Acceptance Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Show form fields only for new users */}
              {invitationData && !invitationData.user_exists && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      type="text"
                      label="First Name"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      autoComplete="given-name"
                    />

                    <Input
                      type="text"
                      label="Last Name"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      autoComplete="family-name"
                    />
                  </div>

                  <Input
                    type="password"
                    label="Password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />

                  <Input
                    type="password"
                    label="Confirm Password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />

                  {/* Terms and Conditions Checkbox */}
                  <div className="flex items-start gap-3 pt-2">
                    <input
                      type="checkbox"
                      id="terms"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
                      required
                    />
                    <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight">
                      I agree to the{' '}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        Terms and Conditions
                      </a>
                      {' '}and{' '}
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        Privacy Policy
                      </a>
                    </label>
                  </div>
                </>
              )}

              {/* Message for existing users */}
              {invitationData && invitationData.user_exists && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
                  You already have an account with this email. Click below to accept the invitation and join{' '}
                  <strong>{invitationData.organization_name}</strong>.
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={isSubmitting}
                className="h-10"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {invitationData?.user_exists
                  ? 'Accept Invitation'
                  : 'Accept Invitation & Create Account'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  );
}
