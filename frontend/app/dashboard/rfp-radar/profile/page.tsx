/**
 * The standalone /dashboard/rfp-radar/profile page has been retired.
 *
 * Profile management lives in the Organization → RFP Radar tab now —
 * it's part of the organization's identity (NAICS, sub-agencies,
 * set-asides) and belongs in the Organization settings.
 *
 * This route still exists for any deep links / bookmarks pointing at
 * the old URL and simply redirects.
 */

import { redirect } from 'next/navigation';

export default function ProfilePageRedirect() {
  redirect('/dashboard/settings/organization?tab=rfp-radar');
}
