/**
 * Application configuration from environment variables.
 *
 * All NEXT_PUBLIC_ prefixed env vars are available on the client.
 * Add new config values here to centralize environment variable access.
 */

export const config = {
  // API
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',

  // Pricing (in dollars for display)
  pricing: {
    basic: Number(process.env.NEXT_PUBLIC_BASIC_PROPOSAL_PRICE) || 100,
    advanced: Number(process.env.NEXT_PUBLIC_ADVANCED_ANALYSIS_PRICE) || 250,
  },

  // App
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'PriceIQ',

  // Terms and Conditions
  terms: {
    currentVersion: process.env.NEXT_PUBLIC_TERMS_VERSION || '1.0.0',
  },
} as const;

/**
 * Format price for display
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(price);
}

/**
 * Get formatted pricing strings
 */
export const pricing = {
  basic: formatPrice(config.pricing.basic),
  advanced: formatPrice(config.pricing.advanced),
};
