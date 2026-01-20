# Team & Organization Management

Learn how to invite team members, manage permissions, share proposals, and configure organization settings in PriceIQ.

## What This Category Covers

This section explains PriceIQ's multi-tenant organization system, role-based access control (Admin vs User), and collaboration features. Organizations are shared workspaces where teams collaborate on pricing proposals.

## Key Concepts

### Organizations
- **Multi-tenant workspaces** for your company
- **Shared settings**: Indirect rates, escalation rates, company info
- **Data isolation**: Your proposals stay private to your organization
- **Team collaboration**: Invite members, share proposals, manage permissions

### Roles
- **Admin**: Full access to organization (invite users, see all proposals, manage settings)
- **User**: Limited access (see own proposals + shared proposals, cannot invite or manage)
- **Owner**: Special admin role (created organization, handles billing)

### Proposal Sharing
- **Default**: Proposals are private to creator
- **Admin sharing**: Admins can share any proposal with team members
- **User access**: Users only see own + shared proposals

### Workspace Switching
- **Multi-organization membership**: Users can belong to multiple organizations
- **Quick switching**: Dropdown menu in top navigation
- **Context switching**: All data switches to selected organization

## Quick Start Guides

**New to team management?** Start here:
1. [Understanding Organizations & Workspaces](01-organizations-workspaces.md) - Core concepts (5 min)
2. [Inviting Team Members](02-inviting-team-members.md) - Add users to your org (4 min)
3. [Admin vs User Roles](03-admin-vs-user-roles.md) - Understand permissions (5 min)

**Managing your team?**
1. [Managing Team Members](04-managing-team.md) - Remove users, change roles (5 min)
2. [Sharing Proposals](05-sharing-proposals.md) - Collaborate on pricing (4 min)

**Advanced:**
1. [Switching Between Workspaces](06-workspace-switching.md) - Multi-org membership (3 min)
2. [Organization Settings](07-organization-settings.md) - Configure defaults (6 min)

## All Articles in This Category

### Core Concepts
- [Understanding Organizations & Workspaces](01-organizations-workspaces.md) - Multi-tenant architecture explained (P0, Explainer)

### Team Management
- [Inviting Team Members](02-inviting-team-members.md) - Send email invitations (P0, Tutorial)
- [Admin vs User Roles](03-admin-vs-user-roles.md) - RBAC permissions (P0, Reference)
- [Managing Team Members](04-managing-team.md) - Remove users, change roles (P1, Tutorial)

### Collaboration
- [Sharing Proposals](05-sharing-proposals.md) - Share proposals with team (P1, Tutorial)
- [Switching Between Workspaces](06-workspace-switching.md) - Multi-org navigation (P1, Tutorial)

### Configuration
- [Organization Settings](07-organization-settings.md) - Company info, default rates (P1, Reference)

## Common Workflows

### Inviting a New Team Member
**Use case**: You hired a new pricing analyst and want to give them access.

1. Log in as Admin
2. Navigate to Settings (gear icon)
3. Click "Team" tab
4. Click "Invite Team Member" button (blue, top-right)
5. Enter email address
6. Select role (User or Admin)
7. Click "Send Invitation"
8. System sends email with invitation link
9. Recipient clicks link, creates account, joins organization

**Result**: New team member appears in Team tab with assigned role.

### Sharing a Proposal with Your Team
**Use case**: You finished pricing a proposal and want your manager to review it.

**Admin Flow**:
1. Navigate to Proposals dashboard
2. Find proposal to share
3. Click three-dot menu (⋮) on proposal card
4. Select "Share Proposal"
5. Check boxes for team members who should see it
6. Click "Save Sharing Settings"
7. Shared users now see proposal in their dashboard

**Result**: Selected users can view and edit the proposal.

### Switching to a Different Organization
**Use case**: You're a consultant working for multiple clients.

1. Click organization name in top navigation (shows current org)
2. Dropdown menu appears with all organizations you belong to
3. Click desired organization name
4. Page reloads with new organization context
5. All proposals, settings, team members switch to new org

**Result**: Full context switch to selected organization.

## Important Notes

### About Organizations
- **Creation**: First signup creates organization automatically
- **Ownership**: Creator becomes owner (cannot be removed)
- **Isolation**: Organizations cannot see each other's data
- **Settings**: Shared across entire organization (all members use same indirect rates)

### About Roles
- **Admin**: Can do everything (invite, remove, share, manage settings)
- **User**: Can only see own + shared proposals (cannot invite or manage)
- **Owner**: Special admin (handles billing, created org)
- **Multiple Admins**: Best practice is 2+ admins for continuity

### About Invitations
- **Token-based**: Secure SHA-256 hashed tokens
- **Expiration**: 7 days from creation
- **Single-use**: Cannot be reused after accepted
- **Resend**: Can resend if expired or lost

### About Proposal Sharing
- **Default Private**: Proposals are private to creator by default
- **Admin Control**: Only admins can share proposals
- **View + Edit**: Shared users can view AND edit proposals
- **No Revocation**: Once shared, remains shared (no un-share feature yet)

## Key Differences: Admin vs User

| Capability | Admin | User |
|------------|-------|------|
| **View own proposals** | ✅ Yes | ✅ Yes |
| **View shared proposals** | ✅ Yes | ✅ Yes |
| **View ALL org proposals** | ✅ Yes | ❌ No |
| **Create proposals** | ✅ Yes | ✅ Yes |
| **Edit own proposals** | ✅ Yes | ✅ Yes |
| **Edit shared proposals** | ✅ Yes | ✅ Yes |
| **Share proposals** | ✅ Yes | ❌ No |
| **Invite team members** | ✅ Yes | ❌ No |
| **Remove team members** | ✅ Yes | ❌ No |
| **Change user roles** | ✅ Yes | ❌ No |
| **Edit organization settings** | ✅ Yes | ❌ No (view-only) |
| **View team member list** | ✅ Yes | ❌ No |

## Related Documentation

**Getting Started:**
- [Creating Your Account](../getting-started/02-creating-account.md)
- [Understanding Your Dashboard](../getting-started/04-understanding-dashboard.md)

**Pricing Workspace:**
- [Pricing Workspace Overview](../pricing-workspace/01-workspace-overview.md)
- [Auto-Save Behavior](../pricing-workspace/09-auto-save.md)

**Advanced:**
- [Organization Settings](07-organization-settings.md)
- [Indirect Rates: Fringe, OH, G&A, Fee](../advanced-workspace/03-indirect-rates.md)

## Troubleshooting

**Invitation email not received?**
- Check spam/junk folder
- Verify email address is correct
- Ask admin to resend invitation
- Invitations expire after 7 days

**Can't see other team members' proposals?**
- Check your role (Users can't see unshared proposals)
- Ask admin to share proposal with you
- Only admins see all proposals by default

**Workspace switching causes page reload?**
- This is expected behavior (full context switch)
- All data (proposals, settings, team) switches to new org
- Cache is cleared for old organization

**Removed user still has access?**
- Logout required (JWT tokens persist until logout)
- Force logout by changing password (admin action)
- Contact support for immediate revocation

**Can't change organization name?**
- Must be Admin to edit organization settings
- Navigate to Settings → Organization → Company Information
- If still blocked, check your role in Team tab

**How do I transfer a proposal to another organization?**
- Not currently supported (proposals are permanently tied to organization)
- Workaround: Export to Excel, import in other org (manual re-entry)
- Contact support for enterprise data migration

---

**Last Updated**: January 15, 2026
**Category Priority**: P0 for Admins, P1 for Users
**Applies to**: All users, especially admins managing teams
