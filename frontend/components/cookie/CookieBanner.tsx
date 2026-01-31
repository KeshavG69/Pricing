/**
 * Cookie Consent Banner
 *
 * A banner that appears at the bottom of the page asking users to accept cookies.
 * - Shows on first visit
 * - Black background matching nav design
 * - Blue accept button (brand color)
 * - Dismissible (but will reappear on next visit if not accepted)
 */

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useCookieConsent } from './useCookieConsent';

export default function CookieBanner() {
  const { hasConsent, showBanner, acceptCookies, dismissBanner } = useCookieConsent();

  // Load HubSpot when consent is given
  useEffect(() => {
    if (hasConsent) {
      // Dynamically load HubSpot script
      const portalId = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;

      if (!portalId || portalId === '12345678') {
        console.warn('[CookieBanner] HubSpot Portal ID not configured');
        return;
      }

      // Check if script already loaded
      if (document.getElementById('hs-script-loader')) {
        return;
      }

      // Load HubSpot tracking script
      const script = document.createElement('script');
      script.id = 'hs-script-loader';
      script.src = `//js.hs-scripts.com/${portalId}.js`;
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);

      console.log('[CookieBanner] HubSpot tracking script loaded');
    }
  }, [hasConsent]);

  // Don't render if banner shouldn't show
  if (!showBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <div className="bg-black/95 backdrop-blur-md border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Message */}
            <div className="flex-1 flex items-start gap-3">
              <div className="flex-1">
                <p className="text-white/90 text-sm leading-relaxed">
                  We use cookies to improve your experience.{' '}
                  <Link
                    href="/legal/privacy"
                    className="text-[#2563eb] hover:text-[#1d4ed8] underline transition-colors"
                  >
                    Learn more
                  </Link>
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Dismiss button */}
              <button
                onClick={dismissBanner}
                className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm font-medium"
                aria-label="Dismiss cookie banner"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Dismiss</span>
              </button>

              {/* Accept button */}
              <button
                onClick={acceptCookies}
                className="flex-1 sm:flex-none bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all duration-300 hover:shadow-lg hover:shadow-[#2563eb]/30"
              >
                Accept Cookies
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
