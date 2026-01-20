"""
FastAPI server for government contractor pricing system.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from routers import pricing, auth, excel_export, proposals, organizations, invitations, workspace, soc, company_repository, billing, stripe_webhooks, terms, help_center
from auth.config import FRONTEND_URL
from app.startup import startup_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI.

    Startup: Pre-warm expensive clients in background (non-blocking)
    Shutdown: Cleanup resources
    """
    # Startup: Pre-warm clients in background
    # Using create_task to not block server startup
    asyncio.create_task(startup_manager.prewarm_all_clients())

    yield

    # Shutdown: Close MongoDB connections
    from auth.database import close_mongodb_client
    close_mongodb_client()

    # Close OEWS MongoDB client if initialized
    from client.oews_mongodb import _oews_mongo_client
    if _oews_mongo_client:
        await _oews_mongo_client.close()


# Create FastAPI app with lifespan
app = FastAPI(
    title="Government Contractor Pricing API",
    description="API for pricing government contractor labor categories using BLS OEWS wage data",
    version="1.0.0",
    lifespan=lifespan
)

# Add GZip compression middleware (compress responses > 1KB)
# This significantly reduces network payload for large JSON responses
app.add_middleware(GZipMiddleware, minimum_size=1000)



# Configure CORS - IMPORTANT: Specific origin required for cookies
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Specific origin required for allow_credentials=True
    allow_credentials=True,  # Required for cookies
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Include routers
app.include_router(auth.router, prefix="/api", tags=["authentication"])
app.include_router(terms.router, tags=["terms"])
app.include_router(organizations.router, tags=["organizations"])
app.include_router(invitations.router, tags=["invitations"])
app.include_router(workspace.router, tags=["workspace"])
app.include_router(proposals.router, prefix="/api", tags=["proposals"])
app.include_router(pricing.router, prefix="/api/pricing", tags=["pricing"])
app.include_router(excel_export.router, prefix="/api/excel", tags=["excel-export"])
app.include_router(soc.router, prefix="/api", tags=["soc"])
app.include_router(company_repository.router, tags=["company-repository"])
app.include_router(billing.router, tags=["billing"])
app.include_router(stripe_webhooks.router, tags=["webhooks"])
app.include_router(help_center.router, tags=["help-center"])


@app.get("/")
async def root():
    """Root endpoint - serve the UI."""
    return {
        "message": "Government Contractor Pricing API",
        "docs": "/docs",
        "version": "1.0.0",
       
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/api/warmup-status")
async def warmup_status():
    """
    Get pre-warming status for all clients.

    Returns:
        Dict with overall status and per-client timing details
    """
    return startup_manager.get_warmup_status()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
