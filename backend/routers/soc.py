"""
SOC (Standard Occupational Classification) search endpoints.

Provides AI-powered SOC code search using FAISS vector search
and manual search using MongoDB text search with hybrid code/title detection.

Caching Strategy:
- All occupations cached in-memory (static data, ~100KB)
- Search results cached with TTL (5 minutes)
- LRU cache for frequently accessed queries
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
import re
import time
from functools import lru_cache
from client.soc_vector_search import get_soc_vector_search_client
from client.oews_mongodb import get_oews_mongo_client
from auth.dependencies import get_current_user

router = APIRouter(prefix="/soc", tags=["soc"])

# ============================================================================
# IN-MEMORY CACHE for all occupations (static data, loaded once)
# ============================================================================
_all_occupations_cache: Optional[List[Dict]] = None
_cache_timestamp: Optional[float] = None
CACHE_TTL = 86400  # 24 hours (occupations rarely change)


class SOCSearchAIRequest(BaseModel):
    """Request model for AI-powered SOC code search (FAISS)."""
    labor_category: str = Field(..., description="Job title or labor category to search for")
    description: Optional[str] = Field(None, description="Job description for better matching accuracy")
    experience: Optional[int] = Field(None, description="Years of experience (not currently used in search)")
    location: Optional[str] = Field(None, description="Location (not currently used in search)")
    top_k: int = Field(5, ge=1, le=20, description="Number of top matches to return (1-20)")


class SOCSearchRequest(BaseModel):
    """Request model for MongoDB hybrid search (text + regex)."""
    query: str = Field(..., description="Search query for SOC code or occupation name")
    limit: int = Field(50, ge=1, le=100, description="Maximum number of results to return")


def format_soc_code(occupation_code: str) -> str:
    """
    Format occupation code from 6-digit to XX-XXXX format.

    Args:
        occupation_code: 6-digit code like "151252"

    Returns:
        Formatted code like "15-1252"
    """
    if len(occupation_code) == 6:
        return f"{occupation_code[:2]}-{occupation_code[2:]}"
    return occupation_code


async def get_all_occupations_cached() -> List[Dict]:
    """
    Get all occupations with in-memory caching.

    Loads all ~1,100 occupations once and caches in memory.
    Cache expires after 1 hour (occupations are static).

    Returns:
        List of dicts with soc_code and soc_title
    """
    global _all_occupations_cache, _cache_timestamp

    current_time = time.time()

    # Check if cache is valid
    if (
        _all_occupations_cache is not None
        and _cache_timestamp is not None
        and (current_time - _cache_timestamp) < CACHE_TTL
    ):
        print(f"✅ Using cached occupations (age: {int(current_time - _cache_timestamp)}s)")
        return _all_occupations_cache

    # Cache miss or expired - load from MongoDB
    print("🔄 Loading all occupations from MongoDB...")
    try:
        mongo_client = get_oews_mongo_client()
        await mongo_client._ensure_initialized()

        # MongoDB stores as occupation_code (6 digits without hyphen)
        cursor = mongo_client.db.occupations.find(
            {
                "selectable": "T",  # Only selectable occupations
                "occupation_code": {"$not": {"$regex": "^00"}}  # Exclude aggregate codes (00-0000, etc.)
            },
            {"occupation_code": 1, "occupation_name": 1, "_id": 0}
        ).sort("occupation_code", 1)

        results = await cursor.to_list(length=None)

        _all_occupations_cache = [
            {
                "soc_code": format_soc_code(doc["occupation_code"]),
                "soc_title": doc["occupation_name"]
            }
            for doc in results
        ]

        _cache_timestamp = current_time
        print(f"✅ Cached {len(_all_occupations_cache)} occupations")

        return _all_occupations_cache

    except Exception as e:
        print(f"❌ Failed to load occupations: {e}")
        import traceback
        traceback.print_exc()
        # Return empty list on error, don't cache failures
        return []


@lru_cache(maxsize=100)
def normalize_soc_query_for_display(query: str) -> str:
    """
    Normalize SOC code query for display (XX-XXXX format).

    Args:
        query: Raw query string like "151252", "15-1252", or "15"

    Returns:
        Normalized query with hyphen for display
    """
    # Remove any existing hyphens
    clean = query.replace('-', '')

    if len(clean) >= 2 and clean.isdigit():
        # Insert hyphen after first 2 digits
        return clean[:2] + '-' + clean[2:] if len(clean) > 2 else clean
    return query


@lru_cache(maxsize=100)
def normalize_soc_query_for_mongo(query: str) -> str:
    """
    Normalize SOC code query for MongoDB search (6 digits, no hyphen).

    Args:
        query: Raw query string like "15-1252", "151252", or "15"

    Returns:
        Normalized query without hyphen for MongoDB
    """
    # Remove hyphens for MongoDB query
    return query.replace('-', '')


@lru_cache(maxsize=50)
def is_soc_code_pattern(query: str) -> bool:
    """
    Detect if query matches SOC code pattern (cached for performance).

    Pattern: 2 digits, optional hyphen, 0-4 digits
    Examples: "15", "15-", "15-1", "15-1252", "151", "151252"

    Args:
        query: Query string to check

    Returns:
        True if query looks like SOC code, False otherwise
    """
    pattern = r'^\d{2}-?\d{0,4}$'
    return re.match(pattern, query) is not None


@router.post("/search-ai")
async def search_soc_codes_ai(
    request: SOCSearchAIRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    AI-powered SOC code search using FAISS vector search.

    Uses semantic search with OpenAI embeddings to find the most relevant
    occupation codes based on labor category and job description.

    Args:
        request: Search request with labor_category, description (optional), and parameters
        current_user: Authenticated user (from JWT token)

    Returns:
        Dict with status and list of AI-suggested SOC codes with similarity scores

    Raises:
        HTTPException: If search fails or vector search client unavailable
    """
    try:
        # Get the SOC vector search client (singleton)
        soc_client = get_soc_vector_search_client()

        if not soc_client:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="SOC vector search service is not available"
            )

        # Perform FAISS vector search
        results = soc_client.search(
            query=request.labor_category,
            description=request.description,
            top_k=request.top_k
        )

        # Format results
        suggestions = []
        for i, (soc_code, soc_title, similarity_score) in enumerate(results):
            suggestions.append({
                "soc_code": soc_code,
                "soc_title": soc_title,
                "similarity_score": round(similarity_score, 4),
                "is_best_match": i == 0
            })

        return {
            "status": "success",
            "suggestions": suggestions
        }

    except HTTPException:
        raise

    except Exception as e:
        print(f"❌ SOC AI search failed: {e}")
        import traceback
        traceback.print_exc()

        return {
            "status": "success",
            "suggestions": []
        }


@router.get("/all")
async def get_all_soc_codes(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Number of records to return"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get SOC codes with in-memory caching (supports fetching all at once).

    Returns occupation codes sorted by SOC code with optional pagination.
    Uses in-memory cache for instant responses after first load.

    Performance:
    - First load: ~50ms (MongoDB query)
    - Cached loads: ~1ms (in-memory slice)

    Args:
        skip: Number of records to skip (for pagination, default: 0)
        limit: Number of records to return (default: 20, max: 2000 to fetch all)
        current_user: Authenticated user (from JWT token)

    Returns:
        Dict with status, total count, has_more flag, and list of SOC codes
    """
    try:
        # Get all occupations from cache (instant after first load)
        all_occupations = await get_all_occupations_cached()

        if not all_occupations:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to load occupations"
            )

        total_count = len(all_occupations)

        # Slice the cached list (in-memory, instant)
        end = skip + limit
        paginated = all_occupations[skip:end]

        has_more = end < total_count

        return {
            "status": "success",
            "total": total_count,
            "skip": skip,
            "limit": limit,
            "has_more": has_more,
            "occupations": paginated
        }

    except HTTPException:
        raise

    except Exception as e:
        print(f"❌ Failed to fetch SOC codes: {e}")
        import traceback
        traceback.print_exc()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch SOC codes"
        )


@router.post("/search")
async def search_soc_codes_hybrid(
    request: SOCSearchRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Hybrid MongoDB search for SOC codes (as-you-type suggestions).

    Smart search that auto-detects whether user is searching by:
    - SOC code (e.g., "15", "15-1", "15-1252") → Uses in-memory cache filtering
    - Job title (e.g., "software", "network admin") → Uses MongoDB text search

    Caching Strategy:
    - SOC code searches use cached in-memory list (instant, ~1ms)
    - Text searches hit MongoDB but use text index (fast, ~10-20ms)

    Args:
        request: Search request with query string
        current_user: Authenticated user (from JWT token)

    Returns:
        Dict with status, query_type, and list of matching SOC codes
    """
    try:
        # Empty query returns no results
        if not request.query.strip():
            return {
                "status": "success",
                "suggestions": []
            }

        query = request.query.strip()

        # Detect search type using cached function
        is_code = is_soc_code_pattern(query)

        if is_code:
            # ================================================================
            # STRATEGY 1: SOC Code Search (In-Memory Cache, ~1ms)
            # ================================================================

            # Normalize query for display (with hyphen)
            normalized_display = normalize_soc_query_for_display(query)

            # Filter cached occupations in-memory (instant!)
            all_occupations = await get_all_occupations_cached()

            suggestions = [
                occ for occ in all_occupations
                if occ["soc_code"].startswith(normalized_display)
            ][:request.limit]

            return {
                "status": "success",
                "query_type": "code",
                "suggestions": suggestions
            }

        else:
            # ================================================================
            # STRATEGY 2: Job Title Search (MongoDB Text Index, ~10-20ms)
            # ================================================================

            mongo_client = get_oews_mongo_client()
            await mongo_client._ensure_initialized()

            try:
                # Use MongoDB text search with relevance scoring
                cursor = mongo_client.db.occupations.find(
                    {
                        "$text": {"$search": query},
                        "selectable": "T",
                        "occupation_code": {"$not": {"$regex": "^00"}}  # Exclude aggregate codes
                    },
                    {
                        "occupation_code": 1,
                        "occupation_name": 1,
                        "_id": 0,
                        "score": {"$meta": "textScore"}
                    }
                ).sort([("score", {"$meta": "textScore"})]).limit(request.limit)

                results = await cursor.to_list(length=None)

                suggestions = [
                    {
                        "soc_code": format_soc_code(doc["occupation_code"]),
                        "soc_title": doc["occupation_name"]
                    }
                    for doc in results
                ]

            except Exception as text_search_error:
                # Fallback: If text index doesn't exist, search in-memory cache
                print(f"⚠️ Text search failed (text index may not exist), using in-memory fallback: {text_search_error}")

                all_occupations = await get_all_occupations_cached()
                query_lower = query.lower()

                suggestions = [
                    occ for occ in all_occupations
                    if query_lower in occ["soc_title"].lower()
                ][:request.limit]

            return {
                "status": "success",
                "query_type": "title",
                "suggestions": suggestions
            }

    except Exception as e:
        print(f"❌ SOC hybrid search failed: {e}")
        import traceback
        traceback.print_exc()

        return {
            "status": "success",
            "suggestions": []
        }
