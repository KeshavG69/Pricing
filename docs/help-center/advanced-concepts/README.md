# Advanced Concepts & Technical Details

Deep dive into PriceIQ's technical architecture, calculation algorithms, AI models, and advanced features for power users.

## What This Category Covers

This section provides technical deep-dives for:
- **FAISS Vector Search**: How AI matches job descriptions to SOC codes
- **MongoDB Architecture**: Multi-tenant data model and indexing strategy
- **Calculation Algorithms**: FBLR cascade, compound escalation, position splitting
- **React Data Grid**: Excel-like interface implementation
- **Performance Optimization**: Caching, pre-warming, parallel processing

**Audience**: Technical users, developers, system administrators, power users wanting to understand internals.

## Key Concepts

### AI-Powered SOC Matching
- **FAISS (Facebook AI Similarity Search)**: Vector database for semantic search
- **Embeddings**: Job descriptions converted to 1536-dimension vectors (OpenAI text-embedding-ada-002)
- **Similarity Search**: Cosine similarity between query vector and 1,100 SOC code vectors
- **Accuracy**: 85-95% on first match

### Multi-Tenant Architecture
- **Organization Isolation**: MongoDB queries always filter by `organization_id`
- **Role-Based Access**: Admin vs User permissions enforced at API level
- **Shared Settings**: Indirect rates stored at organization level, inherited by proposals
- **Invitation System**: Token-based with SHA-256 hashing and 7-day expiration

### Calculation Engine
- **FBLR Cascade**: Direct Labor → +Fringe → +OH → +G&A → +Fee
- **Compound Escalation**: Year N = Year 1 × ∏(1 + rateᵢ₋₁,ᵢ)
- **Position Splitting**: Auto-split positions >1920 hours into multiple FTE rows
- **GSA Override**: GSA rates bypass FBLR calculation (already fully burdened)

### Frontend State Management
- **Zustand**: Lightweight React state management (not Redux)
- **Auto-Save**: 2-second debounce, updates `isDirty` flag, POST to `/api/proposals/[id]`
- **Cache**: Organization-scoped browser cache with stale-while-revalidate strategy
- **Workspace Switching**: Full context reload on organization change

## Quick Start Guides

**New to advanced concepts?** Start here:
1. [FAISS Vector Search for SOC Matching](01-faiss-soc-matching.md) - AI matching explained (10 min)
2. [MongoDB Multi-Tenant Architecture](02-mongodb-architecture.md) - Data model (8 min)

**Deep dives:**
1. [FBLR Calculation Algorithm](03-fblr-algorithm.md) - Math behind the cascade (12 min)
2. [React Data Grid Implementation](04-react-data-grid.md) - Excel-like UI (10 min)

## All Articles in This Category

### AI & Machine Learning
- [FAISS Vector Search for SOC Matching](01-faiss-soc-matching.md) - Semantic similarity search (P2, Technical Deep-Dive)

### Architecture
- [MongoDB Multi-Tenant Architecture](02-mongodb-architecture.md) - Data model and isolation (P2, Technical Reference)

### Algorithms
- [FBLR Calculation Algorithm](03-fblr-algorithm.md) - Cascade formula and implementation (P2, Technical Deep-Dive)

### Frontend
- [React Data Grid Implementation](04-react-data-grid.md) - Excel-like interface (P2, Technical Reference)

## Common Questions

**Q: Why FAISS instead of traditional search?**
A: FAISS enables **semantic matching** (not just keyword search). Example: "Software Engineer" matches to SOC 15-1252 even if RFP says "Application Developer" or "Programmer III". Traditional search would miss these matches.

**Q: How is organization data isolated?**
A: Every MongoDB query includes `organization_id` filter. API endpoints validate user's organization membership before allowing access. Frontend enforces organization-scoped views. Result: impossible to access other organizations' data.

**Q: Why 2-second auto-save delay?**
A: **Debouncing** prevents excessive API calls while user is typing. Example: User types "12" then "34" then "56" (3 keystrokes) → Only 1 API call after 2-second pause. Without debounce, 3 API calls would fire.

**Q: What happens when you switch organizations?**
A: Full context reload: (1) JWT token validated for new org, (2) Browser cache cleared for old org, (3) Proposals list fetched for new org, (4) Workspace state reset, (5) Settings loaded for new org. Result: Clean switch, no data leakage.

**Q: How are GSA positions handled differently?**
A: GSA rates are **already fully burdened** (negotiated with government). When indirect rates change, GSA position totals DON'T recalculate. Only the **display breakdown** changes (cosmetic). BLS positions recalculate the FBLR from scratch.

**Q: What's the position splitting algorithm?**
A:
```python
if hours > FTE_THRESHOLD (1920):
    num_positions = ceil(hours / FTE_THRESHOLD)
    base_hours = floor(hours / num_positions)
    remainder = hours % num_positions
    # Split into num_positions with base_hours each
    # Distribute remainder across first few positions
```

Example: 5760 hours → 3 positions (1920, 1920, 1920)
Example: 5800 hours → 4 positions (1450, 1450, 1450, 1450)

## Technical Architecture

### Backend Stack
- **FastAPI**: Python async web framework
- **MongoDB**: NoSQL database (6M+ wage records, proposals, organizations, users)
- **FAISS**: Vector search index (~1,100 SOC code embeddings)
- **LlamaExtract**: Document parsing (LlamaCloud API)
- **OpenAI GPT-4**: Agent-based extraction (10 parallel agents)
- **Python 3.13**: Language runtime
- **uv**: Package manager (modern pip replacement)

### Frontend Stack
- **Next.js 16**: React framework (App Router)
- **React 19**: UI library
- **Zustand**: State management
- **react-data-grid**: Excel-like grid component
- **Tailwind CSS**: Utility-first CSS
- **TypeScript**: Type-safe JavaScript

### Infrastructure
- **MongoDB**: Self-hosted or MongoDB Atlas
- **Backend**: Uvicorn ASGI server (multi-worker)
- **Frontend**: Next.js production server or Vercel
- **CDN**: Static asset caching
- **Email**: SMTP (Gmail, SendGrid, etc.)

### Data Flow

**Document Processing**:
```
User uploads PDF/DOCX
  ↓
LlamaExtract parses document → JSON
  ↓
OpenAI GPT-4 extracts positions (10 parallel agents)
  ↓
For each position:
  - Job description → OpenAI embedding (1536-dim vector)
  - FAISS search → closest SOC code
  - MongoDB lookup → wage data (area + percentile)
  - Calculate FBLR (cascade formula)
  ↓
Return JSON array of positions
  ↓
Frontend displays in pricing workspace
```

**Auto-Save**:
```
User edits cell in grid
  ↓
Zustand updates local state
  ↓
2-second debounce timer starts
  ↓
Timer expires → POST /api/proposals/[id]
  ↓
Backend validates JWT + organization_id
  ↓
MongoDB update (upsert)
  ↓
Return success → Frontend shows "Saved" ✓
```

**Workspace Switching**:
```
User clicks organization dropdown
  ↓
Select different organization
  ↓
Frontend:
  - Clear old org cache (localStorage)
  - Fetch new org proposals (API call)
  - Reset workspace state
  - Update URL (router.push)
  ↓
Backend:
  - Validate user membership in new org
  - Filter proposals by new organization_id
  ↓
Render new organization context
```

## Performance Optimization

### Backend Pre-Warming (startup.py)
- **SOC Vector Index**: Load FAISS index on startup (~30s cold, <100ms after)
- **MongoDB Connections**: Pre-initialize connection pool
- **Background**: Non-blocking (server starts immediately, warming happens in parallel)

### Frontend Caching (lib/cache/)
- **Strategy**: Stale-while-revalidate (instant display + background refresh)
- **Scope**: Organization-scoped cache keys (`proposals:list:${orgId}`)
- **TTL**: 5 minutes for proposals list
- **Invalidation**: On mutations (create, update, delete, share, workspace switch)
- **Focus Refresh**: Window focus listener triggers refresh

### Database Indexing
- **Users**: `(email, unique)`, `(organization_id, role)`, `(organization_id, status)`
- **Proposals**: `(organization_id, created_at)`, `(shared_with)`, `(user_id, created_at)`
- **Invitations**: `(token_hash, unique)`, `(expires_at, TTL)`, `(organization_id, status)`
- **Wage Data**: `(soc_code, area_code)` (compound index, 6M records)

### Parallel Processing
- **Document Extraction**: 10 concurrent agents (asyncio.gather with semaphore)
- **Position Processing**: Each agent handles 2-3 positions (50 positions → 5 minutes)
- **API Throttling**: Rate-limited to prevent OpenAI API quota exhaustion

## Security Considerations

### Authentication
- **JWT**: JSON Web Tokens with 30-minute expiration
- **Blacklist**: MongoDB collection tracks invalidated tokens (logout)
- **Password Hashing**: bcrypt with salt
- **Token Storage**: Frontend stores in memory (not localStorage for security)

### Authorization
- **RBAC**: Role-Based Access Control (Admin vs User)
- **Organization Scoping**: All queries filter by `organization_id`
- **Proposal Sharing**: Admin-only action, user-level enforcement
- **Invitation Security**: SHA-256 hashed tokens, 7-day expiration, single-use

### Data Privacy
- **Multi-Tenant Isolation**: Impossible to query other organizations' data
- **API Validation**: Every endpoint checks user's organization membership
- **Frontend Enforcement**: Organization-scoped state management
- **No Cross-Org References**: Proposals cannot reference other orgs' data

## Related Documentation

**For Non-Technical Users:**
- [Understanding BLS OEWS Data](../data-sources/01-bls-oews-explained.md)
- [How Document Processing Works](../creating-proposals/01-document-processing.md)
- [Understanding FBLR Calculations](../advanced-workspace/02-fblr-calculations.md)

**For Developers:**
- **Backend CLAUDE.md**: `/backend/CLAUDE.md` (development guide)
- **Root CLAUDE.md**: `/CLAUDE.md` (project overview)
- **Organization System**: `/ORGANIZATION_SYSTEM_EXPLAINED.md`

**For Power Users:**
- [Advanced Mode: FBLR Breakdown](../advanced-workspace/01-advanced-mode.md)
- [Wage Data Tab: Viewing Details](../advanced-workspace/11-wage-data-tab.md)
- [Changing SOC Codes](../advanced-workspace/08-changing-soc-codes.md)

---

**Last Updated**: January 15, 2026
**Category Priority**: P2 (Technical deep-dive)
**Applies to**: Technical users, developers, power users
