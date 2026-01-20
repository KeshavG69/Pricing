'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, ArrowLeft, RefreshCw } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import apiClient from '@/lib/api/client';

export default function CheckEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState<string>('');
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const emailParam = searchParams?.get('email');
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
    } else {
      // Redirect to signup if no email provided
      router.push('/auth/signup');
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendEmail = async () => {
    if (!email || isResending || resendCooldown > 0) return;

    setIsResending(true);
    try {
      await apiClient.post('/auth/resend-verification', { email });
      toast.success('Verification email sent! Check your inbox.');
      setResendCooldown(60); // 60-second cooldown
    } catch (error: any) {
      console.error('Resend error:', error);
      toast.error(error.response?.data?.detail || 'Failed to resend email');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="max-w-md w-full">
        {/* Back to Login Link */}
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-200">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-green-600" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
            Check your email
          </h1>

          {/* Description */}
          <p className="text-center text-gray-600 mb-6">
            We've sent a verification link to
          </p>

          {/* Email Display */}
          <div className="bg-gray-50 rounded-lg p-3 mb-6 border border-gray-200">
            <p className="text-center text-sm font-medium text-gray-900 break-all">
              {email}
            </p>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900">
              <strong>Next steps:</strong>
            </p>
            <ol className="text-sm text-blue-800 mt-2 space-y-1 list-decimal list-inside">
              <li>Check your inbox (and spam folder)</li>
              <li>Click the verification link in the email</li>
              <li>You'll be automatically logged in</li>
            </ol>
          </div>

          {/* Resend Button */}
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-3">
              Didn't receive the email?
            </p>
            <button
              onClick={handleResendEmail}
              disabled={isResending || resendCooldown > 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isResending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : resendCooldown > 0 ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Resend in {resendCooldown}s
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Resend verification email
                </>
              )}
            </button>
          </div>

          {/* Help Text */}
          <p className="text-xs text-center text-gray-500 mt-6">
            The link will expire in 24 hours
          </p>
        </div>

        {/* Additional Help */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-600">
            Need help?{' '}
            <a href="mailto:support@priceiq.com" className="text-blue-600 hover:text-blue-700 font-medium">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
