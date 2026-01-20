'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2, Mail } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/authStore';
import apiClient from '@/lib/api/client';

type VerificationStatus = 'verifying' | 'success' | 'error' | 'expired' | 'invalid';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuthStore();

  const [status, setStatus] = useState<VerificationStatus>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    const token = searchParams?.get('token');

    if (!token) {
      setStatus('invalid');
      setErrorMessage('No verification token provided');
      return;
    }

    verifyEmail(token);
  }, [searchParams]);

  const verifyEmail = async (token: string) => {
    try {
      const response = await apiClient.post('/auth/verify-email', { token });

      // Extract tokens and user info
      const { access_token, refresh_token, user } = response.data;

      setUserEmail(user.email);
      setStatus('success');

      // Log the user in
      await login({ access_token, refresh_token, user });

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);

    } catch (error: any) {
      console.error('Verification error:', error);

      const detail = error.response?.data?.detail || 'Verification failed';
      setErrorMessage(detail);

      // Determine specific error status
      if (detail.toLowerCase().includes('expired')) {
        setStatus('expired');
      } else if (detail.toLowerCase().includes('invalid') || detail.toLowerCase().includes('used')) {
        setStatus('invalid');
      } else {
        setStatus('error');
      }
    }
  };

  const handleResendVerification = async () => {
    if (!userEmail) return;

    try {
      await apiClient.post('/auth/resend-verification', { email: userEmail });
      router.push(`/auth/check-email?email=${encodeURIComponent(userEmail)}`);
    } catch (error) {
      console.error('Resend error:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-200">

          {/* Verifying State */}
          {status === 'verifying' && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Verifying your email...
              </h1>
              <p className="text-gray-600">
                Please wait while we verify your email address
              </p>
            </div>
          )}

          {/* Success State */}
          {status === 'success' && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Email verified!
              </h1>
              <p className="text-gray-600 mb-6">
                Your account has been successfully verified. You're being logged in...
              </p>
              <div className="flex justify-center">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
            </div>
          )}

          {/* Expired State */}
          {status === 'expired' && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
                  <Mail className="w-10 h-10 text-orange-600" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Link expired
              </h1>
              <p className="text-gray-600 mb-6">
                This verification link has expired. Links are valid for 24 hours.
              </p>
              <button
                onClick={handleResendVerification}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Send new verification link
              </button>
              <Link
                href="/auth/login"
                className="block mt-4 text-sm text-gray-600 hover:text-gray-900"
              >
                Back to login
              </Link>
            </div>
          )}

          {/* Invalid/Used State */}
          {status === 'invalid' && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <XCircle className="w-10 h-10 text-red-600" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Invalid link
              </h1>
              <p className="text-gray-600 mb-2">
                This verification link is invalid or has already been used.
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {errorMessage}
              </p>
              <Link
                href="/auth/login"
                className="inline-block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-center"
              >
                Go to login
              </Link>
              <Link
                href="/auth/signup"
                className="block mt-4 text-sm text-gray-600 hover:text-gray-900"
              >
                Create a new account
              </Link>
            </div>
          )}

          {/* Generic Error State */}
          {status === 'error' && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <XCircle className="w-10 h-10 text-red-600" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Verification failed
              </h1>
              <p className="text-gray-600 mb-2">
                We couldn't verify your email address.
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {errorMessage}
              </p>
              <Link
                href="/auth/login"
                className="inline-block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-center"
              >
                Go to login
              </Link>
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-3">
                  Need help?
                </p>
                <a
                  href="mailto:support@priceiq.com"
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Contact support
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
