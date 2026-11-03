"""Application settings and configuration."""

from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration from environment variables."""

    OPENROUTER_API_KEY: str
    OPENROUTER_MODEL: str = "openai/gpt-4o"
    OPENAI_API_KEY: str
    CLAUDE_API_KEY: str
    CLAUDE_BASE_URL: str = "https://api.anthropic.com/v1"
    DEBUG_MODE:bool=False
    # LlamaCloud API for document extraction
    LLAMA_CLOUD_API_KEY: str

    # MongoDB configuration
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DATABASE: str = "testing"
    EXA_API_KEY:str=""

    # CareerOneStop API (free gov API for wage data by SOC code)
    CAREERONESTOP_API_KEY: str = ""  # Register at careeronestop.org

    # BLS API (optional - CareerOneStop is easier)
    BLS_API_KEY: str = "73847c2940aa4d59ac8f5f3e77154520"

    # iDrive e2 configuration (S3-compatible storage, optional)
    IDRIVE_E2_ENDPOINT: str = ""
    IDRIVE_E2_ACCESS_KEY: str = ""
    IDRIVE_E2_SECRET_KEY: str = ""
    IDRIVE_E2_BUCKET: str = ""

    # Pinecone configuration (for GSA labor category search)
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX_NAME: str = "gsa-labor-categories"

    # Help Center Pinecone index (separate from GSA)
    HELP_CENTER_PINECONE_INDEX_NAME: str = "help-center"

    # Redis (Celery broker/backend)
    REDIS_URL: str = "redis://localhost:6379"

    # Admin dashboard credentials (HTTP Basic Auth at /admin/users)
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "changeme"

    # SAM.gov API key (RFP Radar opportunity scanner).
    # Free key from sam.gov → Account Details → API Key (rotates every 90 days).
    # When empty, samgov_client raises a clear error; when set, all requests
    # use the documented keyed v2 endpoint at api.sam.gov/opportunities/v2.
    SAMGOV_API_KEY: str = ""

    # ── Authentication / JWT ─────────────────────────────────────────────
    # In production, use a secure random key
    SECRET_KEY: str = "your-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Deployment environment (drives cookie security defaults)
    ENVIRONMENT: str = "development"

    # ── Rate limiting (utils/rate_limit.py) ──────────────────────────────
    RATE_LIMIT_ENABLED: bool = True
    # Header the edge proxy sets to the real client IP, overwriting any value the
    # client sent. Railway's edge sets X-Real-IP; its X-Forwarded-For ends in an
    # edge address that changes per request, so keying on that never limits.
    # Empty = fall back to X-Forwarded-For with RATE_LIMIT_TRUSTED_PROXY_HOPS.
    RATE_LIMIT_CLIENT_IP_HEADER: str = "x-real-ip"
    # Fallback only: number of trusted proxies, read from the right of X-Forwarded-For.
    RATE_LIMIT_TRUSTED_PROXY_HOPS: int = 1

    # ── E2B code sandbox (utils/e2b_sandbox.py) ──────────────────────────
    # Model-written Python runs in an E2B microVM, one per chat session, never
    # in this process. Empty key = the Python tool is switched off.
    E2B_API_KEY: str = ""
    # Custom template built from backend/e2b.Dockerfile (document libraries +
    # LibreOffice). Empty = E2B's stock code-interpreter template.
    E2B_TEMPLATE_ID: str = ""
    # Absolute lifetime per resume; on expiry the box pauses instead of dying.
    E2B_SANDBOX_TIMEOUT_S: int = 1800
    # Pause this long after a chat turn ends, unless the box was used again.
    E2B_PAUSE_GRACE_S: int = 30
    E2B_EXEC_TIMEOUT_S: int = 180
    # Paused boxes unused this long are killed by the hourly reaper.
    E2B_SANDBOX_MAX_IDLE_DAYS: int = 7
    E2B_ALLOW_INTERNET: bool = False

    # ── Cookie configuration ─────────────────────────────────────────────
    COOKIE_DOMAIN: Optional[str] = None  # None = current domain
    # env var COOKIE_SAMESITE overrides the derived default (see property below)
    COOKIE_SAMESITE_OVERRIDE: Optional[str] = Field(default=None, alias="COOKIE_SAMESITE")
    COOKIE_ACCESS_TOKEN_NAME: str = "access_token"
    COOKIE_REFRESH_TOKEN_NAME: str = "refresh_token"

    # ── Frontend URL (CORS, email links) ─────────────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"

    # ── Email configuration ──────────────────────────────────────────────
    # Preferred: Resend HTTP API (no SMTP auth pain). Set RESEND_API_KEY and
    # `EmailService` will route through Resend. SMTP_* vars below remain a
    # fallback used only when RESEND_API_KEY is empty (mostly local dev).
    RESEND_API_KEY: str = ""
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = "noreply@priceiq.com"
    FROM_NAME: str = "PriceIQ"

    # ── Google OAuth ─────────────────────────────────────────────────────
    GOOGLE_CLIENT_ID: Optional[str] = None

    # ── Terms and Conditions ─────────────────────────────────────────────
    CURRENT_TERMS_VERSION: str = "1.0.0"

    @field_validator("COOKIE_DOMAIN", mode="before")
    @classmethod
    def _empty_cookie_domain_to_none(cls, v):
        # Treat an empty COOKIE_DOMAIN env value as "current domain"
        return v or None

    @property
    def COOKIE_SECURE(self) -> bool:
        """HTTPS-only cookies in production."""
        return self.ENVIRONMENT == "production"

    @property
    def COOKIE_SAMESITE(self) -> str:
        """Cross-origin cookies need "none" with secure=True; "lax" otherwise."""
        if self.COOKIE_SAMESITE_OVERRIDE:
            return self.COOKIE_SAMESITE_OVERRIDE
        return "none" if self.COOKIE_SECURE else "lax"

    class Config:
        env_file = ".env"

        env_file_encoding = "utf-8"
        extra = "ignore"
        populate_by_name = True


settings = Settings()
