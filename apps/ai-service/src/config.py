from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Deepgram
    deepgram_api_key: str = ""

    # Avatar providers
    simli_api_key: str = ""
    heygen_api_key: str = ""

    # Pinecone
    pinecone_api_key: str = ""
    pinecone_index: str = "avatar-platform"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # LiveKit
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_url: str = "ws://localhost:7880"

    # S3
    s3_bucket: str = "avatar-platform"
    s3_region: str = "us-east-1"
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"

    # API Gateway
    api_gateway_url: str = "http://localhost:4000"

    # PII redaction
    pii_redaction_enabled: bool = False

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:4000"]

    # Internal service-to-service authentication key (MUST be set in env; empty = reject all)
    internal_api_key: str = ""

    # Internal metrics key (set in env for production)
    metrics_api_key: str = ""
    metrics_allowed_cidrs: list[str] = ["127.0.0.1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
