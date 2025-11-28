"""Application settings and configuration."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration from environment variables."""

    OPENROUTER_API_KEY: str
    OPENROUTER_MODEL: str = "openai/gpt-4o"
    OPENAI_API_KEY: str

    # LlamaCloud API for document extraction
    LLAMA_CLOUD_API_KEY: str

    # MongoDB configuration
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DATABASE: str = "testing"

    # CareerOneStop API (free gov API for wage data by SOC code)
    CAREERONESTOP_API_KEY: str = ""  # Register at careeronestop.org

    # BLS API (optional - CareerOneStop is easier)
    BLS_API_KEY: str = "73847c2940aa4d59ac8f5f3e77154520"

    # iDrive e2 configuration (S3-compatible storage, optional)
    IDRIVE_E2_ENDPOINT: str = ""
    IDRIVE_E2_ACCESS_KEY: str = ""
    IDRIVE_E2_SECRET_KEY: str = ""
    IDRIVE_E2_BUCKET: str = ""

    class Config:
        env_file = ".env"

        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
