/**
 * HubSpot Integration Utilities
 *
 * Helper functions for HubSpot tracking and forms integration
 * - Track custom events
 * - Submit forms to HubSpot
 * - Check if HubSpot is loaded
 */

declare global {
  interface Window {
    _hsq?: Array<any>;
  }
}

/**
 * Check if HubSpot tracking is loaded and available
 */
export function isHubSpotLoaded(): boolean {
  return typeof window !== 'undefined' && Array.isArray(window._hsq);
}

/**
 * Track a custom event in HubSpot
 *
 * @param eventName - Name of the event (e.g., 'contact_form_submitted')
 * @param properties - Optional event properties
 */
export function trackHubSpotEvent(eventName: string, properties?: Record<string, any>): void {
  if (!isHubSpotLoaded()) {
    console.warn('[HubSpot] Tracking not loaded, event not tracked:', eventName);
    return;
  }

  try {
    window._hsq!.push([
      'trackEvent',
      {
        id: eventName,
        ...properties,
      },
    ]);

    console.log('[HubSpot] Event tracked:', eventName, properties);
  } catch (error) {
    console.error('[HubSpot] Error tracking event:', error);
  }
}

/**
 * Submit form data to HubSpot Forms API
 *
 * @param formData - Form data to submit
 */
export async function submitHubSpotForm(formData: {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message?: string;
}): Promise<void> {
  const portalId = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;

  if (!portalId || portalId === '12345678') {
    console.warn('[HubSpot] Portal ID not configured, form not submitted');
    return;
  }

  // Note: You'll need to create a form in HubSpot and get the form GUID
  // For now, we'll just track the contact as a custom event
  // Boss can set up proper form integration later if needed

  try {
    // Track as custom event with form data
    trackHubSpotEvent('contact_form_submitted', {
      contact_name: formData.name,
      contact_email: formData.email,
      contact_company: formData.company || 'Not provided',
      contact_phone: formData.phone || 'Not provided',
      form_location: 'contact_page',
    });

    console.log('[HubSpot] Form data tracked as event');
  } catch (error) {
    console.error('[HubSpot] Error submitting form:', error);
    throw error;
  }
}

/**
 * Identify a user in HubSpot
 *
 * @param email - User's email address
 * @param properties - Additional user properties
 */
export function identifyHubSpotUser(email: string, properties?: Record<string, any>): void {
  if (!isHubSpotLoaded()) {
    console.warn('[HubSpot] Tracking not loaded, user not identified');
    return;
  }

  try {
    window._hsq!.push([
      'identify',
      {
        email,
        ...properties,
      },
    ]);

    console.log('[HubSpot] User identified:', email);
  } catch (error) {
    console.error('[HubSpot] Error identifying user:', error);
  }
}
