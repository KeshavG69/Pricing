"""
FastAPI server for government contractor pricing system.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from routers import pricing, auth, excel_export

# Create FastAPI app
app = FastAPI(
    title="Government Contractor Pricing API",
    description="API for pricing government contractor labor categories using BLS OEWS wage data",
    version="1.0.0"
)

# Mount static files
static_path = Path(__file__).parent.parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api", tags=["authentication"])
app.include_router(pricing.router, prefix="/api/pricing", tags=["pricing"])
app.include_router(excel_export.router, prefix="/api/excel", tags=["excel-export"])


@app.get("/")
async def root():
    """Root endpoint - serve the UI."""
    static_path = Path(__file__).parent.parent / "static" / "index.html"
    if static_path.exists():
        return FileResponse(str(static_path))
    return {
        "message": "Government Contractor Pricing API",
        "docs": "/docs",
        "version": "1.0.0",
        "ui": "/static/index.html"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
