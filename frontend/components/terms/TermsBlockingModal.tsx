'use client';

import { useState } from 'react';
import { termsApi } from '@/lib/api/terms';
import { useAuthStore } from '@/lib/stores/authStore';
import { FileText } from 'lucide-react';
import { TermsContent } from './content/TermsContent';

/**
 * TermsBlockingModal - Forces users to accept updated terms
 * Cannot be dismissed without accepting
 * Shows automatically when user.needs_terms_acceptance is true
 * Design inspired by Apple's Human Interface Guidelines
 */
export function TermsBlockingModal() {
  const { user, fetchUser } = useAuthStore();
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState('');

  // Get version from config
  const currentVersion = termsApi.getCurrentVersion();

  // Handle acceptance
  const handleAccept = async () => {
    setIsAccepting(true);
    setError('');

    try {
      // Update backend
      await termsApi.acceptTerms();

      // Refresh user object (will set needs_terms_acceptance to false)
      await fetchUser();

      // Modal will auto-close because needs_terms_acceptance is now false
    } catch (err) {
      console.error('Failed to accept terms:', err);
      setError('Failed to accept terms. Please try again.');
    } finally {
      setIsAccepting(false);
    }
  };

  // Don't render if user doesn't need to accept
  if (!user?.needs_terms_acceptance) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-[90vw] max-w-3xl max-h-[85vh] flex flex-col shadow-xl">
        {/* Header - Apple style */}
        <div className="px-8 pt-8 pb-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Terms & Conditions
              </h2>
              <p className="text-[15px] text-gray-600 leading-relaxed">
                Please review and accept our terms to continue using PriceIQ
              </p>
            </div>
          </div>
        </div>

        {/* Terms Content (Scrollable) - Apple style with generous padding */}
        <div className="flex-1 overflow-auto px-10 py-2">
          {error ? (
            <div className="bg-red-50 rounded-xl px-5 py-4 text-sm text-red-700">
              <p className="font-medium mb-1">Unable to accept terms</p>
              <p className="text-red-600">{error}</p>
            </div>
          ) : (
            <TermsContent />
          )}
        </div>

        {/* Footer with Accept Button - Apple style */}
        <div className="px-8 py-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-500 text-center mb-4 leading-relaxed">
            By clicking Accept, you agree to version {currentVersion} of our Terms and Conditions
          </p>

          <button
            onClick={handleAccept}
            disabled={isAccepting}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors duration-150 text-[15px]"
          >
            {isAccepting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Accepting...
              </span>
            ) : (
              'Accept'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
