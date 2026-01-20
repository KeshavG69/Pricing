# Implementation Plan: Account Deletion Feature

## Overview
Implement user account deletion with organization admin continuity, multi-org support, and GDPR compliance.

---

## Phase 1: Backend API Endpoints

### 1.1 Pre-Deletion Check Endpoint
**File**: `backend/routers/users.py`

```python
@router.get("/me/deletion-check")
async def check_deletion_eligibility(
    current_user: dict = Depends(get_current_user)
):
    """
    Check if user can delete account or needs to handle blocking orgs.

    Returns:
    {
        "can_delete": bool,
        "blocking_organizations": [
            {
                "id": str,
                "name": str,
                "role": "admin",
                "is_last_admin": bool,
                "member_count": int,
                "can_promote_members": [
                    {"id": str, "name": str, "email": str, "role": "user"}
                ]
            }
        ],
        "other_organizations": [
            {"id": str, "name": str, "role": str}
        ]
    }
    """
```

**Logic**:
- Query all orgs where user is a member
- For each org where user is admin:
  - Count total admins
  - If only 1 admin (user) → blocking org
  - Get list of promotable members (active users)
- Return blocking orgs + non-blocking orgs

---

### 1.2 Promote Member Endpoint
**File**: `backend/routers/organizations.py`

```python
@router.post("/{organization_id}/promote/{user_id}")
async def promote_member_to_admin(
    organization_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Promote a user to admin role.

    Checks:
    - Current user is admin in this org
    - Target user is active member
    - Target user is not already admin

    Returns:
    {
        "success": true,
        "user_id": str,
        "new_role": "admin"
    }
    """
```

**Logic**:
- Verify current user is admin in org
- Verify target user exists and is active member
- Update target user's role to 'admin'
- Send email notification to promoted user
- Return success

---

### 1.3 Delete Organization Endpoint
**File**: `backend/routers/organizations.py`

```python
@router.delete("/{organization_id}")
async def delete_organization(
    organization_id: str,
    confirm: bool = Query(..., description="Must be true"),
    current_user: dict = Depends(get_current_user)
):
    """
    Delete organization and all associated data.

    Checks:
    - User is admin in org
    - Confirmation flag is true

    Actions:
    - Soft delete: Set status = 'deleted'
    - Keep billing records (7 years retention)
    - Keep proposals (anonymize user references)
    - Remove all members from org
    - Send email notifications to all members

    Returns:
    {
        "success": true,
        "organization_id": str,
        "deleted_at": datetime
    }
    """
```

**Logic**:
- Verify user is admin in org
- Require explicit confirmation
- Soft delete org: `{"status": "deleted", "deleted_at": now, "deleted_by": user_id}`
- Keep proposals with org_id (anonymize user_id → "deleted_user")
- Keep billing records unchanged
- Remove org from all members' organizations array
- Send email to all affected members
- Return success

---

### 1.4 Delete Account Endpoint
**File**: `backend/routers/users.py`

```python
@router.delete("/me")
async def delete_my_account(
    confirm: bool = Query(..., description="Must be true"),
    current_user: dict = Depends(get_current_user)
):
    """
    Delete user account after resolving blocking organizations.

    Checks:
    - No blocking organizations (last admin check)
    - Confirmation flag is true

    Actions:
    - Anonymize user data:
      - email → "deleted_user_{user_id}@deleted.local"
      - firstName → "Deleted"
      - lastName → "User"
      - password_hash → null
    - Set status = 'deleted'
    - Invalidate all JWT tokens (add to blacklist)
    - Keep user_id in proposals (for audit trail)
    - Update proposals: creator_name = "Deleted User"
    - Keep billing records unchanged
    - Send confirmation email to original email

    Returns:
    {
        "success": true,
        "message": "Account deleted successfully"
    }
    """
```

**Logic**:
- Run pre-deletion check first
- If blocking orgs exist → return error 400 "Resolve blocking organizations first"
- Anonymize user document:
  ```python
  {
      "email": f"deleted_user_{user_id}@deleted.local",
      "firstName": "Deleted",
      "lastName": "User",
      "password_hash": None,
      "status": "deleted",
      "deleted_at": datetime.utcnow()
  }
  ```
- Add all user's tokens to blacklist
- Keep `user_id` in proposals (don't remove FK)
- Update proposal documents: `{"user_name": "Deleted User"}`
- Remove user from all organizations' members array
- Send confirmation email (to original email, save it before anonymizing)
- Return success

---

## Phase 2: Frontend UI Components

### 2.1 Account Settings Page
**File**: `frontend/app/settings/account/page.tsx`

**Sections**:
1. Profile Information
2. Email & Password
3. **Danger Zone** (new section)

**Danger Zone UI**:
```tsx
<Card className="border-red-200 bg-red-50">
  <CardHeader>
    <CardTitle className="text-red-600">Danger Zone</CardTitle>
    <CardDescription>
      Irreversible actions that will permanently affect your account
    </CardDescription>
  </CardHeader>
  <CardContent>
    <Button
      variant="destructive"
      onClick={() => setShowDeleteModal(true)}
    >
      <Trash2 className="w-4 h-4 mr-2" />
      Delete Account
    </Button>
  </CardContent>
</Card>
```

---

### 2.2 Account Deletion Modal (Step 1: Check)
**File**: `frontend/components/settings/AccountDeletionModal.tsx`

**Flow**:
1. User clicks "Delete Account"
2. Call `GET /api/users/me/deletion-check`
3. Show results:
   - **If `can_delete: true`** → Show final confirmation (Step 3)
   - **If `can_delete: false`** → Show blocking orgs resolution (Step 2)

**UI Structure**:
```tsx
<Modal>
  <ModalHeader>
    <AlertCircle className="text-yellow-500" />
    <ModalTitle>Before You Go...</ModalTitle>
  </ModalHeader>

  <ModalContent>
    {blockingOrgs.length > 0 && (
      <Alert variant="warning">
        You are the last admin in {blockingOrgs.length} organization(s).
        You must resolve these before deleting your account.
      </Alert>
    )}

    {blockingOrgs.map(org => (
      <BlockingOrgCard key={org.id} org={org} />
    ))}

    {otherOrgs.length > 0 && (
      <div className="mt-4">
        <p className="text-sm text-muted-foreground">
          You will be removed from these organizations:
        </p>
        <ul className="list-disc list-inside">
          {otherOrgs.map(org => (
            <li key={org.id}>{org.name} ({org.role})</li>
          ))}
        </ul>
      </div>
    )}
  </ModalContent>
</Modal>
```

---

### 2.3 Blocking Organization Card
**File**: `frontend/components/settings/BlockingOrgCard.tsx`

**UI**:
```tsx
<Card className="border-yellow-500">
  <CardHeader>
    <CardTitle>{org.name}</CardTitle>
    <CardDescription>
      {org.member_count} members • You are the last admin
    </CardDescription>
  </CardHeader>

  <CardContent>
    <p className="text-sm mb-4">Choose one option to proceed:</p>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Option 1: Promote Member */}
      <Card className="border-2 hover:border-primary cursor-pointer">
        <CardHeader>
          <UserPlus className="w-5 h-5" />
          <CardTitle className="text-base">Promote a Member</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Make someone else an admin and keep the organization
          </p>
          <Select
            value={selectedMember}
            onChange={(memberId) => handlePromote(org.id, memberId)}
          >
            <option value="">Select member...</option>
            {org.can_promote_members.map(member => (
              <option key={member.id} value={member.id}>
                {member.name} ({member.email})
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {/* Option 2: Delete Organization */}
      <Card className="border-2 border-red-200 hover:border-red-500 cursor-pointer">
        <CardHeader>
          <Trash2 className="w-5 h-5 text-red-600" />
          <CardTitle className="text-base">Delete Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Permanently delete this organization and all its data
          </p>
          <Button
            variant="destructive"
            onClick={() => handleDeleteOrg(org.id)}
          >
            Delete {org.name}
          </Button>
        </CardContent>
      </Card>
    </div>
  </CardContent>
</Card>
```

---

### 2.4 Final Confirmation Modal (Step 3)
**File**: `frontend/components/settings/FinalDeletionConfirm.tsx`

**Shows after all blocking orgs are resolved**:

```tsx
<Modal>
  <ModalHeader>
    <AlertTriangle className="text-red-600 w-12 h-12" />
    <ModalTitle>Delete Account Permanently?</ModalTitle>
  </ModalHeader>

  <ModalContent>
    <Alert variant="destructive">
      <AlertCircle className="w-4 h-4" />
      <AlertTitle>This action cannot be undone</AlertTitle>
      <AlertDescription>
        Your account will be permanently deleted and you will be logged out immediately.
      </AlertDescription>
    </Alert>

    <div className="mt-4 space-y-2 text-sm">
      <p className="font-semibold">What will be deleted:</p>
      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
        <li>Your profile information</li>
        <li>Your login credentials</li>
        <li>Access to all organizations</li>
      </ul>

      <p className="font-semibold mt-4">What will be kept (GDPR compliance):</p>
      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
        <li>Proposals you created (anonymized as "Deleted User")</li>
        <li>Billing records (required for tax/audit)</li>
      </ul>
    </div>

    <div className="mt-6">
      <Label>
        Type <strong>DELETE</strong> to confirm
      </Label>
      <Input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="DELETE"
      />
    </div>
  </ModalContent>

  <ModalFooter>
    <Button variant="ghost" onClick={onClose}>
      Cancel
    </Button>
    <Button
      variant="destructive"
      disabled={confirmText !== "DELETE" || isDeleting}
      onClick={handleFinalDelete}
      isLoading={isDeleting}
    >
      Delete My Account
    </Button>
  </ModalFooter>
</Modal>
```

---

## Phase 3: State Management

### 3.1 Create Account Deletion Store
**File**: `frontend/lib/stores/accountDeletionStore.ts`

```typescript
interface DeletionState {
  // Deletion check
  checkLoading: boolean;
  canDelete: boolean;
  blockingOrgs: BlockingOrg[];
  otherOrgs: SimpleOrg[];

  // Actions
  checkDeletionEligibility: () => Promise<void>;
  promoteMember: (orgId: string, userId: string) => Promise<void>;
  deleteOrganization: (orgId: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  reset: () => void;
}

interface BlockingOrg {
  id: string;
  name: string;
  role: string;
  is_last_admin: boolean;
  member_count: number;
  can_promote_members: {
    id: string;
    name: string;
    email: string;
    role: string;
  }[];
}

export const useAccountDeletionStore = create<DeletionState>((set, get) => ({
  // ... implementation
}));
```

---

## Phase 4: Database Changes

### 4.1 Add Fields to Users Collection
```javascript
// No schema changes needed - use existing fields
{
  "status": "deleted",  // Existing field, new value
  "deleted_at": ISODate("2025-01-21T..."),  // New field
  "email": "deleted_user_507f1f77bcf86cd799439011@deleted.local"  // Anonymized
}
```

### 4.2 Add Fields to Organizations Collection
```javascript
{
  "status": "deleted",  // New value for existing field
  "deleted_at": ISODate("2025-01-21T..."),  // New field
  "deleted_by": ObjectId("..."),  // New field
}
```

### 4.3 Indexes
```python
# backend/scripts/create_indexes.py

# Add new indexes:
users_collection.create_index([("status", 1)])
organizations_collection.create_index([("status", 1)])
```

---

## Phase 5: Email Notifications

### 5.1 Email Templates
**File**: `backend/utils/email_templates.py`

```python
def account_deleted_confirmation(user_email: str, user_name: str):
    return {
        "subject": "Your PriceIQ Account Has Been Deleted",
        "body": f"""
        Hi {user_name},

        Your PriceIQ account has been successfully deleted.

        What's been removed:
        - Your profile and login credentials
        - Access to all organizations

        What's been retained (for legal/audit purposes):
        - Proposals you created (anonymized as "Deleted User")
        - Billing records

        If you didn't request this deletion, please contact support immediately.

        Best regards,
        PriceIQ Team
        """
    }

def organization_deleted_notification(member_email: str, org_name: str, deleted_by: str):
    return {
        "subject": f"Organization '{org_name}' Has Been Deleted",
        "body": f"""
        Hi,

        The organization '{org_name}' has been deleted by {deleted_by}.

        You have been removed from this organization.

        If you have questions, please contact {deleted_by}.

        Best regards,
        PriceIQ Team
        """
    }

def promoted_to_admin_notification(user_email: str, org_name: str, promoted_by: str):
    return {
        "subject": f"You've Been Promoted to Admin in '{org_name}'",
        "body": f"""
        Hi,

        You've been promoted to Admin in the organization '{org_name}' by {promoted_by}.

        As an admin, you can now:
        - Invite and manage members
        - Access all proposals
        - Manage organization settings

        Log in to start using your new permissions.

        Best regards,
        PriceIQ Team
        """
    }
```

---

## Phase 6: Testing Plan

### 6.1 Backend API Tests
```python
# backend/tests/test_account_deletion.py

def test_deletion_check_no_blocking_orgs():
    """User with no admin roles can delete immediately"""
    pass

def test_deletion_check_with_blocking_orgs():
    """User who is last admin in org gets blocked"""
    pass

def test_promote_member_success():
    """Admin can promote another user"""
    pass

def test_promote_member_unauthorized():
    """Non-admin cannot promote"""
    pass

def test_delete_organization_success():
    """Admin can delete org"""
    pass

def test_delete_organization_keeps_billing():
    """Billing records preserved after org deletion"""
    pass

def test_delete_account_with_blocking_orgs():
    """Account deletion fails if blocking orgs exist"""
    pass

def test_delete_account_anonymizes_data():
    """User data is anonymized correctly"""
    pass

def test_delete_account_invalidates_tokens():
    """All user tokens are blacklisted"""
    pass

def test_multi_org_deletion():
    """User in multiple orgs is removed from all"""
    pass
```

### 6.2 Frontend E2E Tests
```typescript
// frontend/cypress/e2e/account-deletion.cy.ts

describe('Account Deletion Flow', () => {
  it('shows blocking orgs if user is last admin', () => {});
  it('allows promoting member to resolve blocking org', () => {});
  it('allows deleting organization to resolve blocking org', () => {});
  it('shows final confirmation after resolving all blocking orgs', () => {});
  it('requires typing DELETE to confirm', () => {});
  it('logs user out after successful deletion', () => {});
});
```

---

## Phase 7: Security Considerations

### 7.1 Rate Limiting
```python
# backend/routers/users.py

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.delete("/me")
@limiter.limit("3/hour")  # Max 3 deletion attempts per hour
async def delete_my_account(...):
    pass
```

### 7.2 Audit Logging
```python
# backend/utils/audit_log.py

def log_account_deletion(user_id: str, user_email: str, ip_address: str):
    audit_collection.insert_one({
        "event": "account_deleted",
        "user_id": user_id,
        "email": user_email,
        "ip_address": ip_address,
        "timestamp": datetime.utcnow()
    })
```

### 7.3 Token Blacklist
```python
# Invalidate all user tokens on deletion
user_tokens = token_blacklist_collection.find({"user_id": user_id})
for token in user_tokens:
    token_blacklist_collection.insert_one({
        "token": token["token"],
        "blacklisted_at": datetime.utcnow(),
        "reason": "account_deleted"
    })
```

---

## Implementation Order (Tomorrow)

### Morning (3-4 hours)
1. ✅ **Backend endpoints** (1.5 hours)
   - Pre-deletion check
   - Promote member
   - Delete organization
   - Delete account

2. ✅ **Database indexes** (15 min)
   - Add status indexes

3. ✅ **Email templates** (30 min)
   - Account deleted confirmation
   - Org deleted notification
   - Promoted to admin

4. ✅ **Testing backend APIs** (1 hour)
   - Postman/curl tests
   - Verify blocking org logic

### Afternoon (3-4 hours)
5. ✅ **Frontend store** (45 min)
   - accountDeletionStore.ts

6. ✅ **Frontend UI components** (2 hours)
   - AccountDeletionModal.tsx
   - BlockingOrgCard.tsx
   - FinalDeletionConfirm.tsx
   - Add Danger Zone to account settings

7. ✅ **Integration testing** (1 hour)
   - Test full flow end-to-end
   - Test multi-org scenarios
   - Test email delivery

8. ✅ **Edge case handling** (30 min)
   - Network errors
   - Concurrent promotions
   - Token expiration during flow

---

## Files to Create/Modify

### Backend (New Files)
- `backend/routers/users.py` - Account deletion endpoints
- `backend/utils/email_templates.py` - Email notifications
- `backend/tests/test_account_deletion.py` - Unit tests

### Backend (Modify)
- `backend/routers/organizations.py` - Add promote/delete endpoints
- `backend/scripts/create_indexes.py` - Add status indexes
- `backend/app/server.py` - Register users router if not exists

### Frontend (New Files)
- `frontend/components/settings/AccountDeletionModal.tsx`
- `frontend/components/settings/BlockingOrgCard.tsx`
- `frontend/components/settings/FinalDeletionConfirm.tsx`
- `frontend/lib/stores/accountDeletionStore.ts`
- `frontend/lib/api/account.ts` - API client functions

### Frontend (Modify)
- `frontend/app/settings/account/page.tsx` - Add Danger Zone section

---

## Success Criteria

✅ User can check deletion eligibility
✅ User cannot delete if they are last admin in any org
✅ User can promote another member to admin
✅ User can delete entire organization if desired
✅ User can delete account after resolving all blocking orgs
✅ User data is anonymized (GDPR compliant)
✅ Billing records are preserved
✅ Proposals show "Deleted User" for deleted accounts
✅ All user tokens are invalidated
✅ Email notifications are sent
✅ Multi-org scenarios work correctly

---

## Industry Standards Validation ✅

This implementation follows best practices from:
- **GitHub**: Blocks last owner deletion, requires promotion
- **Slack**: Primary owner must transfer ownership before leaving
- **Notion**: Allows workspace deletion by admins (permanent action)
- **GDPR**: Anonymize personal data, keep business records

**Ready to implement tomorrow!** 🚀
