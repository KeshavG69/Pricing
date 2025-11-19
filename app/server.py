"""
FastAPI server for government contractor pricing system.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import pricing

# Create FastAPI app
app = FastAPI(
    title="Government Contractor Pricing API",
    description="API for pricing government contractor labor categories using BLS OEWS wage data",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(pricing.router, prefix="/api/pricing", tags=["pricing"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Government Contractor Pricing API",
        "docs": "/docs",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
