# MongoDB Database Schema - Complete Guide

**Last Updated:** December 15, 2025
**Purpose:** This document explains every collection in our MongoDB database in simple, easy-to-understand language with detailed explanations of how everything works.

---

## Table of Contents

1. [What is MongoDB and Why We Use It](#what-is-mongodb-and-why-we-use-it)
2. [Database Overview](#database-overview)
3. [All Collections Explained](#all-collections-explained)
4. [How Data Flows Between Collections](#how-data-flows-between-collections)
5. [Security and Access Control](#security-and-access-control)
6. [Performance Tips](#performance-tips)

---

## What is MongoDB and Why We Use It

### What is MongoDB?

MongoDB is a **NoSQL database** that stores data as **JSON-like documents** instead of tables with rows and columns (like Excel or SQL databases).

**Example of MongoDB document:**
```json
{
  "_id": "abc123",
  "name": "John Doe",
  "email": "john@example.com",
  "age": 30
}
```

### Why We Choose MongoDB

1. **Flexible Schema**: We can add new fields anytime without breaking existing data
2. **Embedded Documents**: We can nest related data together (like putting all proposal jobs inside the proposal document)
3. **Fast Queries**: Built-in indexing makes searches lightning fast
4. **Scalability**: Can handle millions of documents easily

---

## Database Overview

### Our Database Structure

```
priceiq_database/
├── users (Authentication & User Accounts)
├── organizations (Company/Workspace Settings)
├── proposals (Pricing Proposals with Jobs & Rates)
├── invitations (Email Invites to Join Organizations)
├── refresh_tokens (Login Session Management)
├── occupations (BLS Job Titles & Codes)
├── areas (Geographic Locations for Wages)
├── wage_data (6 Million+ Wage Records from BLS)
└── token_blacklist (Revoked Login Tokens)
```

### How Collections Connect

```
User Account
    ↓
    ├─→ Belongs to Organization(s)
    ↓
    ├─→ Creates Proposals
    ↓
    └─→ Each Proposal has:
        ├─ Jobs/Positions
        ├─ Wage Data (from wage_data collection)
        ├─ Rates (fringe, overhead, etc.)
        └─ Documents (PDFs uploaded)
```

---

## All Collections Explained

### 1. USERS Collection

**What it stores:** User accounts with email/password or Google login

**Why it exists:** To identify who's logging in and what they can access

#### Fields Explained (Every Field in Detail)

| Field Name | What It Is | Example | Why We Need It |
|------------|------------|---------|----------------|
| `_id` | Unique user ID (UUID format) | `"550e8400-e29b-41d4-a716-446655440000"` | Primary identifier for the user. UUID format ensures no conflicts across systems |
| `firstName` | User's first name | `"John"` | Display name in UI, personalization |
| `lastName` | User's last name | `"Doe"` | Display full name, professional correspondence |
| `email` | User's email address (unique) | `"john.doe@example.com"` | Login credential, communication, must be unique across all users |
| `password` | Encrypted password (bcrypt) | `"$2b$12$KIXzq..."` | Only for email/password logins. Never stored as plain text. Uses bcrypt which is uncrackable |
| `auth_method` | How user logs in | `"email"` or `"google"` | Tells system which login flow to use |
| `google_id` | Google account ID | `"108234567890123456789"` | Links to Google account if using Google OAuth |
| `google_profile` | Full Google profile data | `{name: "John Doe", picture: "https://..."}` | Stores profile pic, verified email status from Google |
| `current_organization_id` | Active workspace | `ObjectId("507f...")` | Which organization user is currently working in. Changes when switching workspaces |
| `organizations` | Array of all workspaces user belongs to | `[{organization_id: ..., role: "admin", ...}]` | **Multi-tenant support**: Users can belong to multiple companies |
| `├─ organization_id` | Reference to organization | `ObjectId("507f...")` | Points to organizations collection |
| `├─ role` | Permission level | `"admin"` or `"user"` | Admins can invite users, manage settings. Users have limited access |
| `├─ status` | Membership status | `"active"`, `"removed"`, `"suspended"` | Controls whether user can access this org |
| `└─ joinedAt` | When user joined this org | `ISODate("2025-12-01...")` | Audit trail, display in UI |
| `createdAt` | Account creation date | `ISODate("2025-12-01...")` | Shows how long user has been with platform |
| `updatedAt` | Last modification date | `ISODate("2025-12-15...")` | Tracks any changes to user profile |

#### Core Logic: Multi-Organization Support

**Problem:** Users need to work for multiple companies without creating separate accounts.

**Solution:** Each user has an `organizations` array with multiple memberships:

```json
{
  "_id": "user-123",
  "email": "john@example.com",
  "current_organization_id": ObjectId("org-A"),
  "organizations": [
    {
      "organization_id": ObjectId("org-A"),
      "role": "admin",
      "status": "active",
      "joinedAt": "2025-01-01"
    },
    {
      "organization_id": ObjectId("org-B"),
      "role": "user",
      "status": "active",
      "joinedAt": "2025-06-15"
    }
  ]
}
```

**How it works:**
1. User logs in → sees list of all organizations they belong to
2. User selects "org-A" → `current_organization_id` is set to org-A
3. All API calls now filter data by org-A → user only sees org-A's proposals
4. User switches to "org-B" → `current_organization_id` changes → now sees org-B's data

#### Indexes (Makes Queries Fast)

```javascript
// Find user by email (for login) - INSTANT lookup
db.users.createIndex({ "email": 1 }, { unique: true })

// Find all users in an organization - FAST
db.users.createIndex({
  "organizations.organization_id": 1,
  "organizations.status": 1
})

// Find user's current org - FAST
db.users.createIndex({ "current_organization_id": 1 })
```

**Why indexes matter:** Without indexes, MongoDB scans every document (slow). With indexes, it jumps directly to matching documents (fast).

---

### 2. ORGANIZATIONS Collection

**What it stores:** Company/workspace settings and configuration

**Why it exists:** Each company has different pricing rates, team members, and subscription plans. This stores all that.

#### Fields Explained

| Field Name | What It Is | Example | Why We Need It |
|------------|------------|---------|----------------|
| `_id` | Unique organization ID | `ObjectId("507f...")` | Primary identifier |
| `name` | Company name | `"Acme Corporation"` | Display in UI, emails |
| `slug` | URL-friendly identifier | `"acme-corp"` | Used in URLs: `/org/acme-corp/proposals` |
| `owner_id` | Who created this org | `"user-123"` (UUID) | Original creator, has special privileges |
| `created_at` | When org was created | `ISODate("2025-12-01...")` | Audit trail |
| `updated_at` | Last settings change | `ISODate("2025-12-15...")` | Track when settings modified |
| `status` | Organization status | `"active"` or `"suspended"` | Suspended = no access (e.g., billing issue) |
| **`settings`** | **All default configurations** | See below | **Default values for new proposals** |
| `├─ default_rates` | Default pricing rates | See below | Pre-fills proposal rates |
| `│  ├─ fringe` | Fringe benefits rate | `0.247` (24.7%) | Healthcare, retirement, etc. |
| `│  ├─ oh` | Overhead rate | `0.0711` (7.11%) | Rent, utilities, office costs |
| `│  ├─ ga` | G&A rate | `0.2243` (22.43%) | Management, HR, accounting |
| `│  ├─ fee` | Prime contractor fee | `0.07` (7%) | Profit on prime labor |
| `│  ├─ smh` | Subcontractor handling | `0.065` (6.5%) | Cost to manage subs |
| `│  ├─ sub_fee` | Fee on subcontractor labor | `0.0` | Profit on sub labor (override per proposal if charged) |
| `│  └─ ga_passthrough` | G&A on subcontractor costs | `0.025` (2.5%) | G&A applied to subs |
| `├─ default_escalation_rate` | Annual wage increase | `0.03` (3%) | Year-over-year inflation |
| `└─ allow_user_rate_override` | Can users change rates? | `true` | If false, rates are locked |
| **`subscription`** | **Billing information** | See below | **Controls plan limits** |
| `├─ plan` | Subscription tier | `"free"`, `"pro"`, `"enterprise"` | Determines features available |
| `├─ seats` | Number of allowed users | `5` | Free plan = 5 users max |
| `└─ expires_at` | When subscription expires | `null` or `ISODate(...)` | null = never expires (free plan) |

#### Core Logic: Default Rates System

**Problem:** Every proposal needs 8+ different rates. Users don't want to enter them every time.

**Solution:** Organization stores default rates. When creating a new proposal:

```python
# User creates proposal
new_proposal = create_proposal(user_id, org_id)

# Backend auto-fills rates from organization defaults
org = get_organization(org_id)
new_proposal.rates = org.settings.default_rates  # Copy defaults

# User can then override if allowed
if org.settings.allow_user_rate_override:
    user_can_edit_rates = True
```

**Example Flow:**
1. Acme Corp sets default fringe = 24.7%, OH = 7.11%, etc.
2. John creates a new proposal → rates auto-fill with 24.7%, 7.11%, etc.
3. John adjusts fringe to 25% for this specific proposal
4. Next proposal John creates → rates reset to defaults (24.7%)

#### Subscription Plans

| Plan | Seats | Proposals | Features | Price |
|------|-------|-----------|----------|-------|
| **Free** | 5 | Unlimited | Basic features | $0/month |
| **Pro** | Unlimited | Unlimited | Sharing, custom rates, priority support | $49/month |
| **Enterprise** | Unlimited | Unlimited | API access, custom integrations | Contact sales |

---

### 3. PROPOSALS Collection

**What it stores:** Complete pricing proposals with jobs, rates, and documents

**Why it exists:** This is the CORE of the application. Every uploaded PDF, every job position, every calculation lives here.

#### Fields Explained (This is the biggest collection)

| Field Name | What It Is | Example | Why We Need It |
|------------|------------|---------|----------------|
| `_id` | Unique proposal ID | `ObjectId("507f...")` | Primary identifier |
| `user_id` | Who owns this proposal | `"user-123"` (UUID) | Creator of proposal |
| `organization_id` | Which company this belongs to | `ObjectId("org-A")` | **CRITICAL for multi-tenancy**. All queries filter by this |
| `name` | Proposal name | `"Navy Contract 2025"` | User-friendly identifier |
| `solicitation_number` | RFP/Contract number | `"N0017825R3013"` | Government contract identifier |
| `created_at` | When proposal was created | `ISODate("2025-12-15...")` | Sort by newest |
| `updated_at` | Last modification | `ISODate("2025-12-15...")` | Track changes |
| `status` | Processing status | `"processing"`, `"completed"`, `"error"` | Shows user what's happening |
| `progress` | Processing percentage | `45` (0-100) | Progress bar in UI |
| `message` | Status message for user | `"Parsing PDF... found 12 positions"` | Explain what's happening |
| `visibility` | Who can see this | `"private"` or `"shared"` | Private = owner only. Shared = owner + specific users |
| `shared_with` | Array of user IDs with access | `["user-456", "user-789"]` | Only these users can access if status=shared |
| `excel_downloaded` | Has user downloaded Excel? | `true` or `false` | **KEY**: Determines "In Progress" vs "Submitted" status |
| **`documents`** | **Uploaded PDF files** | Array of objects | **Stores all uploaded files** |
| `├─ filename` | Original file name | `"Labor_Info.pdf"` | Display to user |
| `├─ file_size` | Size in bytes | `245632` | Show "240 KB" in UI |
| `├─ upload_date` | When uploaded | `ISODate(...)` | Audit trail |
| `├─ idrive_url` | Pre-signed S3 URL | `"https://s3.idrivee2-33.com/..."` | **7-day expiration link** to download file |
| `├─ idrive_key` | S3 object key | `"users/user-123/proposals/..."` | Unique file path in S3 |
| `├─ object_key` | Full S3 path | `"users/user-123/proposals/proposal-abc/Labor_Info.pdf"` | Complete file location |
| `└─ extracted_content` | Parsed text from PDF | `"Program Manager, 10 years..."` | Raw text extracted by LlamaExtract |
| **`jobs`** | **Array of job positions** | Array of objects | **THE MAIN DATA**: All positions from the proposal |
| `├─ labor_category` | Job title | `"Program Manager, Senior"` | What the position is called |
| `├─ soc_code` | BLS occupation code | `"11-3021"` | Standard Occupational Classification code |
| `├─ soc_title` | BLS occupation name | `"Computer and Information Systems Managers"` | Official BLS job title |
| `├─ bls_occupation_description` | What the job does | `"Plan, direct, or coordinate..."` | BLS description of duties |
| `├─ experience` | Years of experience | `10` | Required experience level |
| `├─ location` | Where the job is | `"Virginia"` or `"National"` | Geographic area for wage lookup |
| `├─ percentile` | Which wage selected | `"75th"` | 25th=entry, 50th=median, 75th=senior, 90th=expert |
| `├─ selected_wage` | Actual annual salary | `$123,390` | The wage user selected for this job |
| `├─ wage_10th` | 10th percentile wage | `$85,000` | Entry-level wage from BLS |
| `├─ wage_25th` | 25th percentile wage | `$105,000` | Below-average wage |
| `├─ wage_50th` | Median wage | `$125,000` | Median/average wage |
| `├─ wage_75th` | 75th percentile wage | `$145,000` | Above-average wage |
| `├─ wage_90th` | 90th percentile wage | `$165,000` | Expert-level wage |
| `├─ hours_per_year` | Hours worked each year | `{"1": 1880, "2": 1880, "3": 1880}` | Different hours each contract year |
| `└─ standard_fte_hours` | Full-time threshold | `1920` | If hours exceed this, split into multiple positions |
| **`rates`** | **Pricing calculation rates** | Object | **Used for FBLR calculations** |
| `├─ fringe` | Fringe benefits rate | `0.247` | 24.7% |
| `├─ oh` | Overhead rate | `0.0711` | 7.11% |
| `├─ ga` | G&A rate | `0.2243` | 22.43% |
| `├─ fee` | Prime labor fee | `0.07` | 7% |
| `├─ smh` | S&MH rate | `0.065` | 6.5% |
| `├─ sub_fee` | Subcontractor fee | `0.0` | 0% default; override per proposal |
| `└─ ga_passthrough` | G&A on subs | `0.025` | 2.5% |
| **`escalation_rates`** | **Year-over-year increases** | Object | **Wage inflation rates** |
| `├─ 1_to_2` | Year 1 to Year 2 increase | `0.0272` | 2.72% wage increase |
| `├─ 2_to_3` | Year 2 to Year 3 increase | `0.0299` | 2.99% wage increase |
| `└─ ...` | Additional years | `0.0263`, `0.0340`, etc. | Up to 10 years supported |
| **`metadata`** | **Proposal summary info** | Object | **Quick stats** |
| `├─ total_jobs` | Number of positions | `12` | Count of jobs array |
| `├─ base_years` | Number of base years | `1` | Typically 1 year |
| `├─ option_years` | Number of option years | `4` | Optional extension years |
| `├─ total_years` | Total contract years | `5` | base_years + option_years |
| `└─ fte_hours_threshold` | FTE split threshold | `1920` | Split positions above this |
| `months_per_year` | Months per contract year | `{"1": 12, "2": 8, "3": 12}` | Some years may be partial (8 months instead of 12) |
| `spreadsheet_data` | Full pricing workspace state | Huge object | **Complete state of pricing grid** (positions, subs, ODCs, all calculations) |
| `total_cost` | Grand total cost | `$10,869,012.34` | Sum of all years, all costs |

#### Core Logic: Document Upload → Job Extraction

**The Full Flow:**

```
1. User uploads PDF
   ↓
2. Backend saves to iDrive e2 S3 storage
   ├─ Gets pre-signed URL (expires in 7 days)
   ├─ Stores URL in documents array
   ↓
3. Background processing starts
   ├─ Status = "processing", Progress = 0%
   ├─ Message = "Parsing PDF..."
   ↓
4. LlamaExtract API extracts text from PDF
   ├─ Finds: "Program Manager, 10 years, Virginia, 1880 hours"
   ├─ Finds: "Software Developer, 5 years, California, 2080 hours"
   ├─ Progress = 20%
   ↓
5. GPT-4 structures the data
   ├─ Converts text → JSON with labor_category, experience, location, hours
   ├─ Progress = 40%
   ↓
6. FAISS Vector Search finds matching SOC codes
   ├─ "Program Manager" → SOC code "11-3021"
   ├─ "Software Developer" → SOC code "15-1252"
   ├─ Progress = 60%
   ↓
7. MongoDB wage_data lookup
   ├─ Query: SOC "11-3021", Area "Virginia", All percentiles
   ├─ Gets: 10th=$85k, 25th=$105k, 50th=$125k, 75th=$145k, 90th=$165k
   ├─ Progress = 80%
   ↓
8. Auto-select wage based on experience
   ├─ < 3 years → 25th percentile
   ├─ 3 to < 6 years → 50th percentile
   ├─ ≥ 6 years → 75th percentile
   ├─ Progress = 90%
   ↓
9. Split positions if hours > 1920 (FTE threshold)
   ├─ Position with 5760 hours → Split into 3 positions of 1920 hours each
   ├─ Progress = 95%
   ↓
10. Save all jobs to proposal.jobs array
    ├─ Status = "completed", Progress = 100%
    ├─ Message = "Processing complete. Found 12 positions."
```

#### Core Logic: Excel Download Tracking

**Problem:** Need to distinguish between:
- **"In Progress"** = User is still working on it
- **"Submitted"** = User downloaded Excel and submitted to client

**Solution:** `excel_downloaded` boolean flag

```python
# When user clicks "Download Excel"
@router.post("/excel/generate")
def generate_excel(proposal_id):
    # Generate Excel file
    excel_file = create_excel(proposal)

    # Mark as downloaded
    db.proposals.update_one(
        {"_id": proposal_id},
        {"$set": {"excel_downloaded": True}}
    )

    return excel_file

# In frontend dashboard
if proposal.status == "completed":
    if proposal.excel_downloaded:
        badge = "Submitted"  # Downloaded = submitted to client
    else:
        badge = "In Progress"  # Not downloaded yet = still working
```

#### Indexes (Critical for Performance)

```javascript
// Get user's proposals (newest first) - FAST
db.proposals.createIndex({
  "user_id": 1,
  "created_at": -1
})

// Get all proposals in organization - FAST
db.proposals.createIndex({
  "organization_id": 1,
  "created_at": -1
})

// Find shared proposals - FAST
db.proposals.createIndex({ "shared_with": 1 })

// Filter by status - FAST
db.proposals.createIndex({
  "user_id": 1,
  "status": 1,
  "created_at": -1
})
```

---

### 4. INVITATIONS Collection

**What it stores:** Email invitations to join organizations

**Why it exists:** Admins need to invite new users to their organization. This tracks all invitations.

#### Fields Explained

| Field Name | What It Is | Example | Why We Need It |
|------------|------------|---------|----------------|
| `_id` | Unique invitation ID | `ObjectId("507f...")` | Primary identifier |
| `organization_id` | Which org is inviting | `ObjectId("org-A")` | Links to organizations collection |
| `email` | Invitee's email | `"jane@example.com"` | Where to send invitation |
| `role` | Role being offered | `"admin"` or `"user"` | What permissions they'll have |
| `invited_by` | Who sent the invite | `"user-123"` (UUID) | Links to users collection |
| `invited_by_name` | Inviter's full name | `"John Doe"` | Display in email: "John Doe invited you..." |
| `organization_name` | Org name | `"Acme Corp"` | Display in email: "...to join Acme Corp" |
| `token_hash` | SHA-256 hashed token | `"a7ffc6f8bf1ed76651..."` | **SECURITY**: Never store plain token |
| `status` | Invitation status | `"pending"`, `"accepted"`, `"expired"`, `"revoked"` | Track invitation lifecycle |
| `created_at` | When invitation sent | `ISODate("2025-12-15...")` | Timestamp |
| `expires_at` | When invitation expires | `ISODate("2025-12-22...")` | **7 days** from creation |
| `accepted_at` | When user accepted | `ISODate("2025-12-16...")` | null if not accepted yet |
| `accepted_by` | Who accepted (if existing user) | `"user-456"` (UUID) | Links to users collection |
| `revoked_at` | When admin cancelled invitation | `ISODate("2025-12-16...")` | null if not revoked |

#### Core Logic: Secure Token System

**Problem:** Invitation links sent via email can be intercepted. Need maximum security.

**Solution:** Hash tokens before storing in database

```python
# When admin sends invitation
@router.post("/invitations")
def send_invitation(email, role, admin_user):
    # Generate random token (32 bytes = 256 bits)
    plain_token = secrets.token_urlsafe(32)
    # Example: "xK3mP9qR7sL2nF4jH8wV5tC1gB6dY0zE"

    # Hash token with SHA-256 before storing
    token_hash = hashlib.sha256(plain_token.encode()).hexdigest()
    # Example: "a7ffc6f8bf1ed76651c19c6ac1e124f..."

    # Store ONLY the hash in database
    invitation = {
        "email": email,
        "token_hash": token_hash,  # Hashed version
        "status": "pending",
        "expires_at": datetime.utcnow() + timedelta(days=7)
    }
    db.invitations.insert_one(invitation)

    # Send email with PLAIN token (only time it's visible)
    email_body = f"""
    Click here to join:
    https://app.priceiq.com/invite/{plain_token}
    """
    send_email(email, email_body)

    # Plain token exists ONLY in email, never in database

# When user clicks link
@router.get("/invite/{token}")
def accept_invitation(token):
    # Hash the token from URL
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # Look up invitation by hash
    invitation = db.invitations.find_one({"token_hash": token_hash})

    if not invitation:
        return "Invalid invitation"

    if invitation["status"] != "pending":
        return "Invitation already used"

    if invitation["expires_at"] < datetime.utcnow():
        return "Invitation expired"

    # Valid! Create user account or add to existing account
    # ...
```

**Why this is secure:**
- **Attacker gets database dump**: Only sees hashed tokens (useless)
- **Attacker intercepts email**: Gets plain token, but can only use it once
- **Invitation expires**: After 7 days, token becomes invalid
- **One-time use**: After acceptance, status changes to "accepted" → can't reuse

#### Core Logic: TTL Index Auto-Cleanup

**Problem:** Expired invitations clutter the database

**Solution:** MongoDB TTL (Time-To-Live) index automatically deletes old documents

```javascript
// Create TTL index
db.invitations.createIndex(
  { "expires_at": 1 },
  { expireAfterSeconds: 2592000 }  // 30 days after expires_at
)
```

**How it works:**
- Invitation created on Dec 1 → `expires_at` = Dec 8
- User doesn't accept → invitation expires Dec 8
- MongoDB automatically deletes document on Jan 7 (30 days after expiration)
- No manual cleanup needed!

---

### 5. REFRESH_TOKENS Collection

**What it stores:** Long-lived refresh tokens for session management

**Why it exists:** Access tokens expire in 30 minutes. Refresh tokens let users stay logged in for 7 days without re-entering password.

#### Fields Explained

| Field Name | What It Is | Example | Why We Need It |
|------------|------------|---------|----------------|
| `_id` | Unique token record ID | `ObjectId("507f...")` | Primary identifier |
| `token_id` | Unique token identifier | `"uuid-abc-123"` (UUID) | Tracks individual token |
| `user_email` | Who owns this token | `"john@example.com"` | Links to user |
| `refresh_token_hash` | SHA-256 hashed token | `"b8ffc7g9ch2fe87762..."` | **SECURITY**: Never store plain JWT |
| `token_family_id` | Rotation chain identifier | `"uuid-family-xyz"` (UUID) | **CRITICAL**: Tracks token rotation for security |
| `expires_at` | When token expires | `ISODate("2025-12-22...")` | **7 days** from creation |
| `created_at` | Token creation time | `ISODate("2025-12-15...")` | Timestamp |
| `device_info` | User-Agent header | `"Mozilla/5.0 (Macintosh..."` | Track which device |
| `ip_address` | Client IP | `"192.168.1.100"` | Security audit |
| `is_revoked` | Is token invalidated? | `false` | true = logout or security breach |
| `revoked_at` | When token was revoked | `ISODate("2025-12-16...")` | null if not revoked |

#### Core Logic: Token Rotation (Security Feature)

**Problem:** If refresh token is stolen, attacker can stay logged in forever.

**Solution:** Rotate refresh tokens on every use. Detect reuse (indicates theft).

```python
# Initial login
@router.post("/login")
def login(email, password):
    # Verify password...

    # Create NEW token family
    family_id = str(uuid.uuid4())  # Brand new family

    # Create access token (short-lived: 30 min)
    access_token = create_jwt(email, expires_in=30 * 60)

    # Create refresh token (long-lived: 7 days)
    refresh_token = create_jwt(email, family_id, expires_in=7 * 24 * 60 * 60)

    # Hash and store
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    db.refresh_tokens.insert_one({
        "token_id": str(uuid.uuid4()),
        "user_email": email,
        "refresh_token_hash": token_hash,
        "token_family_id": family_id,  # Track this family
        "expires_at": datetime.utcnow() + timedelta(days=7),
        "is_revoked": False
    })

    return {
        "access_token": access_token,  # 30 min
        "refresh_token": refresh_token  # 7 days
    }

# Refresh access token (happens every 30 minutes)
@router.post("/refresh")
def refresh_token(old_refresh_token):
    # Hash the token
    token_hash = hashlib.sha256(old_refresh_token.encode()).hexdigest()

    # Look up token in database
    token_record = db.refresh_tokens.find_one({"refresh_token_hash": token_hash})

    if not token_record:
        return 401, "Invalid token"

    if token_record["is_revoked"]:
        # SECURITY ALERT: Revoked token used!
        # This might be an attacker with a stolen token
        # Revoke ENTIRE token family
        db.refresh_tokens.update_many(
            {"token_family_id": token_record["token_family_id"]},
            {"$set": {"is_revoked": True, "revoked_at": datetime.utcnow()}}
        )
        return 401, "Token reused. All sessions invalidated for security."

    # Valid token, proceed with rotation

    # 1. Revoke OLD token (one-time use)
    db.refresh_tokens.update_one(
        {"_id": token_record["_id"]},
        {"$set": {"is_revoked": True, "revoked_at": datetime.utcnow()}}
    )

    # 2. Create NEW access token
    access_token = create_jwt(
        token_record["user_email"],
        expires_in=30 * 60
    )

    # 3. Create NEW refresh token (SAME family_id)
    new_refresh_token = create_jwt(
        token_record["user_email"],
        token_record["token_family_id"],  # Keep same family
        expires_in=7 * 24 * 60 * 60
    )

    # 4. Store new refresh token
    new_hash = hashlib.sha256(new_refresh_token.encode()).hexdigest()
    db.refresh_tokens.insert_one({
        "token_id": str(uuid.uuid4()),
        "user_email": token_record["user_email"],
        "refresh_token_hash": new_hash,
        "token_family_id": token_record["token_family_id"],  # SAME family
        "expires_at": datetime.utcnow() + timedelta(days=7),
        "is_revoked": False
    })

    return {
        "access_token": access_token,      # New 30-min token
        "refresh_token": new_refresh_token  # New 7-day token
    }
```

**Security Scenario: Token Theft Detection**

```
Timeline:
1. User logs in on their laptop
   ├─ Creates family_id = "family-ABC"
   ├─ Gets refresh_token_1

2. User refreshes token (normal use)
   ├─ refresh_token_1 is revoked (one-time use)
   ├─ refresh_token_2 is created (same family-ABC)

3. ATTACKER steals refresh_token_1 from network

4. Attacker tries to use stolen refresh_token_1
   ├─ System finds it's revoked
   ├─ ALARM: Someone used a revoked token!
   ├─ System revokes ALL tokens in family-ABC
   ├─ User AND attacker are logged out

5. User gets error: "Session invalidated for security"
   ├─ User logs in again
   ├─ Creates NEW family_id = "family-XYZ"
   ├─ Attacker's stolen token is useless
```

**Why this works:**
- Normal refresh: Token rotates, family stays same
- Token reused: Indicates theft, nuke entire family
- User forced to re-login: Creates new family
- Attacker can't get back in

---

### 6. OCCUPATIONS Collection

**What it stores:** BLS Standard Occupational Classification (SOC) codes

**Why it exists:** Need to match job descriptions (like "Program Manager") to official BLS occupation codes (like "11-3021") to look up wages.

#### Fields Explained

| Field Name | What It Is | Example | Why We Need It |
|------------|------------|---------|----------------|
| `_id` | Document ID | `ObjectId("507f...")` | Primary identifier |
| `occupation_code` | SOC code (no hyphen) | `"113021"` | Standard format: "11-3021" stored as "113021" |
| `occupation_name` | Official BLS title | `"Computer and Information Systems Managers"` | What BLS calls this job |
| `occupation_description` | What the job does | `"Plan, direct, or coordinate activities in such fields as electronic data processing..."` | Full BLS description |

#### Core Logic: Vector Search for Job Matching

**Problem:** User uploads PDF with "Program Manager, Senior" but BLS calls it "Computer and Information Systems Managers". How do we match them?

**Solution:** FAISS Vector Search

```python
# Step 1: Create embeddings for all BLS occupations (one-time setup)
occupations = db.occupations.find()  # ~1,100 occupations

embeddings = []
for occ in occupations:
    # Convert text to vector using OpenAI embeddings
    text = f"{occ['occupation_name']} {occ['occupation_description']}"
    vector = openai.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    embeddings.append(vector.data[0].embedding)

# Store in FAISS index (ultra-fast similarity search)
index = faiss.IndexFlatL2(1536)  # 1536 dimensions
index.add(np.array(embeddings))
faiss.write_index(index, "soc_faiss_index.bin")

# Step 2: When user uploads "Program Manager"
query = "Program Manager, Senior, 10 years experience"
query_vector = openai.embeddings.create(
    model="text-embedding-3-small",
    input=query
)

# Search FAISS index for closest match
distances, indices = index.search(query_vector, k=1)  # Top 1 match
best_match_index = indices[0][0]

# Get the SOC code
matched_occupation = occupations[best_match_index]
soc_code = matched_occupation["occupation_code"]  # "113021"
soc_title = matched_occupation["occupation_name"]  # "Computer and Information Systems Managers"
```

**Why FAISS is fast:**
- Without FAISS: Compare query to 1,100 occupations one by one = SLOW
- With FAISS: Find nearest neighbor in milliseconds using approximate search

#### Data Source

- **BLS OEWS Database** (Occupational Employment and Wage Statistics)
- **~1,100 occupations** covering entire US labor market
- **Updated annually** by Bureau of Labor Statistics
- **Import command:** `uv run python scripts/import_oews_to_mongo.py`

---

### 7. AREAS Collection

**What it stores:** Geographic areas for wage lookups

**Why it exists:** Wages vary by location. Software developer in San Francisco earns more than in rural Kansas. Need area codes to look up location-specific wages.

#### Fields Explained

| Field Name | What It Is | Example | Why We Need It |
|------------|------------|---------|----------------|
| `_id` | Document ID | `ObjectId("507f...")` | Primary identifier |
| `area_code` | BLS area code (7 digits) | `"0000000"` or `"0600000"` or `"4188080"` | Unique identifier for geographic area |
| `area_name` | Human-readable name | `"National"` or `"California"` or `"San Francisco-Oakland-Berkeley, CA Metropolitan Division"` | Display to user |

#### Core Logic: Area Code Hierarchy

**BLS uses a hierarchical system:**

```
National (0000000)
 ├─ California (0600000)
 │   ├─ San Francisco-Oakland-Berkeley Metro (4188080)
 │   ├─ Los Angeles Metro (3174000)
 │   └─ San Diego Metro (4186200)
 ├─ New York (3600000)
 │   ├─ New York City Metro (3563000)
 │   └─ Buffalo Metro (1594600)
 └─ Texas (4800000)
     ├─ Dallas Metro (1923600)
     └─ Houston Metro (2635400)
```

**Area Code Format:**

| Prefix | Type | Example | Description |
|--------|------|---------|-------------|
| `0000000` | National | `0000000` | US average wage |
| `XX00000` | State | `0600000` | California statewide |
| `XXXXXXX` | Metro/City | `4188080` | San Francisco metro area |

**Wage Lookup Logic:**

```python
def get_wage(soc_code, location_name, percentile):
    # User enters "San Francisco"
    # Search areas collection
    area = db.areas.find_one({
        "$text": {"$search": location_name}
    })
    # Finds: area_code = "4188080", area_name = "San Francisco-Oakland-Berkeley, CA"

    # Build BLS series ID
    series_id = build_series_id(
        area_code="4188080",
        soc_code="113021",  # Computer Managers
        percentile="14"  # 75th percentile
    )
    # Result: "OEUM418808000000011302114"

    # Look up wage
    wage_record = db.wage_data.find_one({"series_id": series_id})

    if not wage_record:
        # No data for San Francisco, fall back to California
        state_area_code = "0600000"
        series_id = build_series_id(state_area_code, soc_code, percentile)
        wage_record = db.wage_data.find_one({"series_id": series_id})

    if not wage_record:
        # No data for California, fall back to National
        national_area_code = "0000000"
        series_id = build_series_id(national_area_code, soc_code, percentile)
        wage_record = db.wage_data.find_one({"series_id": series_id})

    return wage_record["value"]  # Annual wage
```

**Fallback Chain:**
1. Try Metro area (San Francisco) → if no data
2. Try State (California) → if no data
3. Use National average

---

### 8. WAGE_DATA Collection

**What it stores:** 6+ million wage records from BLS OEWS

**Why it exists:** The core wage data. Every lookup ends here.

#### Fields Explained

| Field Name | What It Is | Example | Why We Need It |
|------------|------------|---------|----------------|
| `_id` | Document ID | `ObjectId("507f...")` | Primary identifier |
| `series_id` | BLS series identifier (25 characters) | `"OEUN000000000000011302114"` | Unique combination of area + occupation + percentile |
| `value` | Annual wage in dollars | `$145,000` | The actual wage data |

#### Core Logic: Series ID Format (This is Complex but Important)

**Series ID Structure (25 characters total):**

```
OEUN 0000000 000000 0113021 14
 │    │       │      │       │
 │    │       │      │       └─ Datatype (percentile)
 │    │       │      └───────── SOC code (7 digits)
 │    │       └──────────────── Industry (6 digits, always 000000 for all industries)
 │    └──────────────────────── Area code (7 digits)
 └───────────────────────────── Prefix (4 chars: OEUN/OEUS/OEUM)
```

**Prefix Meanings:**
- `OEUN` = National data
- `OEUS` = State data
- `OEUM` = Metro area data

**Datatype Codes (Percentiles):**
- `11` = 10th percentile (entry-level wage)
- `12` = 25th percentile (below-average wage)
- `13` = 50th percentile (median/middle wage)
- `14` = 75th percentile (above-average wage)
- `15` = 90th percentile (expert-level wage)

**Example: Look up 75th percentile wage for Computer Managers in San Francisco**

```python
# Build series ID
prefix = "OEUM"  # Metro area
area = "4188080"  # San Francisco metro
industry = "000000"  # All industries
soc = "0113021"  # Computer Managers (padded to 7 digits)
percentile = "14"  # 75th percentile

series_id = f"{prefix}{area}{industry}{soc}{percentile}"
# Result: "OEUM418808000000011302114"

# Look up wage
wage = db.wage_data.find_one({"series_id": series_id})
print(wage["value"])  # $145,000
```

**Why this format?**
- BLS uses this standard format across all their data
- Allows efficient lookup without complex queries
- Single index on series_id makes lookups instant

#### Data Size and Performance

- **6+ million records** in this collection
- **330MB compressed download** from BLS
- **~1GB in MongoDB** after import
- **Index on series_id**: Makes lookups O(1) constant time
- **Import time**: ~5-10 minutes one-time

**Query Performance:**
```python
# Without index: Scans 6 million records = 10+ seconds
# With index: Direct lookup = < 10 milliseconds
```

---

### 9. TOKEN_BLACKLIST Collection

**What it stores:** Revoked JWT access tokens (for logout)

**Why it exists:** JWTs are stateless (can't be "deleted"). Need a blacklist to mark tokens as invalid.

#### Fields Explained

| Field Name | What It Is | Example | Why We Need It |
|------------|------------|---------|----------|
| `_id` | Document ID | `ObjectId("507f...")` | Primary identifier |
| `user_email` | Who this token belongs to | `"john@example.com"` | Identify user |
| `token` | Full JWT token | `"eyJhbGciOiJIUzI1NiIs..."` | The actual JWT string |
| `blacklisted_at` | When user logged out | `ISODate("2025-12-15...")` | Timestamp |
| `expires_at` | Token's original expiration | `ISODate("2025-12-15T11:00...")` | When token would have expired naturally |

#### Core Logic: Logout Implementation

**Problem:** JWTs are self-contained. Can't "delete" them from client. Server must reject revoked tokens.

**Solution:** On every authenticated request, check blacklist

```python
# Logout endpoint
@router.post("/logout")
def logout(current_token: str):
    # Decode token to get expiration
    payload = jwt.decode(current_token, SECRET_KEY)
    exp = payload["exp"]  # Unix timestamp

    # Add to blacklist
    db.token_blacklist.insert_one({
        "user_email": payload["email"],
        "token": current_token,
        "blacklisted_at": datetime.utcnow(),
        "expires_at": datetime.fromtimestamp(exp)
    })

    return {"message": "Logged out successfully"}

# On every protected endpoint
@router.get("/protected-endpoint")
def protected_route(token: str = Depends(oauth2_scheme)):
    # Check if token is blacklisted
    blacklisted = db.token_blacklist.find_one({"token": token})

    if blacklisted:
        raise HTTPException(401, "Token has been revoked")

    # Proceed with request
    # ...
```

#### TTL Index for Automatic Cleanup

**Problem:** Blacklisted tokens accumulate forever (waste space)

**Solution:** MongoDB automatically deletes expired tokens

```javascript
// Create TTL index
db.token_blacklist.createIndex(
  { "expires_at": 1 },
  { expireAfterSeconds: 0 }  // Delete immediately after expires_at
)
```

**How it works:**
- Token blacklisted at 10:00 AM, `expires_at` = 10:30 AM
- Token was going to expire at 10:30 AM anyway
- At 10:30 AM, MongoDB automatically deletes the blacklist record
- No manual cleanup needed

**Why this is efficient:**
- Only need to store blacklisted tokens for their remaining lifetime
- Tokens naturally expire in 30 minutes
- Database stays small

---

## How Data Flows Between Collections

### Complete User Journey Example

Let's follow a complete workflow from signup to Excel export:

```
Step 1: USER SIGNUP
├─ User signs up with email/password
├─ Record created in USERS collection
│   ├─ _id: "user-123"
│   ├─ email: "john@example.com"
│   ├─ password: "$2b$12$..." (hashed)
│   └─ auth_method: "email"
├─ Personal organization created in ORGANIZATIONS collection
│   ├─ _id: ObjectId("org-ABC")
│   ├─ name: "john-doe-org"
│   ├─ owner_id: "user-123"
│   └─ settings: {default_rates: {...}}
├─ User record updated with organization
    └─ organizations: [{organization_id: ObjectId("org-ABC"), role: "admin"}]

Step 2: UPLOAD DOCUMENT
├─ User uploads "Navy_Contract.pdf"
├─ File saved to iDrive e2 S3 storage
├─ Record created in PROPOSALS collection
    ├─ _id: ObjectId("prop-XYZ")
    ├─ user_id: "user-123"
    ├─ organization_id: ObjectId("org-ABC")
    ├─ status: "processing"
    └─ documents: [{
        filename: "Navy_Contract.pdf",
        idrive_url: "https://s3...",
        file_size: 245632
    }]

Step 3: BACKGROUND PROCESSING
├─ LlamaExtract parses PDF
├─ Finds: "Program Manager, 10 years, Virginia"
├─ FAISS searches OCCUPATIONS collection
│   ├─ Query: "Program Manager"
│   └─ Finds: soc_code="113021", soc_title="Computer Managers"
├─ Searches AREAS collection
│   ├─ Query: "Virginia"
│   └─ Finds: area_code="5100000"
├─ Builds series IDs for all percentiles
│   ├─ 25th: "OEUS510000000000011302112"
│   ├─ 50th: "OEUS510000000000011302113"
│   └─ 75th: "OEUS510000000000011302114"
├─ Looks up wages in WAGE_DATA collection
│   ├─ 25th: $105,000
│   ├─ 50th: $125,000
│   └─ 75th: $145,000
├─ Auto-selects 75th percentile (10 years exp = senior)
└─ Updates PROPOSALS collection
    ├─ status: "completed"
    ├─ jobs: [{
    │   labor_category: "Program Manager",
    │   soc_code: "113021",
    │   soc_title: "Computer and Information Systems Managers",
    │   experience: 10,
    │   selected_wage: 145000,
    │   wage_75th: 145000,
    │   hours_per_year: {"1": 1880, "2": 1880}
    │ }]
    └─ rates: {fringe: 0.247, oh: 0.0711, ...}  (from organization defaults)

Step 4: USER EDITS RATES
├─ User changes fringe rate from 24.7% to 25%
├─ PROPOSALS collection updated
    └─ rates.fringe: 0.25

Step 5: DOWNLOAD EXCEL
├─ User clicks "Download Excel"
├─ Backend generates XLSX file with all calculations
├─ PROPOSALS collection updated
    └─ excel_downloaded: true
└─ Frontend now shows badge: "Submitted" (instead of "In Progress")

Step 6: INVITE TEAM MEMBER
├─ Admin invites "jane@example.com"
├─ Record created in INVITATIONS collection
│   ├─ email: "jane@example.com"
│   ├─ organization_id: ObjectId("org-ABC")
│   ├─ role: "user"
│   ├─ token_hash: "a7ffc6f8..." (hashed)
│   └─ expires_at: 7 days from now
├─ Email sent with invitation link
└─ Jane clicks link, account created, added to organization

Step 7: LOGOUT
├─ User logs out
├─ Access token added to TOKEN_BLACKLIST collection
├─ Refresh token marked as revoked in REFRESH_TOKENS collection
└─ User redirected to login page
```

---

## Security and Access Control

### Multi-Tenancy Isolation (CRITICAL)

**Every API query MUST filter by `organization_id`:**

```python
# BAD - Security vulnerability! User could access other org's data
proposals = db.proposals.find({"user_id": user_id})

# GOOD - Properly isolated
proposals = db.proposals.find({
    "user_id": user_id,
    "organization_id": user["organization_id"]  # REQUIRED
})
```

**Why this matters:**
- User switches from Org A to Org B
- Without filtering: User sees Org A's proposals (DATA LEAK)
- With filtering: User only sees Org B's proposals (SECURE)

### Role-Based Access Control (RBAC)

**Two roles:**
1. **Admin**: Full control over organization
   - Can see ALL proposals in organization
   - Can invite/remove users
   - Can change organization settings
   - Can share proposals with team

2. **User**: Limited access
   - Can see only OWN proposals + shared proposals
   - Cannot invite users
   - Cannot change organization settings
   - Cannot share proposals

**Implementation:**

```python
def get_user_proposals(user_id, org_id, role):
    if role == "admin":
        # Admins see ALL proposals in organization
        query = {"organization_id": org_id}
    else:
        # Users see own proposals + shared proposals
        query = {
            "organization_id": org_id,
            "$or": [
                {"user_id": user_id},  # Own proposals
                {"shared_with": user_id}  # Shared with me
            ]
        }

    return db.proposals.find(query)
```

### Password Security

**Never store plain passwords:**

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Signup
def create_user(email, password):
    hashed = pwd_context.hash(password)
    # Result: "$2b$12$KIXzq2rE5dP3..."

    db.users.insert_one({
        "email": email,
        "password": hashed  # Hashed, not plain
    })

# Login
def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)
    # True if correct, False if wrong
```

**Why bcrypt:**
- **Adaptive**: Can increase computation cost as hardware improves
- **Salted**: Each password gets unique salt (prevents rainbow tables)
- **Slow**: Intentionally slow (~100ms) to prevent brute force
- **Irreversible**: Cannot convert hash back to password

### Token Security

**Three types of tokens, three security levels:**

1. **Invitation Tokens** (SHA-256 hash)
   - Sent in email (one-time use)
   - Hashed before storing
   - Expires in 7 days

2. **Refresh Tokens** (SHA-256 hash + rotation)
   - Long-lived (7 days)
   - Hashed before storing
   - Rotates on every use
   - Detects theft via reuse detection

3. **Access Tokens** (JWT, not stored)
   - Short-lived (30 minutes)
   - Self-contained (no database lookup needed)
   - Blacklisted on logout

---

## Performance Tips

### Indexing Strategy

**Rule: Index fields you query frequently**

```javascript
// Frequent query: Get user's proposals sorted by date
db.proposals.find({user_id: "user-123"}).sort({created_at: -1})

// Index for this query:
db.proposals.createIndex({user_id: 1, created_at: -1})

// Result: Query goes from 500ms → 5ms
```

**Current indexes:**

```javascript
// USERS
db.users.createIndex({email: 1}, {unique: true})
db.users.createIndex({"organizations.organization_id": 1})

// ORGANIZATIONS
db.organizations.createIndex({slug: 1}, {unique: true})

// PROPOSALS
db.proposals.createIndex({organization_id: 1, created_at: -1})
db.proposals.createIndex({user_id: 1, created_at: -1})
db.proposals.createIndex({shared_with: 1})

// INVITATIONS
db.invitations.createIndex({token_hash: 1}, {unique: true})
db.invitations.createIndex({expires_at: 1}, {expireAfterSeconds: 2592000})

// REFRESH_TOKENS
db.refresh_tokens.createIndex({token_id: 1}, {unique: true})
db.refresh_tokens.createIndex({token_family_id: 1})

// WAGE_DATA
db.wage_data.createIndex({series_id: 1}, {unique: true})
```

### Query Optimization

**Use projection to fetch only needed fields:**

```python
# BAD - Fetches entire document (slow, wasteful)
proposal = db.proposals.find_one({"_id": proposal_id})

# GOOD - Fetches only name and status (fast)
proposal = db.proposals.find_one(
    {"_id": proposal_id},
    {"name": 1, "status": 1, "_id": 0}
)
```

### Connection Pooling

**Backend uses singleton pattern for MongoDB connections:**

```python
import threading

_mongo_client = None
_lock = threading.RLock()

def get_mongo_client():
    global _mongo_client
    with _lock:
        if _mongo_client is None:
            _mongo_client = MongoClient(MONGODB_URL)
        return _mongo_client
```

**Why this works:**
- Only creates ONE connection per process
- Thread-safe (multiple requests can share)
- Lazy initialization (connects on first use)

---

## Backup Strategy

### Critical Collections (Must Backup)

1. **users** - User accounts (cannot be regenerated)
2. **organizations** - Company settings (cannot be regenerated)
3. **proposals** - User's work (MOST IMPORTANT, cannot be regenerated)
4. **invitations** - Pending invites (important for onboarding)

### Regenerable Collections (Optional Backup)

1. **occupations** - Can re-import from BLS
2. **areas** - Can re-import from BLS
3. **wage_data** - Can re-import from BLS (6M records, large)
4. **refresh_tokens** - Users can re-login
5. **token_blacklist** - Tokens expire anyway

### Backup Commands

```bash
# Full backup
mongodump --uri="$MONGODB_URL" --out=./backup-$(date +%Y%m%d)

# Backup only critical collections
mongodump --uri="$MONGODB_URL" --collection=users --out=./backup
mongodump --uri="$MONGODB_URL" --collection=organizations --out=./backup
mongodump --uri="$MONGODB_URL" --collection=proposals --out=./backup

# Restore
mongorestore --uri="$MONGODB_URL" ./backup
```

### Backup Schedule (Recommended)

- **Daily**: proposals (users' work)
- **Weekly**: users, organizations
- **Monthly**: Full backup including BLS data

---

## Common Operations

### How to Add a User to Organization

```python
# 1. Admin sends invitation
invitation = {
    "email": "newuser@example.com",
    "organization_id": ObjectId("org-ABC"),
    "role": "user",
    "token_hash": hashlib.sha256(token.encode()).hexdigest(),
    "expires_at": datetime.utcnow() + timedelta(days=7)
}
db.invitations.insert_one(invitation)

# 2. User accepts invitation
# If new user:
user = {
    "_id": str(uuid.uuid4()),
    "email": "newuser@example.com",
    "organizations": [{
        "organization_id": ObjectId("org-ABC"),
        "role": "user",
        "status": "active"
    }]
}
db.users.insert_one(user)

# If existing user:
db.users.update_one(
    {"email": "newuser@example.com"},
    {"$push": {"organizations": {
        "organization_id": ObjectId("org-ABC"),
        "role": "user",
        "status": "active"
    }}}
)
```

### How to Share a Proposal

```python
# Admin shares proposal with 2 users
db.proposals.update_one(
    {"_id": ObjectId("prop-XYZ")},
    {
        "$set": {
            "visibility": "shared",
            "shared_with": ["user-456", "user-789"]
        }
    }
)

# Now user-456 and user-789 can access this proposal
```

### How to Switch Organizations

```python
# User switches from Org A to Org B
db.users.update_one(
    {"_id": "user-123"},
    {"$set": {"current_organization_id": ObjectId("org-B")}}
)

# All subsequent API calls now filter by org-B
```

---

## Troubleshooting

### "No wage data found"

**Problem:** Query returns no wage data

**Possible causes:**
1. Missing BLS data → Run import script
2. Wrong area code → Check areas collection
3. Wrong SOC code → Check occupations collection
4. Data suppressed by BLS → Fall back to national

**Solution:**
```python
# Check if wage_data has records
count = db.wage_data.count_documents({})
print(f"Wage records: {count}")  # Should be 6+ million

# If zero, import data
# bash: uv run python scripts/import_oews_to_mongo.py
```

### "Slow queries"

**Problem:** API responses take 2+ seconds

**Solution:** Check if indexes exist
```python
# List indexes
indexes = db.proposals.list_indexes()
for index in indexes:
    print(index)

# If missing, create indexes
# bash: uv run python scripts/create_indexes.py
```

### "User can see other org's data"

**Problem:** Data leaking between organizations

**Solution:** Ensure ALL queries filter by organization_id
```python
# Find the buggy query (missing organization_id filter)
# Add organization_id to query filter
query = {
    "user_id": user_id,
    "organization_id": user["organization_id"]  # ADD THIS
}
```

---

## Summary

This database schema implements:

✅ **Multi-tenancy** via organizations
✅ **RBAC** with admin/user roles
✅ **Secure authentication** with JWT + refresh tokens
✅ **BLS wage data** with 6M+ records
✅ **Document processing** with async uploads
✅ **Proposal sharing** within organizations
✅ **Token security** with hashing and rotation
✅ **Automatic cleanup** with TTL indexes
✅ **Fast queries** with proper indexes
✅ **Data isolation** with organization_id filtering

All collections work together to provide a secure, scalable government contracting pricing platform.
