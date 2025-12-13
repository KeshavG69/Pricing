# Frontend Implementation Plan - Organization & User Management

## Overview
Update the Next.js frontend to integrate with the new multi-tenant organization system with admin/user roles and invitation functionality.

---

## 1. Type Definitions (types/index.ts)

### Add New Types
```typescript
// Organization types
export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  status: 'active' | 'suspended';
  settings: OrganizationSettings;
  subscription: Subscription;
}

export interface OrganizationSettings {
  default_rates: {
    fringe: number;
    oh: number;
    ga: number;
    fee: number;
    smh: number;
    sub_fee: number;
    ga_passthrough: number;
    ga_adder: number;
  };
  default_escalation_rates: Record<string, number>;
  fte_threshold: number;
  allow_user_rate_override: boolean;
}

export interface Subscription {
  plan: 'free' | 'pro' | 'enterprise';
  seats: number;
  expires_at: string | null;
}

// Team member types
export interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user';
  status: 'active' | 'removed' | 'suspended';
  created_at: string;
}

// Invitation types
export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: 'admin' | 'user';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  invited_by: string;
  invited_by_name: string;
  created_at: string;
  expires_at: string;
}

export interface InviteUserRequest {
  email: string;
  role: 'admin' | 'user';
}

export interface AcceptInvitationRequest {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
}

// Organization stats
export interface OrganizationStats {
  total_members: number;
  active_members: number;
  total_proposals: number;
  pending_invitations: number;
}
```

### Update Existing Types
```typescript
// Update User type
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organization_id: string;  // NEW
  role: 'admin' | 'user';   // NEW
  status: 'active' | 'removed' | 'suspended';  // NEW
  created_at: string;
}

// Update Proposal type
export interface Proposal {
  // ... existing fields ...
  organization_id: string;  // NEW
  visibility: 'private' | 'shared';  // NEW
  shared_with: string[];  // NEW - array of user IDs
}
```

---

## 2. API Client (lib/api/)

### Create organizations.ts
```typescript
import apiClient from './client';

export const organizationsApi = {
  // Get current user's organization
  getMyOrganization: async () => {
    const response = await apiClient.get('/organizations/me');
    return response.data;
  },

  // Get organization members (admin only)
  getMembers: async () => {
    const response = await apiClient.get('/organizations/me/members');
    return response.data;
  },

  // Update organization settings (admin only)
  updateSettings: async (settings: Partial<OrganizationSettings>) => {
    const response = await apiClient.patch('/organizations/me/settings', settings);
    return response.data;
  },

  // Remove team member (admin only)
  removeMember: async (userId: string) => {
    await apiClient.delete(`/organizations/members/${userId}`);
  },

  // Get organization stats
  getStats: async () => {
    const response = await apiClient.get('/organizations/me/stats');
    return response.data;
  },
};
```

### Create invitations.ts
```typescript
import apiClient from './client';

export const invitationsApi = {
  // Send invitation (admin only)
  sendInvitation: async (data: InviteUserRequest) => {
    const response = await apiClient.post('/invitations', data);
    return response.data;
  },

  // List pending invitations (admin only)
  listInvitations: async () => {
    const response = await apiClient.get('/invitations');
    return response.data;
  },

  // Revoke invitation (admin only)
  revokeInvitation: async (invitationId: string) => {
    await apiClient.delete(`/invitations/${invitationId}`);
  },

  // Validate token (public)
  validateToken: async (token: string) => {
    const response = await apiClient.get(`/invitations/validate/${token}`);
    return response.data;
  },

  // Accept invitation (public)
  acceptInvitation: async (data: AcceptInvitationRequest) => {
    const response = await apiClient.post('/invitations/accept', data);
    return response.data;
  },
};
```

### Update proposals.ts
```typescript
// Add sharing endpoints
export const proposalsApi = {
  // ... existing methods ...

  // Share proposal with users (admin only)
  shareProposal: async (proposalId: string, userIds: string[]) => {
    const response = await apiClient.post(`/proposals/${proposalId}/share`, {
      user_ids: userIds
    });
    return response.data;
  },

  // Make proposal private (admin only)
  makePrivate: async (proposalId: string) => {
    await apiClient.delete(`/proposals/${proposalId}/share`);
  },

  // Get proposal access info
  getAccessInfo: async (proposalId: string) => {
    const response = await apiClient.get(`/proposals/${proposalId}/access`);
    return response.data;
  },
};
```

---

## 3. State Management (lib/stores/)

### Create organizationStore.ts
```typescript
import { create } from 'zustand';

interface OrganizationState {
  organization: Organization | null;
  members: TeamMember[];
  invitations: Invitation[];
  stats: OrganizationStats | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchOrganization: () => Promise<void>;
  fetchMembers: () => Promise<void>;
  fetchInvitations: () => Promise<void>;
  fetchStats: () => Promise<void>;
  sendInvitation: (data: InviteUserRequest) => Promise<void>;
  revokeInvitation: (invitationId: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  updateSettings: (settings: Partial<OrganizationSettings>) => Promise<void>;
}

export const useOrganizationStore = create<OrganizationState>((set, get) => ({
  // ... implementation
}));
```

### Update authStore.ts
```typescript
// Add organization to user state
// Fetch organization on login/auth initialization
```

---

## 4. New Pages

### app/dashboard/team/page.tsx (Admin Only)
**Purpose:** Manage team members

**Features:**
- List all team members with role badges
- Remove team members (with confirmation)
- Show member status (active/removed)
- Can't remove yourself
- Can't remove organization owner

**UI:**
- Table/card view of members
- Role badge (Admin/User)
- Status indicator
- Actions dropdown (Remove)

### app/dashboard/invitations/page.tsx (Admin Only)
**Purpose:** Manage invitations

**Features:**
- Send new invitations (email + role selection)
- List pending invitations
- Revoke invitations
- Show expiration dates
- Resend invitation email (optional)

**UI:**
- "Invite User" button → Modal with form
- Table of pending invitations
- Status badges (Pending/Expired/Accepted)
- Actions (Revoke)

### app/dashboard/settings/organization/page.tsx (Admin Only)
**Purpose:** Configure organization settings

**Features:**
- Update organization name
- Configure default rates (fringe, OH, G&A, etc.)
- Configure default escalation rates
- Set FTE threshold
- Toggle user rate override permission

**UI:**
- Form with sections
- Save button
- Success/error toasts

### app/invite/accept/page.tsx (Public)
**Purpose:** Accept invitation and create account

**Flow:**
1. Read token from URL query param
2. Validate token with API
3. Show invitation details (organization name, invited by)
4. Form: firstName, lastName, password
5. Submit → creates account and logs in
6. Redirect to dashboard

**UI:**
- Clean public page (no dashboard layout)
- Organization branding
- Form validation
- Error handling (expired/invalid token)

---

## 5. Component Updates

### components/layout/DashboardLayout.tsx
**Changes:**
- Add admin-only navigation items:
  - Team (Users icon)
  - Invitations (Mail icon)
  - Organization Settings (Building icon)
- Show role badge next to user name
- Conditionally render admin items based on user.role

### components/proposals/ProposalCard.tsx
**Changes:**
- Show "Shared" badge if proposal.visibility === 'shared'
- Show sharing icon/indicator
- Add "Share" action in dropdown (admin only)

### components/proposals/ShareProposalModal.tsx (New)
**Purpose:** Modal to share proposal with team members

**Features:**
- Multi-select team members
- Shows current sharing status
- "Make Private" option
- Save sharing configuration

**UI:**
- Checkbox list of team members
- Search/filter members
- Save/Cancel buttons

---

## 6. Route Guards & Permissions

### Create middleware/admin-guard.ts
```typescript
// HOC or hook to protect admin routes
export function requireAdmin(Component) {
  return function AdminGuardedComponent(props) {
    const { user } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
      if (user && user.role !== 'admin') {
        router.push('/dashboard');
      }
    }, [user, router]);

    if (!user || user.role !== 'admin') {
      return <div>Access Denied</div>;
    }

    return <Component {...props} />;
  };
}
```

### Update existing pages
- Wrap admin pages with requireAdmin
- Show/hide UI elements based on role

---

## 7. UI Components to Create

### components/ui/RoleBadge.tsx
```typescript
// Display role badge (Admin/User)
interface Props {
  role: 'admin' | 'user';
  size?: 'sm' | 'md';
}
```

### components/ui/StatusBadge.tsx
```typescript
// Display status badge (Active/Removed/Suspended)
interface Props {
  status: 'active' | 'removed' | 'suspended';
}
```

### components/team/InviteUserModal.tsx
```typescript
// Modal to invite new user
// Form: email, role (dropdown)
```

### components/team/TeamMemberCard.tsx
```typescript
// Display team member with actions
```

### components/invitations/InvitationCard.tsx
```typescript
// Display invitation with status and actions
```

---

## 8. Updated Navigation Structure

```
Dashboard Layout:
  Dashboard (all users)
  Proposals (all users)

  --- ADMIN ONLY ---
  Team Management
  Invitations
  Organization Settings

  --- USER SECTION ---
  Profile Settings
  Logout
```

---

## 9. Feature Flags & Conditional Rendering

### Helper functions
```typescript
// lib/utils/permissions.ts
export const isAdmin = (user: User | null) => {
  return user?.role === 'admin';
};

export const canManageTeam = (user: User | null) => {
  return isAdmin(user);
};

export const canShareProposals = (user: User | null) => {
  return isAdmin(user);
};

export const canRemoveUser = (currentUser: User, targetUser: User) => {
  if (currentUser.role !== 'admin') return false;
  if (targetUser.id === currentUser.id) return false;
  if (targetUser.id === currentUser.organization_id) return false; // Can't remove owner
  return true;
};
```

---

## 10. Toast Notifications

Add toasts for key actions:
- ✅ User invited successfully
- ✅ Invitation revoked
- ✅ Member removed
- ✅ Settings updated
- ✅ Proposal shared
- ✅ Invitation accepted
- ❌ All error scenarios

---

## 11. Error Handling

### Handle 403 Forbidden
- When non-admin tries to access admin routes
- Show "Access Denied" message
- Redirect to dashboard

### Handle invitation errors
- Token expired
- Token invalid
- Email already in use
- Organization not found

---

## 12. Loading States

Add loading indicators for:
- Fetching organization data
- Loading team members
- Loading invitations
- Sending invitations
- Removing members
- Updating settings

---

## 13. Empty States

Design empty states for:
- No team members yet
- No pending invitations
- No proposals shared

---

## 14. Responsive Design

Ensure all new pages work on:
- Desktop (primary)
- Tablet (collapsible sidebar)
- Mobile (hamburger menu)

---

## 15. Testing Checklist

### Admin Flow
- [ ] Admin can see team management
- [ ] Admin can invite users
- [ ] Admin can revoke invitations
- [ ] Admin can remove team members
- [ ] Admin can update organization settings
- [ ] Admin can share proposals
- [ ] Admin sees all organization proposals

### User Flow
- [ ] User cannot see admin pages
- [ ] User sees only their proposals + shared proposals
- [ ] User cannot share proposals
- [ ] User cannot manage team
- [ ] User can accept invitations

### Invitation Flow
- [ ] Valid token shows invitation details
- [ ] Expired token shows error
- [ ] Invalid token shows error
- [ ] Accepting invitation creates account
- [ ] After acceptance, user is logged in
- [ ] Email invitation is sent (backend)

### Security
- [ ] Non-admin cannot access admin routes
- [ ] API returns 403 for unauthorized actions
- [ ] Cannot remove organization owner
- [ ] Cannot remove yourself

---

## 16. Implementation Order

1. **Phase 1: Foundation**
   - Update types (User, Organization, Invitation)
   - Create API clients (organizations, invitations)
   - Create organization store

2. **Phase 2: Core Features**
   - Update auth store
   - Add admin navigation to DashboardLayout
   - Create permission helpers

3. **Phase 3: Admin Pages**
   - Team Management page
   - Invitations page
   - Organization Settings page

4. **Phase 4: Public Pages**
   - Invitation Accept page

5. **Phase 5: Proposal Sharing**
   - Update proposals API
   - Create ShareProposalModal
   - Update ProposalCard

6. **Phase 6: Polish**
   - Role badges
   - Status badges
   - Empty states
   - Loading states
   - Error handling
   - Toasts

---

## 17. Environment Variables

No new environment variables needed. Uses existing:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 18. Dependencies

No new dependencies needed. Uses existing:
- zustand (state management) ✅
- axios (API calls) ✅
- lucide-react (icons) ✅
- react-hook-form (forms) ✅
- zod (validation) ✅

---

## Files to Create (9 new files)

1. `types/index.ts` (update existing)
2. `lib/api/organizations.ts` (new)
3. `lib/api/invitations.ts` (new)
4. `lib/stores/organizationStore.ts` (new)
5. `lib/utils/permissions.ts` (new)
6. `app/dashboard/team/page.tsx` (new)
7. `app/dashboard/invitations/page.tsx` (new)
8. `app/dashboard/settings/organization/page.tsx` (new)
9. `app/invite/accept/page.tsx` (new)
10. `components/proposals/ShareProposalModal.tsx` (new)
11. `components/ui/RoleBadge.tsx` (new)
12. `components/ui/StatusBadge.tsx` (new)
13. `components/team/InviteUserModal.tsx` (new)

## Files to Update (5 files)

1. `components/layout/DashboardLayout.tsx` (add admin nav)
2. `lib/stores/authStore.ts` (handle organization)
3. `lib/api/proposals.ts` (add sharing endpoints)
4. `components/proposals/ProposalCard.tsx` (show sharing status)
5. `app/dashboard/proposals/page.tsx` (show shared proposals)

---

## Total Estimate

- **New Files:** 13
- **Updated Files:** 5
- **New API Endpoints Used:** 13
- **Estimated LOC:** ~2,000 lines
- **Features:** Organization management, Team management, Invitations, Proposal sharing

---

## Success Criteria

✅ Admins can invite users via email
✅ Users can accept invitations and create accounts
✅ Admins can manage team members
✅ Admins can share proposals with specific users
✅ Users see their own + shared proposals
✅ Non-admins cannot access admin features
✅ All UI shows role/status appropriately
✅ Complete data isolation between organizations

---

**Ready to implement?** This plan covers all frontend changes needed to integrate with your backend organization system.
