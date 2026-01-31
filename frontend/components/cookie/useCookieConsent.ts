/**
 * Cookie Consent Hook
 *
 * Custom hook to manage cookie consent state
 * - Checks localStorage for existing consent
 * - Manages banner visibility
 * - Provides functions to accept/dismiss
 */

'use client';

import { useState, useEffect } from 'react';
import type { CookieConsentData, CookieConsentHook } from './cookieConsent.types';

const CONSENT_KEY = 'hubspot-cookie-consent';
const CONSENT_VERSION = '1.0.0';

export function useCookieConsent(): CookieConsentHook {
  const [hasConsent, setHasConsent] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  // Hydrate from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored) {
        const data: CookieConsentData = JSON.parse(stored);
        if (data.accepted && data.version === CONSENT_VERSION) {
          setHasConsent(true);
          setShowBanner(false);
        } else {
          setShowBanner(true);
        }
      } else {
        // No consent stored, show banner
        setShowBanner(true);
      }
    } catch (error) {
      console.error('Error reading cookie consent:', error);
      setShowBanner(true);
    }
  }, []);

  // Accept cookies - save consent and hide banner
  const acceptCookies = () => {
    try {
      const consent: CookieConsentData = {
        accepted: true,
        timestamp: Date.now(),
        version: CONSENT_VERSION,
      };
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
      setHasConsent(true);
      setShowBanner(false);

      // Trigger HubSpot load (will be handled by CookieBanner component)
      window.dispatchEvent(new CustomEvent('cookieConsentAccepted'));
    } catch (error) {
      console.error('Error saving cookie consent:', error);
    }
  };

  // Dismiss banner - just hide it, don't grant consent
  const dismissBanner = () => {
    setShowBanner(false);
    // Note: We don't save anything to localStorage
    // Banner will reappear on next visit
  };

  return {
    hasConsent,
    showBanner,
    acceptCookies,
    dismissBanner,
  };
}
