/**
 * Cookie Consent Types
 *
 * TypeScript interfaces for cookie consent functionality
 */

export interface CookieConsentData {
  accepted: boolean;
  timestamp: number;
  version: string;
}

export interface CookieConsentHook {
  hasConsent: boolean;
  showBanner: boolean;
  acceptCookies: () => void;
  dismissBanner: () => void;
}
