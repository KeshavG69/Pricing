# What We Built Today - Simple Explanation 🚀

> A complete guide to today's changes in plain English

---

## 🎯 The Big Picture

**What we did:** Added a team collaboration system to your app

**Before:**
- Each user worked alone
- Couldn't share proposals
- No teams or organizations

**After:**
- Users can be part of organizations (companies)
- Admins can invite team members via email
- Admins can share proposals with specific team members
- Everyone sees only their company's data

---

## 📁 Files We Created

### 1. **backend/utils/helpers.py** - The Translator
**What it does:** Converts MongoDB IDs into regular text

**Why we need it:**
MongoDB uses special IDs like `ObjectId("abc123")`, but JSON (which your API sends) doesn't understand them. This file translates them to plain strings.

**Core Logic:**
```python
# Input (MongoDB)
{
  "_id": ObjectId("abc123"),
  "organization_id": ObjectId("org456")
}

# Output (JSON-ready)
{
  "id": "abc123",
  "organization_id": "org456"
}
```

**When it's used:** Every time you send data from MongoDB to the frontend.

---

### 2. **backend/utils/organizations.py** - Company Manager
**What it does:** Manages organizations (companies)

**Core Logic:**
```python
# Creates a company
create_organization(name="Acme Corp", owner_id=user_123)
→ Creates company with:
  - Name: "Acme Corp"
  - Settings (pricing rates, thresholds)
  - Subscription (5 free seats)

# Gets team members
get_members(org_id=org_456, role="admin")
→ Returns list of all admins in the company
```

**Key Features:**
- Creates unique slugs for URLs (e.g., "acme-corp")
- Stores company settings (rates, thresholds)
- Lists team members
- Thread-safe (only one instance exists)

---

### 3. **backend/utils/invitations.py** - Email Invite System
**What it does:** Sends secure email invitations to join the team

**Core Logic (Step-by-Step):**

**Step 1: Admin sends invite**
```python
create_invitation(
    email="sarah@example.com",
    role="user"
)
```

What happens:
1. Generate random token: `"T9xK2pL..."`
2. Hash it: `sha256("T9xK2pL...")` → `"a3b2c1d4..."`
3. Store ONLY the hash in database (security!)
4. Send email with original token

**Step 2: Sarah clicks email link**
```python
validate_token("T9xK2pL...")
```

What happens:
1. Hash the token from URL
2. Look it up in database
3. Check if expired (7 days)
4. Return invitation details

**Step 3: Sarah creates account**
```python
accept_invitation(
    token="T9xK2pL...",
    firstName="Sarah",
    password="SecurePass123"
)
```

What happens:
1. Create user account
2. Link to organization
3. Mark invitation as accepted
4. Auto-login Sarah

**Security Feature:**
We never store the actual token - only a scrambled version. If hackers steal the database, they can't use the invitations!

---

### 4. **backend/client/email_service.py** - Email Sender
**What it does:** Sends HTML emails via Gmail/SMTP

**Core Logic:**
```python
send_invitation_email(
    to_email="sarah@example.com",
    token="T9xK2pL...",
    organization_name="Acme Corp"
)
```

What happens:
1. Creates nice HTML email with button
2. Connects to Gmail (or any SMTP server)
3. Sends the email
4. Email has link: `yourapp.com/invite/accept?token=T9xK2pL...`

**Email looks like:**
```
Subject: Invitation to join Acme Corp

Hi! Alice Johnson invited you to collaborate.

[Accept Invitation Button]

This expires in 7 days.
```

---

### 5. **backend/auth/dependencies.py** - Security Guard
**What it does:** Checks if you're allowed to do something

**Core Logic:**

**Function 1: Check if user is logged in**
```python
get_current_user(token)
→ Steps:
  1. Decode JWT token to get email
  2. Check if token is blacklisted (logged out)
  3. Find user in database
  4. Check if account is active
  5. Return user info
```

**Function 2: Check if user is admin**
```python
require_admin(current_user)
→ Steps:
  1. Already has user from step 1
  2. Check if role == "admin"
  3. If not, reject with "403 Forbidden"
```

**When it's used:**
```python
@router.post("/api/invitations")  # Invite endpoint
async def send_invite(current_user = Depends(require_admin)):
    # Only admins get past this line!
```

---

### 6. **backend/auth/rbac.py** - Permission Checker
**What it does:** Contains rules for who can do what

**Core Logic:**

**Rule 1: Can user view this proposal?**
```python
can_access_proposal(proposal, user)
→ YES if:
  - Same organization
  - User is admin (sees everything)
  - User owns the proposal
  - Proposal is shared with user

→ NO otherwise
```

**Rule 2: Can user edit this proposal?**
```python
can_modify_proposal(proposal, user)
→ YES if:
  - Same organization
  - User is admin
  - User owns the proposal

→ NO if:
  - Just shared (read-only)
```

**Rule 3: Can admin remove this user?**
```python
can_manage_user(target_user, admin)
→ YES if:
  - Current user is admin
  - Same organization
  - Not trying to remove yourself

→ NO otherwise
```

**When it's used:** Before any sensitive operation (sharing, removing users, etc.)

---

### 7. **backend/auth/crud.py** - User Database Manager (Enhanced)
**What we added:** Two new functions for organization system

**New Function 1: Create user with organization**
```python
create_user_with_organization(
    email="sarah@example.com",
    first_name="Sarah",
    password="SecurePass123",
    organization_id=org_456,
    role="user"
)
```

What it does:
1. Check if email already exists
2. Hash the password (security!)
3. Create user with organization_id
4. Return user object

**New Function 2: Remove user (soft delete)**
```python
remove_from_organization(user_id)
```

What it does:
- Sets `status = "removed"` (doesn't actually delete!)
- User can't login anymore
- But we keep their data for history

**Why soft delete?** So you can still see "Who created this proposal?"

---

### 8. **backend/utils/proposals.py** - Proposal Manager (Enhanced)
**What we added:** Three new functions for sharing

**New Function 1: Create proposal with organization**
```python
create_proposal_with_organization(
    user_id=user_123,
    organization_id=org_456,
    data={name: "Government Contract"}
)
```

What it does:
- Creates proposal linked to organization
- Sets visibility to "private"
- Initializes empty sharing list

**New Function 2: Get proposals user can see**
```python
get_user_proposals_by_org(
    user_id=user_123,
    organization_id=org_456,
    role="user"
)
```

Core Logic:
```python
if role == "admin":
    # Show ALL proposals in company
    return all_org_proposals
else:
    # Show only:
    # - Their own proposals
    # - Proposals shared with them
    return own + shared
```

**Example:**
- Alice (admin) created 10 proposals
- Bob (user) created 5 proposals
- Alice shared 3 with Bob

**Bob sees:** 5 (his) + 3 (shared) = 8 proposals
**Alice sees:** 10 + 5 = 15 proposals (everything!)

**New Function 3: Share proposal**
```python
share_proposal(
    proposal_id=prop_789,
    user_ids=[user1, user2],
    admin_id=admin_123
)
```

What it does:
1. Verify all users are in same organization
2. Update proposal: `shared_with = [user1, user2]`
3. Set `visibility = "shared"`

---

### 9. **backend/routers/organizations.py** - Organization API
**What it does:** API endpoints for managing your company

**Endpoint 1: Get my company info**
```
GET /api/organizations/me
```
Returns:
```json
{
  "name": "Acme Corp",
  "settings": {
    "default_rates": {"fringe": 0.247, "oh": 0.0711}
  },
  "subscription": {
    "plan": "free",
    "seats": 5
  }
}
```

**Endpoint 2: List team members (admin only)**
```
GET /api/organizations/me/members
```
Returns:
```json
[
  {"name": "Alice", "email": "alice@acme.com", "role": "admin"},
  {"name": "Bob", "email": "bob@acme.com", "role": "user"}
]
```

**Endpoint 3: Update company settings (admin only)**
```
PATCH /api/organizations/me/settings
Body: {"default_rates": {"fringe": 0.25}}
```

**Endpoint 4: Remove team member (admin only)**
```
DELETE /api/organizations/members/user123
```
Security checks:
- Can't remove yourself
- User must be in your org
- Sets their status to "removed"

**Endpoint 5: Get statistics**
```
GET /api/organizations/me/stats
```
Returns:
```json
{
  "active_members": 5,
  "pending_invitations": 2,
  "total_proposals": 47
}
```

---

### 10. **backend/routers/invitations.py** - Invitation API
**What it does:** API endpoints for email invitations

**Endpoint 1: Send invitation (admin only)**
```
POST /api/invitations
Body: {
  "email": "sarah@example.com",
  "role": "user"
}
```

What happens:
1. Generate secure token
2. Store hashed version
3. Send email to Sarah
4. Return success

**Endpoint 2: List pending invites (admin only)**
```
GET /api/invitations
```
Returns all pending invitations with expiry dates

**Endpoint 3: Cancel invitation (admin only)**
```
DELETE /api/invitations/{invitation_id}
```
Marks invitation as revoked

**Endpoint 4: Validate token (public)**
```
GET /api/invitations/validate/{token}
```
Returns:
```json
{
  "email": "sarah@example.com",
  "organization_name": "Acme Corp",
  "role": "user",
  "expires_at": "2025-12-18"
}
```

Frontend uses this to show signup form with pre-filled email

**Endpoint 5: Accept invitation (public)**
```
POST /api/invitations/accept
Body: {
  "token": "T9xK2pL...",
  "firstName": "Sarah",
  "password": "SecurePass123"
}
```

What happens:
1. Validate token
2. Create user account
3. Link to organization
4. Auto-login
5. Return tokens

---

### 11. **backend/routers/proposals.py** - Proposal Sharing (Enhanced)
**What we added:** 3 new endpoints

**Endpoint 1: Share proposal with users (admin only)**
```
POST /proposals/{proposal_id}/share
Body: {
  "user_ids": ["user123", "user456"]
}
```

What happens:
1. Verify all users are in your organization
2. Update proposal: `shared_with = [user123, user456]`
3. Set `visibility = "shared"`

**Endpoint 2: Unshare (make private) (admin only)**
```
DELETE /proposals/{proposal_id}/share
```

What happens:
- Set `visibility = "private"`
- Clear `shared_with = []`

**Endpoint 3: Get who can access**
```
GET /proposals/{proposal_id}/access
```

Returns:
```json
{
  "visibility": "shared",
  "owner_id": "user456",
  "shared_with": [
    {"name": "Alice", "email": "alice@acme.com"},
    {"name": "Bob", "email": "bob@acme.com"}
  ],
  "shared_count": 2
}
```

---

### 12. **backend/auth/database.py** - Database Connection (Enhanced)
**What we added:** One new function

**New Function:**
```python
get_database()
```

What it does:
- Returns the MongoDB database instance
- Creates connection if not exists
- Thread-safe (multiple requests won't create multiple connections)

**Why we needed it:** All the new CRUD classes need direct database access.

---

### 13. **backend/scripts/create_indexes.py** - Database Speed Booster (Enhanced)
**What we added:** Indexes for fast queries

**New Indexes:**

**For Users:**
```python
# Find all admins in org (FAST)
users.index: organization_id + role

# Find all active users in org (FAST)
users.index: organization_id + status
```

**For Organizations:**
```python
# Find org by URL slug (FAST, unique)
organizations.index: slug

# Find orgs by owner (FAST)
organizations.index: owner_id
```

**For Proposals:**
```python
# List org proposals (FAST)
proposals.index: organization_id + created_at

# Filter by visibility (FAST)
proposals.index: organization_id + visibility

# Find proposals shared with user (FAST)
proposals.index: shared_with
```

**For Invitations:**
```python
# Validate token (FAST, unique)
invitations.index: token_hash

# List org invites (FAST)
invitations.index: organization_id + status

# Check duplicate emails (FAST)
invitations.index: email + status

# Auto-delete old invites (TTL)
invitations.index: expires_at
```

**Core Logic:**
- Without indexes: 10+ seconds to find something
- With indexes: 10 milliseconds (1000x faster!)

**Special: TTL Index**
```python
invitations.index: expires_at (TTL: 30 days)
```
This one is magic! MongoDB automatically deletes expired invitations 30 days after they expire. No manual cleanup needed!

---

### 14. **backend/scripts/migrate_to_organizations.py** - Database Migrator
**What it does:** Converts your old database to support organizations

**Core Logic (3 Steps):**

**Step 1: Create Organizations**
```python
For each existing user:
  1. Create new organization
  2. Name it: "User's Organization"
  3. Make user the owner
```

**Step 2: Update Users**
```python
For each user:
  1. Add organization_id (link to their org)
  2. Set role = "admin" (they own the org)
  3. Set status = "active" (can login)
```

**Step 3: Update Proposals**
```python
For each proposal:
  1. Find owner's organization
  2. Add organization_id
  3. Set visibility = "private"
  4. Set shared_with = [] (empty)
```

**Safety Features:**
- `--dry-run` flag: Preview without changing anything
- `--rollback` flag: Undo migration
- Shows progress for each step

---

### 15. **backend/scripts/setup_qa_stage.py** - QA Database Cloner
**What it does:** Creates a copy of your database for testing

**Core Logic:**

**Step 1: Clone Everything**
```python
For each collection in "priceiq":
  1. Get all documents
  2. Copy to "price-qastage01"
  3. Copy indexes too
```

**Step 2: Migrate QA Database**
```python
Run migration on "price-qastage01":
  - Create organizations
  - Update users
  - Update proposals
```

**Result:**
- `priceiq` → Original (unchanged)
- `price-qastage01` → Copy with organization system

**Why?** So you can test new features without breaking production!

---

### 16. **backend/app/server.py** - Main App (Enhanced)
**What we added:** Registered new routers

**Before:**
```python
app.include_router(auth.router)
app.include_router(proposals.router)
```

**After:**
```python
app.include_router(auth.router)
app.include_router(organizations.router)  # NEW!
app.include_router(invitations.router)    # NEW!
app.include_router(proposals.router)
```

**What this means:**
- `/api/organizations/*` endpoints now work
- `/api/invitations/*` endpoints now work

---

### 17. **backend/.env** - Configuration (Enhanced)
**What we added:**

```bash
# Database (CHANGED)
MONGODB_DATABASE=price-qastage01  # Was: priceiq

# Email Settings (NEW)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=                    # Add your Gmail here
SMTP_PASSWORD=                # Add your App Password here
FROM_EMAIL=noreply@priceiq.com
```

**Why these changes:**
- **Database:** Now using QA stage for development
- **Email:** Needed to send invitation emails

---

## 🔑 Core Concepts Explained

### 1. **What's an Organization?**
Think of it like a Slack workspace or a company account:
- Each company has one organization
- Organizations have members (users)
- Organizations have settings (rates, thresholds)
- Data is isolated (Company A can't see Company B's data)

### 2. **Admin vs User**
**Admin Powers:**
- See ALL proposals in the company
- Invite new team members
- Remove team members
- Share proposals with anyone
- Change company settings

**User Powers:**
- See their own proposals
- See proposals shared with them
- Create proposals
- Cannot invite or manage people

### 3. **How Token Hashing Works**
**Problem:** If hackers steal your database, they could use invitation tokens.

**Solution:** Hash (scramble) tokens before storing

```
Original Token: "T9xK2pL..."
↓ SHA-256 Hash (one-way)
Hashed Token: "a3b2c1d4..."
↓ Store in database
Database: "a3b2c1d4..."

When user submits token:
1. Hash it again
2. Compare hashes
3. If match → Valid!
```

**Security:** Can't reverse the hash to get original token!

### 4. **Soft Delete**
**Hard Delete (BAD):**
```python
db.users.delete_one({"_id": user_id})
# User vanishes! ❌
```

**Soft Delete (GOOD):**
```python
db.users.update_one(
    {"_id": user_id},
    {"$set": {"status": "removed"}}
)
# User data stays, but marked as removed ✅
```

**Why?** Keeps audit trail - you can still see who created what.

### 5. **Singleton Pattern**
**Problem:** Multiple parts of code need to access database.

**Bad Approach:**
```python
# Create new connection every time
crud1 = OrganizationCRUD()  # New connection
crud2 = OrganizationCRUD()  # Another new connection
# Too many connections! 😱
```

**Good Approach (Singleton):**
```python
# One connection, shared by everyone
crud1 = get_organization_crud()  # Creates connection
crud2 = get_organization_crud()  # Reuses same connection
# Only one connection! ✅
```

### 6. **Database Indexes**
**Without Index:**
```
Find user with email "alice@example.com"
→ Check 1,000,000 rows one by one
→ Takes 10 seconds ⏰
```

**With Index:**
```
Find user with email "alice@example.com"
→ Jump directly to the row (like a book index)
→ Takes 0.01 seconds ⚡
```

**Cost:** Slightly slower writes, much faster reads.

---

## 🎯 How Everything Works Together

### Example: Admin Invites Sarah

**1. Admin clicks "Invite User" in UI**
```
POST /api/invitations
Body: {"email": "sarah@example.com", "role": "user"}
```

**2. Backend Flow:**
```
routers/invitations.py
  ↓
  Check if current user is admin (auth/dependencies.py)
  ↓
  utils/invitations.py → create_invitation()
    ↓
    Generate token: "T9xK2pL..."
    ↓
    Hash it: sha256("T9xK2pL...") → "a3b2c1d4..."
    ↓
    Store in database: {
      email: "sarah@example.com",
      token_hash: "a3b2c1d4...",  # NOT the original!
      expires_at: 7 days from now
    }
    ↓
    client/email_service.py → send_email()
      ↓
      Connect to Gmail
      ↓
      Send HTML email with link:
      "yourapp.com/invite/accept?token=T9xK2pL..."
```

**3. Sarah clicks email link**
```
GET /api/invitations/validate/T9xK2pL...
  ↓
  Hash the token
  ↓
  Look up hashed version in database
  ↓
  Check if expired
  ↓
  Return: {email, organization, role}
  ↓
  Frontend shows signup form
```

**4. Sarah fills form and submits**
```
POST /api/invitations/accept
Body: {
  token: "T9xK2pL...",
  firstName: "Sarah",
  password: "SecurePass123"
}
  ↓
  Validate token again
  ↓
  auth/crud.py → create_user_with_organization()
    ↓
    Hash password (bcrypt)
    ↓
    Create user: {
      email: "sarah@example.com",
      organization_id: org_123,
      role: "user",
      status: "active"
    }
  ↓
  Mark invitation as "accepted"
  ↓
  Generate JWT tokens for login
  ↓
  Return: {user, access_token, refresh_token}
  ↓
  Frontend logs Sarah in automatically
```

**5. Sarah is now logged in!**
- Can see her proposals
- Can see proposals shared with her
- Cannot see other people's proposals (unless shared)
- Cannot invite or manage people (not admin)

---

### Example: Admin Shares Proposal

**1. Admin clicks "Share with Bob"**
```
POST /proposals/prop_789/share
Body: {"user_ids": ["user_bob"]}
```

**2. Backend Flow:**
```
routers/proposals.py → share_proposal_with_users()
  ↓
  Check if admin (auth/dependencies.py → require_admin)
  ↓
  utils/proposals.py → share_proposal()
    ↓
    Get proposal from database
    ↓
    Verify all users are in same organization
    ↓
    Update proposal: {
      visibility: "shared",
      shared_with: [user_bob]
    }
```

**3. Bob's next request:**
```
GET /api/proposals
  ↓
  utils/proposals.py → get_user_proposals_by_org()
    ↓
    Bob's role is "user", so query is:
    {
      $or: [
        {user_id: bob_id},        # His own
        {shared_with: bob_id}     # Shared with him
      ]
    }
    ↓
    Returns: Bob's proposals + Shared proposal
```

**4. Bob can now see the shared proposal!**
- Can view it
- Cannot edit it (read-only)
- Cannot share it with others (not admin)

---

## 🔐 Security Features

### 1. **Token Hashing**
- Never store plain invitation tokens
- Use SHA-256 (one-way hash)
- Database breach → Tokens still safe

### 2. **JWT Authentication**
- Signed tokens (can't be faked)
- 30-minute expiration
- Blacklist for logout

### 3. **Organization Isolation**
- Every query checks `organization_id`
- Company A cannot access Company B's data
- Enforced at database level

### 4. **Role-Based Access Control**
- Check permissions before every action
- Admin vs User roles
- Cannot remove yourself

### 5. **Soft Deletes**
- Keep audit trail
- Can restore if mistake
- Compliance-friendly

---

## 📊 Database Structure

### Before Migration:
```javascript
// User
{
  "_id": "user123",
  "email": "alice@example.com",
  "firstName": "Alice"
  // No organization fields
}

// Proposal
{
  "_id": "prop456",
  "name": "Contract",
  "user_id": "user123"
  // No organization fields
}
```

### After Migration:
```javascript
// User
{
  "_id": "user123",
  "email": "alice@example.com",
  "firstName": "Alice",
  "organization_id": "org789",  // NEW!
  "role": "admin",              // NEW!
  "status": "active"            // NEW!
}

// Organization (NEW COLLECTION!)
{
  "_id": "org789",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "owner_id": "user123",
  "settings": {...},
  "subscription": {...}
}

// Proposal
{
  "_id": "prop456",
  "name": "Contract",
  "user_id": "user123",
  "organization_id": "org789",  // NEW!
  "visibility": "private",      // NEW!
  "shared_with": []             // NEW!
}

// Invitation (NEW COLLECTION!)
{
  "_id": "inv999",
  "email": "sarah@example.com",
  "organization_id": "org789",
  "token_hash": "a3b2c1d4...",  // NOT plain token!
  "status": "pending",
  "expires_at": "2025-12-18"
}
```

---

## ✅ What You Can Do Now

Your app now supports:

✅ **Organizations**
- Each company has their own workspace
- Complete data isolation

✅ **Team Members**
- Admin and user roles
- Admins manage everything
- Users have limited access

✅ **Email Invitations**
- Secure token-based invites
- 7-day expiration
- Auto-login after acceptance

✅ **Proposal Sharing**
- Admins share with specific users
- Read-only access for shared users
- Visibility tracking

✅ **Role-Based Access**
- Automatic permission checks
- Organization-scoped queries
- Audit trails

---

## 🎓 Key Takeaways

1. **Every User Belongs to an Organization**
   - Like Slack workspaces
   - Complete data isolation

2. **Admins Have Superpowers**
   - See everything
   - Manage team
   - Share proposals

3. **Regular Users Are Limited**
   - See own + shared
   - Cannot manage team

4. **Security is Built-In**
   - Token hashing
   - JWT authentication
   - RBAC permissions

5. **Everything is Fast**
   - Database indexes
   - Singleton patterns
   - Efficient queries

---

## 📝 Next Steps for You

1. **Restart Server**
   ```bash
   uv run uvicorn app.server:app --reload --port 8000
   ```

2. **Test API at:** http://localhost:8000/docs

3. **Add Email Credentials** (optional - for invitations)
   - Update `.env` with Gmail credentials

4. **Build Frontend**
   - Organization dashboard
   - Team management UI
   - Invitation flow
   - Proposal sharing UI

---

**Questions? Check:**
- Full detailed guide: `ORGANIZATION_SYSTEM_EXPLAINED.md`
- API docs: http://localhost:8000/docs

Happy coding! 🚀
