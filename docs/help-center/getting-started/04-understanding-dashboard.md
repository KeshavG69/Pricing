# Understanding Your Dashboard

**Article Type:** Explainer/Tutorial | **Priority:** P0 | **Reading Time:** 3-4 minutes

Navigate the PriceIQ dashboard with confidence - understand metrics, proposals list, and workspace switcher.

---

## Dashboard Layout

When you login to PriceIQ, the **Dashboard** is your landing page and command center.

**Main Sections:**
1. **Top Navigation Bar** - Organization switcher, settings, profile
2. **Metric Cards** (3 cards) - Active, Analyzed, Submitted proposal counts
3. **Proposals List** - All your proposals in card or table view
4. **Quick Actions** - "New Proposal" button

**Purpose:** Central hub for accessing all your pricing proposals and seeing high-level status.

---

## Top Navigation Bar

**Location:** Very top of page, spans full width

**Elements (left to right):**

### PriceIQ Logo (Left)
- **Click** logo to return to dashboard from anywhere
- Always visible across all pages

### Organization Name (Center-Left)
- Shows current organization name (e.g., "Acme Solutions Inc.")
- **Click** to open workspace switcher dropdown
- **Dropdown** appears if you belong to multiple organizations
- **Switch** organizations by clicking different org name

**See Also:** [Switching Between Workspaces](../team-organization/06-workspace-switching.md)

### Search Bar (Center)
- Search proposals by name or solicitation number
- Type to filter proposals list instantly
- Clear with × icon

### Settings Icon (Top-Right)
- **Gear icon** (⚙️)
- **Click** to open Settings page
- Tabs: Account, Organization, Team, Billing
- **Admin-only** tabs: Organization, Team (Users see read-only)

### Profile Menu (Far Top-Right)
- **Your name or email**
- **Click** to open dropdown:
  - "Profile" → Account settings
  - "Logout" → Sign out

---

## Metric Cards (3 Cards)

**Location:** Below top navigation, spans width in 3 equal columns

**Purpose:** Quick status overview of your proposals

---

### Card 1: Active Proposals

**Label:** "Active" (top of card)
**Number:** Large count (e.g., "12")
**Color:** Blue accent

**What This Means:**
- Proposals you're currently working on
- Status: Draft or in-progress (not yet submitted)
- **Excludes**: Submitted proposals, archived proposals

**Click Behavior:**
- **Click card** → Filters proposals list to show only Active proposals
- Click again to clear filter

---

### Card 2: Analyzed Proposals

**Label:** "Analyzed" (top of card)
**Number:** Large count (e.g., "45")
**Color:** Green accent

**What This Means:**
- Proposals that have completed AI processing
- Extraction successful, positions loaded
- Includes Active + Submitted proposals (anything that was processed)

**Click Behavior:**
- **Click card** → Filters proposals list to show only Analyzed proposals

---

### Card 3: Submitted Proposals

**Label:** "Submitted" (top of card)
**Number:** Large count (e.g., "8")
**Color:** Purple accent

**What This Means:**
- Proposals marked as submitted to customer
- No longer in active editing
- Archived for record-keeping

**Click Behavior:**
- **Click card** → Filters proposals list to show only Submitted proposals

**Note:** To mark a proposal as Submitted, open proposal → Click "Mark as Submitted" button (top toolbar)

---

## Proposals List

**Location:** Below metric cards, main content area

**View Options:** Card view (default) or Table view (toggle top-right)

---

### Card View

**Layout:** Grid of proposal cards (3-4 per row, depending on screen width)

**Each Card Shows:**
- **Proposal Name** (large text, top)
- **Solicitation Number** (if provided, gray text)
- **Status Badge** (Draft, In Progress, Submitted)
- **Created Date** (e.g., "Created Jan 10, 2026")
- **Last Modified** (e.g., "Updated 2 hours ago")
- **Total Cost** (large number, e.g., "$2.4M")
- **Three-Dot Menu** (⋮, top-right) - Actions dropdown

**Card Actions (Three-Dot Menu):**
- **Open** → Open pricing workspace
- **Duplicate** → Create copy
- **Rename** → Change proposal name
- **Mark as Submitted** → Move to Submitted status
- **Export** → Download Excel
- **Delete** → Permanently remove (confirmation required)
- **(Admin-only) Share** → Share with team members

---

### Table View

**Toggle:** Click table icon (top-right of proposals list)

**Columns:**
1. **Proposal Name** (sortable)
2. **Solicitation Number**
3. **Status** (badge)
4. **Total Cost** (sortable)
5. **Created Date** (sortable)
6. **Last Modified** (sortable)
7. **Actions** (⋮ menu)

**Sorting:**
- Click column header to sort ascending
- Click again to sort descending
- Default: Last Modified (newest first)

**Filtering:**
- Use search bar at top
- Click metric cards to filter by status
- Filters stack (e.g., search + Active filter)

---

## Quick Actions

### New Proposal Button

**Location:** Top-right of proposals list area (blue button)

**Label:** "New Proposal" or "+ New Proposal"

**Action:**
1. **Click** button
2. **Redirects** to upload page
3. **Follow** upload workflow (see [Your First Proposal](03-first-proposal.md))

---

## Proposal Status Badges

**Visual Indicators:**

### Draft (Gray Badge)
- Proposal created but not yet processed
- No positions extracted yet

### In Progress (Blue Badge)
- Processing complete, positions extracted
- Currently being edited
- **Default status** for new proposals after processing

### Submitted (Purple Badge)
- Marked as submitted to customer
- No longer actively editing
- Archived for reference

**Changing Status:**
- Open proposal → Click "Mark as Submitted" (top toolbar)
- Or use three-dot menu on proposal card

---

## Dashboard Workflows

### Finding a Specific Proposal

**Method 1: Search**
1. **Click** search bar (top-center)
2. **Type** proposal name or solicitation number
3. **Results** filter instantly as you type
4. **Click** proposal card to open

**Method 2: Sort**
1. **Switch** to Table view (if not already)
2. **Click** column header to sort (e.g., "Last Modified")
3. **Scroll** to find proposal
4. **Click** row to open

**Method 3: Filter by Status**
1. **Click** metric card (Active, Analyzed, or Submitted)
2. **List filters** to show only that status
3. **Find** proposal
4. **Click** to open

---

### Opening a Proposal

**Action:**
1. **Find** proposal in list (card or table view)
2. **Click** anywhere on proposal card (or row in table view)
3. **Pricing workspace** loads in same tab

**Alternative:**
- **Right-click** card → "Open in New Tab" (browser feature)
- Or **Ctrl+Click** (Windows) / **Cmd+Click** (Mac) to open in new tab

---

### Duplicating a Proposal

**Use Case:** Re-use pricing for similar RFP

**Action:**
1. **Find** proposal to duplicate
2. **Click** three-dot menu (⋮) on card
3. **Select** "Duplicate" from dropdown
4. **New proposal** created with name: "[Original Name] (Copy)"
5. **New proposal** appears in list

**Result:**
- All positions, rates, subcontractors, ODCs copied
- New proposal ID (separate from original)
- Both proposals remain independent (edits don't sync)

---

### Deleting a Proposal

**Warning:** Permanent action, cannot be undone

**Action:**
1. **Find** proposal to delete
2. **Click** three-dot menu (⋮)
3. **Select** "Delete" (red text)
4. **Confirmation dialog** appears: "Are you sure?"
5. **Click** "Delete" to confirm
6. **Proposal removed** from list and database

**Permissions:**
- **Admins**: Can delete any organization proposal
- **Users**: Can only delete own proposals

---

### Exporting from Dashboard

**Action:**
1. **Find** proposal
2. **Click** three-dot menu (⋮)
3. **Select** "Export"
4. **Excel file** downloads (same as Export button in workspace)

**Benefit:** Export without opening proposal (faster for quick exports)

---

## Workspace Switcher (Multi-Organization)

**Who Uses This:** Users belonging to multiple organizations (consultants, teaming partners)

**Location:** Organization name in top navigation bar

**Action:**
1. **Click** organization name (center-left, top nav)
2. **Dropdown menu** appears listing all your organizations
3. **Current organization** shown with checkmark (✓)
4. **Click** different organization name
5. **Page reloads** with new organization context

**What Changes:**
- Proposals list (shows new org's proposals)
- Metric cards (show new org's counts)
- Settings (new org's indirect rates, etc.)
- Team (new org's members)

**See Also:** [Switching Between Workspaces](../team-organization/06-workspace-switching.md)

---

## Dashboard Customization (Coming Soon)

**Future Features:**
- Custom dashboard layouts
- Pinned proposals
- Recent activity feed
- Cost trend charts
- Team activity (who's editing what)

---

## Troubleshooting

### Proposals not loading

**Problem:** Dashboard shows "Loading..." forever

**Possible Causes:**
1. Network issue (internet disconnected)
2. Backend server down
3. Browser cache corruption

**Solutions:**
- Check internet connection
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Clear browser cache
- Try different browser
- Check status.priceiq.com for service status

---

### Metric counts seem wrong

**Problem:** "Active: 5" but you see 3 proposals in list

**Possible Causes:**
1. Filters applied (search, status filter)
2. Shared proposals not counted
3. Cache out of sync

**Solutions:**
- Clear all filters (clear search, click metric cards to toggle off)
- Hard refresh page
- Logout and login again
- Contact support if persists

---

### Can't find a proposal

**Problem:** You know the proposal exists but don't see it

**Possible Causes:**
1. Filtered view (status filter active)
2. Belongs to different organization (if multi-org user)
3. Deleted by another user (admin)
4. Archived or hidden (future feature)

**Solutions:**
- Clear all filters
- Check you're in correct organization (click org name, verify)
- Check Submitted proposals (might be marked submitted)
- Ask admin if they deleted it

---

### Three-dot menu options missing

**Problem:** "Share Proposal" option not visible

**Possible Cause:** You're a User (not Admin)

**Solution:**
- "Share" is admin-only feature
- Ask admin to share proposal for you
- Or request admin role promotion

---

## Related Articles

**Next Steps:**
- [Your First Proposal: 5-Minute Quick Start](03-first-proposal.md)
- [Pricing Workspace Overview](../pricing-workspace/01-workspace-overview.md)
- [Overview Tab: Cost Analytics](../pricing-workspace/02-overview-tab.md)

**Team Features:**
- [Understanding Organizations & Workspaces](../team-organization/01-organizations-workspaces.md)
- [Switching Between Workspaces](../team-organization/06-workspace-switching.md)
- [Sharing Proposals](../team-organization/05-sharing-proposals.md)

**Troubleshooting:**
- [Slow Performance](../troubleshooting/07-performance-issues.md)
- [Browser Compatibility](../troubleshooting/08-browser-compatibility.md)

---

**Last Updated**: January 15, 2026
