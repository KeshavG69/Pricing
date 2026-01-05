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
- `backend/routers/` - API endpoints (pricing, proposals, organizations, invitations, auth)
- `backend/client/` - External services (LlamaExtract, FAISS, MongoDB, OpenAI)
- `backend/agent/` - Agno-based pricing agent (SOC search → wage lookup)
- `backend/utils/` - CRUD operations (proposals, organizations, invitations)
- `backend/auth/` - JWT authentication, RBAC, user management
- `backend/scripts/` - Data setup and migration scripts

**Database Collections** (MongoDB):
- `users` - User accounts (email, password, organization_id, role)
- `organizations` - Multi-tenant workspaces (settings, subscription, owner_id)
- `proposals` - Pricing proposals (jobs, rates, organization_id, shared_with)
- `invitations` - Email invitations (token_hash, organization_id, expires_at)
- `occupations` - SOC codes (~1,100, cached in FAISS)
- `areas` - Geographic areas (~700)
- `wage_data` - BLS OEWS data (6M+ wage records)
- `token_blacklist` - Invalidated JWTs

### Frontend Architecture

**State Management** (Zustand):
- `frontend/lib/stores/pricingStore.ts` - Core pricing workspace state (positions, subcontractors, ODCs, rates)
- `frontend/lib/stores/proposalsStore.ts` - Proposals list, upload, delete
- `frontend/lib/stores/authStore.ts` - User authentication, organization context
- `frontend/lib/stores/organizationStore.ts` - Organization settings, members

**Key Frontend Files**:
- `frontend/app/` - Next.js 16 App Router pages
- `frontend/components/pricing/` - Excel-like pricing workspace
  - `PricingWorkspace.tsx` - Main container with tabbed interface
  - `PositionsGrid.tsx` - Basic mode positions table (react-data-grid)
  - `sections/PrimeLaborSection.tsx` - Advanced mode with FBLR breakdown
  - `sections/SubcontractorSection.tsx` - Subcontractor labor table
  - `sections/ODCSection.tsx` - Other Direct Costs table
  - `sections/PassthroughSection.tsx` - Prime contractor passthrough calculations
- `frontend/components/layout/` - DashboardLayout, navigation
- `frontend/components/workspace/` - WorkspaceSwitcher (organization switching)

**Pricing Workspace Modes**:
- **Basic Mode**: Simple positions table with labor category, hours, rates
- **Advanced Mode**: Expandable rows showing FBLR breakdown (Direct Labor → Fringe → OH → G&A → Fee)

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

# Email (for invitations)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@priceiq.com
FRONTEND_URL=http://localhost:3000
```

**Optional**:
```bash
BLS_API_KEY=your_bls_key
CAREERONESTOP_API_KEY=your_careeronestop_key
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=PriceIQ
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
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
   - Signup/Login
   - Upload document
   - Edit pricing workspace
   - Convert position to subcontractor
   - Share proposal (admin only)
   - Switch workspace/organization

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

**Database Indexes**:
- Users: `(email, unique)`, `(organization_id, role)`, `(organization_id, status)`
- Proposals: `(organization_id, created_at)`, `(shared_with)`, `(user_id, created_at)`
- Invitations: `(token_hash, unique)`, `(expires_at, TTL)`, `(organization_id, status)`

## Security Considerations

**Backend**:
- JWT tokens with 30-minute expiration
- Token blacklist for logout (MongoDB collection)
- Password hashing with bcrypt
- Invitation tokens hashed with SHA-256 (never store plain)
- Organization isolation in all queries
- RBAC checks before mutations
- CORS configured (update for production in `app/server.py`)

**Frontend**:
- JWT stored in memory (not localStorage)
- HTTPS only in production
- Input validation with Zod schemas
- XSS prevention via React's default escaping

## Known Limitations

1. **Job Store**: In-memory (lost on server restart). Consider Redis for production.
2. **File Size**: Default 2MB limit per file (FastAPI default).
3. **Processing Time**: Large documents may take 2-5 minutes.
4. **Vector Index**: Regenerates if cache cleared (~30 seconds).
5. **No WebSockets**: Progress updates require polling (no real-time).
6. **Proposal Cache**: Browser localStorage (5-10MB limit).

## Production Deployment

**Backend**:
1. Update CORS origins in `app/server.py` (specify domain, not `*`)
2. Change `SECRET_KEY` in `.env` (generate random key)
3. Use MongoDB Atlas (update `MONGODB_URL`)
4. Enable HTTPS (reverse proxy: nginx, Caddy)
5. Add rate limiting (e.g., slowapi)
6. Use Redis for job store (replace in-memory dict)
7. Run with multiple workers: `--workers 4`

**Frontend**:
1. Build: `npm run build`
2. Set `NEXT_PUBLIC_API_URL` to production backend
3. Configure NEXTAUTH_URL to production domain
4. Deploy to Vercel/AWS/Docker
5. Enable CDN for static assets

## Additional Documentation

- Backend OEWS pipeline: `backend/CLAUDE.md`
- Organization system: `ORGANIZATION_SYSTEM_EXPLAINED.md`
- Backend implementation plan: `BACKEND_PLAN.md`
- Performance optimization plan: `.claude/plans/cosmic-crafting-shore.md`
