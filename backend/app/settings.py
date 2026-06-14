"""Application settings and configuration."""

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

    # SAM.gov API key (RFP Radar opportunity scanner).
    # Free key from sam.gov → Account Details → API Key (rotates every 90 days).
    # When empty, samgov_client raises a clear error; when set, all requests
    # use the documented keyed v2 endpoint at api.sam.gov/opportunities/v2.
    SAMGOV_API_KEY: str = ""

    class Config:
        env_file = ".env"

        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
