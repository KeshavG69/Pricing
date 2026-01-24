# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PriceIQ is a full-stack government contractor pricing automation platform with:
- **Backend**: FastAPI server that extracts job descriptions from documents, matches them to SOC codes using FAISS vector search, and retrieves wage data from BLS OEWS database (6M+ records)
- **Frontend**: Next.js 16 application with Excel-like pricing workspace using react-data-grid
- **Multi-tenant**: Organization-based system with role-based access control (admin/user)
- **Real-time**: Automatic calculation and MongoDB persistence with debounced auto-save

## Development Commands

### Backend (FastAPI + Python 3.13)

```bash
# Navigate to backend
cd backend

# Install dependencies (uses uv package manager)
uv sync

# Setup MongoDB data (one-time, takes ~5-10 min)
uv run python scripts/setup_oews_data.py        # Downloads BLS data (~330MB)
uv run python scripts/import_oews_to_mongo.py   # Imports to MongoDB

# Run development server (with auto-reload)
uv run uvicorn app.server:app --reload --port 8000

# Run production server (multiple workers)
uv run uvicorn app.server:app --host 0.0.0.0 --port 8000 --workers 4

# Create database indexes
uv run python scripts/create_indexes.py

# Migrate to organization system (if needed)
uv run python -m scripts.migrate_to_organizations
```

**API Documentation**:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Health check: http://localhost:8000/health

### Frontend (Next.js 16 + React 19)

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production server
npm start

# Run linter
npm run lint
```

Frontend runs at: http://localhost:3000

## Architecture

### Backend Architecture

**Document Processing Pipeline**:
```
Upload → Parse (LlamaExtract + GPT-4) → Agent Processing (10 parallel)
  → Vector Search (FAISS) → Wage Lookup (MongoDB) → Return JSON
```

**Key Backend Files**:
- `backend/app/server.py` - FastAPI app initialization, CORS, routers
- `backend/routers/` - API endpoints (pricing, proposals, organizations, invitations, auth, billing, help_center, company_repository, excel_export, terms, stripe_webhooks)
- `backend/client/` - External services (LlamaExtract, FAISS, MongoDB, OpenAI, Stripe, Pinecone, iDrive)
  - `intelligent_parser.py` - AI agent with reasoning and web search for contract analysis
  - `gsa_parser.py` - Specialized parser for GSA contract documents (RTF, DOCX, XLSX, PDF)
  - `calculation_service.py` - FBLR calculation engine (static methods)
  - `excel_generator.py` - Excel export with formulas and formatting
  - `email_service.py` - SMTP email service for invitations
  - `stripe_client.py` - Stripe payment integration
- `backend/agent/` - Agno-based agents (pricing, help center)
- `backend/utils/` - CRUD operations (proposals, organizations, invitations, billing)
- `backend/auth/` - JWT authentication, RBAC, user management
- `backend/scripts/` - Data setup and migration scripts

**Database Collections** (MongoDB):
- `users` - User accounts (email, password, organization_id, role, email_verified, account_deletion_requested_at)
- `organizations` - Multi-tenant workspaces (settings, subscription, owner_id, stripe_customer_id)
- `proposals` - Pricing proposals (jobs, rates, organization_id, shared_with)
- `invitations` - Email invitations (token_hash, organization_id, expires_at)
- `occupations` - SOC codes (~1,100, cached in FAISS)
- `areas` - Geographic areas (~700)
- `wage_data` - BLS OEWS data (6M+ wage records)
- `token_blacklist` - Invalidated JWTs
- `charges` - Billing records (Stripe payment intents, proposal_id, amount)
- `help_center_articles` - Support documentation (indexed in Pinecone)
- `company_repositories` - Organization-specific GSA contracts and labor categories
- `terms_acceptances` - Terms of service acceptance tracking

### Frontend Architecture

**State Management** (Zustand):
- `frontend/lib/stores/pricingStore.ts` - Core pricing workspace state (positions, subcontractors, ODCs, rates)
- `frontend/lib/stores/proposalsStore.ts` - Proposals list, upload, delete
- `frontend/lib/stores/authStore.ts` - User authentication, organization context, email verification
- `frontend/lib/stores/organizationStore.ts` - Organization settings, members
- `frontend/lib/stores/billingStore.ts` - Stripe payment methods, charges, billing history
- `frontend/lib/stores/companyRepositoryStore.ts` - Organization GSA contracts and labor categories
- `frontend/lib/stores/helpCenterStore.ts` - Help articles, search, AI chat
- `frontend/lib/stores/onboardingStore.ts` - User onboarding tasks and progress
- `frontend/lib/stores/accountDeletionStore.ts` - Account deletion requests
- `frontend/lib/stores/organizationDeletionStore.ts` - Organization deletion requests

**Key Frontend Files**:
- `frontend/app/` - Next.js 16 App Router pages (auth, dashboard, pricing, proposals, settings, billing, help, terms)
- `frontend/components/pricing/` - Excel-like pricing workspace
  - `PricingWorkspace.tsx` - Main container with tabbed interface
  - `PositionsGrid.tsx` - Basic mode positions table (react-data-grid)
  - `sections/PrimeLaborSection.tsx` - Advanced mode with FBLR breakdown
  - `sections/SubcontractorSection.tsx` - Subcontractor labor table
  - `sections/ODCSection.tsx` - Other Direct Costs table
  - `sections/PassthroughSection.tsx` - Prime contractor passthrough calculations
- `frontend/components/layout/` - DashboardLayout, navigation
- `frontend/components/workspace/` - WorkspaceSwitcher (organization switching)
- `frontend/components/billing/` - Stripe payment UI (PaymentMethodForm, BillingHistory)
- `frontend/components/help/` - Help center with AI chat, article search
- `frontend/components/onboarding/` - User onboarding checklist and tours
- `frontend/components/terms/` - Terms of service viewer and acceptance
- `frontend/components/settings/` - Organization settings, user management, account deletion

**Pricing Workspace Modes**:
- **Basic Mode**: Simple positions table with labor category, hours, rates
- **Advanced Mode**: Expandable rows showing FBLR breakdown (Direct Labor → Fringe → OH → G&A → Fee)

## Document Parsing Methods

PriceIQ supports multiple document parsing approaches, each optimized for different scenarios:

### 1. Intelligent Parser (Default)
**File**: `backend/client/intelligent_parser.py`

Uses Agno agent with Claude/GPT-4 + reasoning + web search:
- **Best for**: Complex contracts with narrative descriptions
- **Supports**: PDF, DOCX, XLSX, XLS, TXT, CSV
- **Features**:
  - Reads and understands entire contract context
  - Reasons about staffing patterns and evolution
  - Uses web search only when document lacks data
  - Extracts year-specific staffing intelligently
- **Usage**: Default parser for `/api/pricing/process` endpoint

### 2. GSA Contract Parser
**File**: `backend/client/gsa_parser.py`

Specialized parser for GSA Schedule contracts:
- **Best for**: GSA rate cards with structured tables
- **Supports**: RTF, DOCX, XLSX, PDF
- **Features**:
  - Dual-parser approach (metadata + labor categories)
  - Extracts contract number, dates, company name
  - Parses SINs (Special Item Numbers)
  - Handles multi-year rate tables
  - Retry logic with model fallback (GPT-4o → Claude Sonnet)
- **Usage**: Used for company repository uploads

### 3. Legacy Job Description Parser
**File**: `backend/client/jd_parser.py`

Original LlamaExtract-based parser:
- **Best for**: Simple job description lists
- **Supports**: PDF, DOCX, XLSX
- **Features**: Fast extraction of position titles, hours, experience
- **Usage**: Fallback for simple documents

## Critical Implementation Details

### Backend: Async/Await + Background Jobs

- All document processing is **async** - use `agent.arun()` not `.run()`
- `/api/pricing/process` returns `job_id` immediately, processing happens in background
- Poll `/api/pricing/status/{job_id}` for progress (in-memory job store)
- Agent execution uses `asyncio.gather()` with semaphore (10 concurrent workers)
- MongoDB operations use thread-safe singleton pattern with `threading.RLock()`

### Backend: Multi-Tenant Security

**Organization Isolation**: Every query MUST include `organization_id` to filter data.
```python
# Bad - no isolation
proposals = db.find({"user_id": user_id})

# Good - organization-scoped
proposals = db.find({
    "user_id": user_id,
    "organization_id": user["organization_id"]
})
```

**RBAC (Role-Based Access Control)**:
- `auth/dependencies.py` - `get_current_user()` (JWT validation), `require_admin()` (role check)
- `auth/rbac.py` - `can_access_proposal()`, `can_manage_user()` functions
- Admins see all org proposals, users see own + shared proposals

**Invitation System**:
- Tokens are **hashed with SHA-256** before storage (never store plain tokens)
- Invitations expire in 7 days
- TTL index auto-deletes expired invitations after 30 days

### Frontend: Pricing Workspace State Management

**Critical State Flow**:
1. User loads proposal → `loadProposal(proposalId)` fetches from API
2. User edits cell → `updatePosition()` updates local state
3. Debounced auto-save (2 seconds) → `saveProposal()` persists to MongoDB
4. User converts to subcontractor → immediate save (bypasses debounce), invalidates cache, reloads proposal

**Advanced Mode vs Basic Mode**:
- When in **Advanced Mode**, `updatePosition()` automatically calls `performTransformToAdvanced()` to recalculate breakdowns
- Location type changes (On-Site/Off-Site toggle) trigger immediate recalculation in Advanced Mode
- Rate changes (Fringe, OH, G&A, Fee) automatically trigger `performTransformToAdvanced()` + auto-save
- Never use the `/api/pricing/recalculate` endpoint - all calculations are done frontend via transforms

**Cache Management**:
- `frontend/lib/cache/` - Browser-side caching with stale-while-revalidate
- Organization-scoped cache keys: `proposals:list:${orgId}`
- Invalidate on mutations: create, update, delete, share, workspace switch
- Background refresh on every navigation
- Focus refresh when user returns to tab (window focus listener)

**Workspace Switching**:
- Switches organization context without page reload
- Invalidates old org caches
- Prefetches new org data in parallel
- Updates URL via `router.push()` not `window.location.reload()`

### Frontend: Excel-like Pricing Grid

**react-data-grid Configuration**:
- Frozen columns: Actions (left), Total Amount (right)
- Dynamic year columns: Base Period, Option Year 1, Option Year 2, etc.
- Custom cell renderers with Tailwind styling
- Context menus for actions (three-dot menu in leftmost column)
- Editable cells use `onRowsChange` handler

**Position Splitting**:
- Positions with hours > 1920 (FTE threshold) auto-split into multiple rows
- Example: 5760 hours → 3 positions of 1920 hours each
- Applied after agent processing in `routers/pricing.py:split_position_by_hours`

**Advanced Mode Transformation**:
- `transformToAdvanced()` converts flat positions to expandable rows with FBLR breakdown
- Each position has 5 child rows: Direct Labor, Fringe, OH, G&A, Fee
- Expansion state tracked in `expandedPositions` map
- Custom row renderer shows indent for child rows

### Backend: FBLR Calculations

**Fully Burdened Labor Rate (FBLR)** cascade:
```python
# client/calculation_service.py:Calculator
DL (Direct Labor) = annual_wage / standard_fte_hours
Fringe = DL × fringe_rate
OH (Overhead) = (DL + Fringe) × oh_rate  // oh_onsite or oh_offsite based on location_type
G&A = (DL + Fringe + OH) × ga_rate
Fee = (DL + Fringe + OH + G&A) × fee_rate
FBLR = DL + Fringe + OH + G&A + Fee
```

**CRITICAL: OH Rate Selection**:
- System supports separate rates for On-Site and Off-Site positions
- Each position has a `location_type` field ('On-Site' or 'Off-Site')
- Use `oh_onsite` for On-Site positions, `oh_offsite` for Off-Site positions
- Always provide fallback: `rates.oh_onsite ?? rates.oh_offsite ?? rates.oh ?? 0.0711`
- Old `oh` field is deprecated but kept for backward compatibility

**Escalation (Year-over-Year)**:
- Compound escalation: `Year 3 rate = Year 1 rate × (1 + rate_1_to_2) × (1 + rate_2_to_3)`
- Escalation rates stored as: `{"1_to_2": 0.0272, "2_to_3": 0.0299, ...}`

**Wage Percentile Selection**:
- < 3 years experience → 25th percentile
- 3-5 years → 50th percentile (median)
- > 5 years → 75th percentile
- Logic in `utils/pipeline.py:process_single_row`

**GSA vs BLS Positions**:
- **BLS positions**: Use indirect rates (Fringe, OH, G&A, Fee) to calculate FBLR from annual wage
- **GSA positions**: Rates are ALREADY fully burdened - indirect rates are ONLY for display breakdown
- For GSA: Always use `gsaRate × hours` for totals (NOT reverse-engineered FBLR)
- GSA breakdown (`reverseEngineerGSARate`) is purely cosmetic for UI consistency
- GSA totals MUST NOT change when indirect rates are modified

### Backend: Billing & Stripe Integration

**Architecture** (`routers/billing.py` + `client/stripe_client.py`):
- Stripe integration for payment processing
- Per-proposal charges (Basic: $10, Advanced: $20)
- Payment method management (add, remove, set default)
- Billing history with charge records in MongoDB

**Key Endpoints**:
- `POST /api/billing/setup-intent` - Create SetupIntent for adding payment method (admin only)
- `POST /api/billing/payment-method` - Attach payment method to customer
- `POST /api/billing/charge` - Charge for proposal (records in `charges` collection)
- `GET /api/billing/payment-methods` - List payment methods
- `DELETE /api/billing/payment-method/{pm_id}` - Remove payment method
- `GET /api/billing/charges` - Get billing history

**Critical Pattern**:
- Always check `stripe_service.is_configured` before operations
- Stripe customer ID stored in `organizations` collection
- Payment intents created with `automatic_payment_methods` enabled
- Charges linked to proposals via `proposal_id` field

### Backend: Company Repository (GSA Contracts)

**Purpose**: Organization-specific repository of GSA contracts and pre-approved labor categories.

**Architecture** (`routers/company_repository.py` + `client/gsa_parser.py`):
- Upload GSA contract documents (RTF, DOCX, XLSX, PDF)
- Parse and extract labor categories with rates
- Store in MongoDB `company_repositories` collection
- Users can select from repository when creating proposals

**Key Fields**:
```python
{
  "_id": ObjectId,
  "organization_id": ObjectId,
  "name": str,  # Display name
  "contract_metadata": {
    "contract_number": str,
    "company_name": str,
    "start_date": str,
    "end_date": str,
    "year_columns": [str]  # e.g., ["Year 1", "Year 2"]
  },
  "labor_categories": [{
    "sin": str,  # Special Item Number
    "labor_category": str,
    "rates": {
      "year_1": float,
      "year_2": float,
      ...
    }
  }],
  "created_at": datetime,
  "updated_at": datetime
}
```

**GSA Parsing Flow**:
1. Upload document → `POST /api/company-repository/contracts`
2. Parse with `gsa_parser.py` (dual-parser: metadata + labor categories)
3. Store in database with organization_id
4. Frontend displays in company repository UI
5. Users can add GSA positions to proposals

### Backend: Help Center & AI Support

**Architecture** (`routers/help_center.py` + `agent/help_center_agent.py`):
- Pinecone vector database for article storage and search
- Agno-based AI agent for intelligent help responses
- Semantic search across help articles

**Key Features**:
- Article management (CRUD operations, admin only)
- Vector similarity search for relevant articles
- AI chat agent with RAG (Retrieval Augmented Generation)
- Organization-scoped or global articles

**Pinecone Integration**:
- Index name: configurable via `settings.PINECONE_INDEX_NAME`
- Namespace: `help-center`
- Embedding model: OpenAI text-embedding-3-small
- Metadata: title, content, article_id, organization_id

### Frontend: Email Verification

**Flow** (`authStore.ts` + `app/auth/verify-email/page.tsx`):
1. User signs up → Email sent with verification link
2. Click link → Redirects to `/auth/verify-email?token={token}`
3. Frontend calls `POST /api/auth/verify-email` with token
4. Backend sets `email_verified: true` in user document
5. User can now access full application

**Critical**: Some features may require email verification (configurable)

### Frontend: Onboarding System

**Purpose**: Guide new users through initial setup and key features.

**Architecture** (`onboardingStore.ts` + `components/onboarding/`):
- Role-based task lists (admin vs user)
- Task completion tracking in localStorage
- Progress indicators
- Links to relevant pages

**Default Tasks**:
- Admin: Create organization, invite team members, upload first document
- User: Complete profile, explore pricing workspace, create first proposal

## Common Tasks

### Backend: Adding New API Endpoints

1. Create route in appropriate router file (`routers/`)
2. Add authentication dependency: `current_user: dict = Depends(get_current_user)`
3. For admin-only: `current_user: dict = Depends(require_admin)`
4. Use CRUD classes from `utils/` (e.g., `OrganizationCRUD()`, `ProposalCRUD()`)
5. Serialize output with `serialize_doc()` or `serialize_docs()` from `utils/helpers.py`
6. Register router in `app/server.py` if new file

### Backend: Modifying Calculations

- All calculation logic is in `client/calculation_service.py:Calculator`
- Methods are static, stateless (pure functions)
- Add new calculation methods to `Calculator` class
- Update Excel generator if output format changes (`client/excel_generator.py`)

### Frontend: Adding State to Pricing Workspace

1. Add field to `pricingStore.ts` state interface
2. Create setter function (e.g., `setFieldName: (value) => set({ fieldName: value })`)
3. Update `loadProposal()` to populate field from API response
4. Update `saveProposal()` to include field in API request
5. Add debounced auto-save trigger if user-editable

### Frontend: Adding Columns to Pricing Grid

1. Update column definitions in `columns` array
2. Add custom `renderCell` for special formatting
3. Use `frozen: true` for sticky columns (left or right)
4. Update `onRowsChange` handler if editable
5. Add field to TypeScript interface (e.g., `Position`, `Subcontractor`)

## Important Patterns

### Frontend: Migration Pattern for Rate Structure Changes

When loading proposals, always migrate old rate structure to new:
```typescript
// In pricingStore.ts loadProposal()
let rates = proposal.spreadsheet_data?.rates || proposal.rates;

// Ensure rates object exists
if (!rates) {
  rates = {
    fringe: 0.247,
    oh_onsite: 0.0711,
    oh_offsite: 0.0711,
    ga: 0.2243,
    fee: 0.08,
  };
} else {
  // Migrate old 'oh' to new structure
  if (rates.oh !== undefined && !rates.oh_onsite && !rates.oh_offsite) {
    rates = {
      ...rates,
      oh_onsite: rates.oh,
      oh_offsite: rates.oh,
    };
    delete rates.oh;
  }

  // Always ensure both OH rates exist
  if (!rates.oh_onsite) rates.oh_onsite = 0.0711;
  if (!rates.oh_offsite) rates.oh_offsite = 0.0711;
}
```

### Backend: ObjectId Serialization

MongoDB uses `ObjectId` type which breaks JSON serialization. Always serialize before returning:
```python
from utils.helpers import serialize_doc, serialize_docs

# Single document
user = user_crud.get_by_id(user_id)
return serialize_doc(user)  # Converts _id → id, ObjectId → string

# Multiple documents
proposals = proposal_crud.get_all()
return serialize_docs(proposals)
```

### Backend: Organization-Scoped Queries

Always include `organization_id` in queries:
```python
# Get user's proposals
proposals = proposal_crud.get_user_proposals(
    user_id=current_user["_id"],
    organization_id=current_user["organization_id"],
    role=current_user["role"]
)
```

### Frontend: Zustand Store Updates

Use `set()` for state updates, `get()` for reading current state:
```typescript
// Update single field
set({ isLoading: true })

// Update multiple fields
set({
  positions: [...positions, newPosition],
  isDirty: true
})

// Access current state
const currentPositions = get().positions
```

**CRITICAL: Always set isDirty when modifying data**:
- Rate updates: `set({ rates: newRates, isDirty: true })`
- Position updates: `set({ positions: [...], isDirty: true })`
- Without `isDirty: true`, auto-save will be skipped (guard check at line 585)

### Frontend: React Data Grid Columns

Columns must have unique `key` and `name`:
```typescript
const columns: Column<Position>[] = [
  {
    key: 'labor_category',
    name: 'Labour Category',
    width: 250,
    resizable: true,
    frozen: true,  // Sticky column
    renderCell: ({ row }) => (
      <div className="flex items-center h-full px-2">
        <span className="font-semibold">{row.labor_category}</span>
      </div>
    ),
  },
  // ... more columns
]
```

## Environment Variables

### Backend (.env)

**Required**:
```bash
# LLM Services
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
LLAMA_CLOUD_API_KEY=llx-xxxxxxxxxxxxx

# MongoDB
MONGODB_URL=mongodb://localhost:27017
MONGODB_DATABASE=oews_data

# Authentication
SECRET_KEY=your-secret-key-change-in-production
GOOGLE_CLIENT_ID=your-google-client-id

# Email (for invitations & verification)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@priceiq.com
FRONTEND_URL=http://localhost:3000
```

**Optional**:
```bash
# BLS API (legacy, not actively used)
BLS_API_KEY=your_bls_key
CAREERONESTOP_API_KEY=your_careeronestop_key

# Stripe (payment processing)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx

# Pinecone (help center vector search)
PINECONE_API_KEY=xxxxxxxxxxxxx
PINECONE_INDEX_NAME=help-center

# iDrive (cloud storage, not actively used)
IDRIVE_ACCESS_KEY=xxxxxxxxxxxxx
IDRIVE_SECRET_KEY=xxxxxxxxxxxxx
IDRIVE_BUCKET_NAME=your-bucket
IDRIVE_ENDPOINT=https://xxxxxxxxxxxxx
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=PriceIQ
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000

# Stripe (optional, for payment UI)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
```

## Testing

### Backend Testing

```bash
# Test full pipeline standalone
cd backend
uv run python main.py

# Test with curl
curl -X POST http://localhost:8000/api/pricing/process \
  -F "files=@Labor_Information.pdf" \
  -H "Authorization: Bearer <token>" \
  -o results.json

# Test invitation flow
curl -X POST http://localhost:8000/api/invitations \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "role": "user"}'
```

### Frontend Testing

1. Start backend server: `cd backend && uv run uvicorn app.server:app --reload`
2. Start frontend dev server: `cd frontend && npm run dev`
3. Open http://localhost:3000
4. Test flows:
   - **Authentication**: Signup/Login, email verification, password reset
   - **Proposals**: Upload document, edit pricing workspace, convert to subcontractor
   - **Organization**: Share proposal (admin only), switch workspace, invite members
   - **Billing**: Add payment method, charge for proposal, view billing history
   - **Company Repository**: Upload GSA contract, select from repository
   - **Help Center**: Search articles, ask AI assistant
   - **Onboarding**: Complete tasks, view progress
   - **Settings**: Update organization settings, manage members, request account deletion

## Troubleshooting

**"LLAMA_CLOUD_API_KEY not found"**
- Set in `.env` file: `LLAMA_CLOUD_API_KEY=llx-...`

**"Failed to connect to MongoDB"**
- Check MongoDB is running: `brew services list` (macOS)
- Verify `MONGODB_URL` in `.env`

**"No wage data found"**
- Ensure MongoDB is populated: `uv run python scripts/import_oews_to_mongo.py`
- Check collection exists: `db.wage_data.countDocuments({})`

**"FAISS index not found"**
- Index auto-generates on first run
- If missing, delete `data/cache/soc_faiss_index/` and restart server

**Frontend: Positions not updating after conversion**
- Check browser console for cache invalidation logs
- Verify `transformToAdvanced()` is called after reload
- Clear browser cache and localStorage

**Frontend: Workspace switch causes full page reload**
- Ensure `WorkspaceSwitcher.tsx` uses `router.push()` not `window.location.reload()`
- Check cache invalidation for old organization

**Stripe payment errors**
- Verify `STRIPE_SECRET_KEY` is set in backend `.env`
- Check Stripe dashboard for webhook events
- Test with Stripe test cards: `4242 4242 4242 4242`
- Ensure organization has `stripe_customer_id` set

**GSA contract parsing failures**
- Check file format (RTF, DOCX, XLSX, PDF supported)
- Verify LLM API keys are configured (OpenAI or OpenRouter)
- Review parser logs for retry attempts
- Ensure contract has structured table format

**Email not sending (invitations/verification)**
- Verify SMTP credentials in `.env`
- Check SMTP server allows less secure apps (Gmail)
- Use app-specific password for Gmail
- Check spam folder for test emails

**Pinecone vector search errors**
- Verify `PINECONE_API_KEY` and `PINECONE_INDEX_NAME` in `.env`
- Check index exists in Pinecone dashboard
- Ensure index dimension matches embedding model (1536 for text-embedding-3-small)

## Performance Optimization

**Backend Pre-warming** (startup.py):
- SOC Vector Search (~30s cold start) → <100ms after pre-warm
- MongoDB connections (~2s each)
- Run in background on server startup (non-blocking)

**Frontend Caching** (lib/cache/):
- Hybrid strategy: instant display + background refresh + focus refresh
- Organization-scoped cache keys
- 5-minute TTL for proposals list
- Invalidate on mutations and workspace switch

**Database Indexes** (created via `scripts/create_indexes.py`):
- Users: `(email, unique)`, `(organization_id, role)`, `(organization_id, status)`, `(email_verified)`
- Proposals: `(organization_id, created_at)`, `(shared_with)`, `(user_id, created_at)`
- Invitations: `(token_hash, unique)`, `(expires_at, TTL)`, `(organization_id, status)`
- Organizations: `(owner_id)`, `(stripe_customer_id)`
- Charges: `(organization_id, created_at)`, `(proposal_id)`
- Company Repositories: `(organization_id, created_at)`
- Help Center Articles: `(organization_id)`, `(created_at)`
- Terms Acceptances: `(user_id, version)`, `(organization_id, version)`

## Security Considerations

**Backend**:
- JWT tokens with 30-minute expiration
- Token blacklist for logout (MongoDB collection)
- Password hashing with bcrypt
- Invitation tokens hashed with SHA-256 (never store plain)
- Email verification tokens hashed with SHA-256
- Organization isolation in all queries
- RBAC checks before mutations (admin vs user)
- CORS configured (update for production in `app/server.py`)
- Stripe webhook signature verification (when webhooks enabled)

**Frontend**:
- JWT stored in memory (not localStorage)
- HTTPS only in production
- Input validation with Zod schemas
- XSS prevention via React's default escaping
- Stripe Elements for PCI-compliant card input

**Data Privacy**:
- Account deletion: 30-day grace period before permanent deletion
- Organization deletion: Requires admin role
- Email verification required for sensitive operations (configurable)
- Terms of service acceptance tracking with versioning

## Known Limitations

1. **Job Store**: In-memory (lost on server restart). Consider Redis for production.
2. **File Size**: Default 2MB limit per file (FastAPI default).
3. **Processing Time**: Large documents may take 2-5 minutes (intelligent parser).
4. **Vector Index**: FAISS index regenerates if cache cleared (~30 seconds).
5. **No WebSockets**: Progress updates require polling (no real-time).
6. **Proposal Cache**: Browser localStorage (5-10MB limit).
7. **Email Service**: SMTP only (no SendGrid/AWS SES integration yet).
8. **Stripe Webhooks**: Not implemented (manual charge creation only).
9. **GSA Parser**: Requires structured table format (may fail on free-form text).
10. **Pinecone**: Single index for all organizations (namespace-based isolation).
11. **Onboarding**: Tasks stored in localStorage (not synced across devices).

## Production Deployment

**Backend**:
1. Update CORS origins in `app/server.py` (specify domain, not `*`)
2. Change `SECRET_KEY` in `.env` (generate random 32+ character key)
3. Use MongoDB Atlas (update `MONGODB_URL`, enable IP whitelist)
4. Enable HTTPS (reverse proxy: nginx, Caddy, or cloud load balancer)
5. Add rate limiting (e.g., slowapi)
6. Use Redis for job store (replace in-memory dict)
7. Run with multiple workers: `--workers 4`
8. Configure Stripe webhooks (implement `routers/stripe_webhooks.py` handlers)
9. Set up email service (consider SendGrid/AWS SES for production)
10. Create Pinecone indexes (separate for help-center)
11. Run database index creation: `uv run python scripts/create_indexes.py`
12. Set up monitoring/logging (e.g., Sentry, CloudWatch)

**Frontend**:
1. Build: `npm run build`
2. Set `NEXT_PUBLIC_API_URL` to production backend URL
3. Configure NEXTAUTH_URL to production domain
4. Set Stripe publishable key: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
5. Deploy to Vercel/AWS/Docker
6. Enable CDN for static assets
7. Configure custom domain with SSL
8. Set up error tracking (e.g., Sentry)

**Docker Deployment** (optional):
- Backend Dockerfile: `backend/Dockerfile`
- Frontend Dockerfile: `frontend/Dockerfile`
- Use docker-compose for local testing
- Consider Kubernetes for production scaling

## Additional Documentation

**Project Planning**:
- `ACCOUNT_DELETION_PLAN.md` - Account deletion feature design and implementation
- `GSA_COMPANY_REPOSITORY_PLAN.md` - Company repository feature planning
- `GSA_INTEGRATION_CHANGES.md` - GSA contract integration changes
- `GSA_WAGE_REPOSITORY_PLAN.md` - GSA wage repository architecture
- `TERMS_IMPLEMENTATION_GUIDE.md` - Terms of service implementation guide

**Backend Documentation**:
- `backend/API_DOCUMENTATION.md` - API endpoint reference
- `backend/BOSS_REQUIREMENTS_EXPLAINED.md` - Business requirements documentation
- `backend/EXCEL_FORMULA_ANALYSIS.md` - Excel formula implementation details
- `backend/FRONTEND_INTEGRATION.md` - Frontend-backend integration guide
- `backend/MONGODB_SCHEMA.md` - Database schema documentation
- `backend/PIPELINE_FLOW.md` - Document processing pipeline flow
- `backend/QUICK_START.md` - Quick start guide
- `backend/UI_GUIDE.md` - UI component guide

**Sample Files**:
- `backend/Labor Information.pdf` - Sample labor information document
- `backend/Example Output.xlsx` - Sample Excel export output
- `backend/Intprepix Volume III.xlsx` - Sample pricing spreadsheet
- `Performance Work Statement C.json` - Sample PWS JSON output
- `Sample_Surge_Pricing_Document.txt` - Sample pricing document

**Terms of Service**:
- `frontend/public/legal/terms_v1.0.0.md` - Terms of service (version 1.0.0)
- `frontend/components/terms/content/TermsContent.tsx` - Terms viewer component
