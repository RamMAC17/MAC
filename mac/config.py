"""MAC configuration — loaded from .env file."""

from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    # ── App ───────────────────────────────────────────────
    mac_env: str = "development"
    mac_host: str = "0.0.0.0"
    mac_port: int = 8000
    mac_debug: bool = False
    mac_secret_key: str = "change-me"
    mac_cors_origins: str = '["http://localhost:3000","http://localhost:8000"]'

    # ── Database ──────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./mac.db"

    # ── Redis ─────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── JWT ───────────────────────────────────────────────
    jwt_secret_key: str = "change-me-jwt-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440  # 24h
    jwt_refresh_token_expire_days: int = 30

    # ── LiteLLM ───────────────────────────────────────────
    litellm_base_url: str = "http://localhost:4000"
    litellm_master_key: str = "sk-mac-litellm-key"

    # ── vLLM / OpenAI-compatible backend ─────────────────
    vllm_base_url: str = "http://localhost:11434"

    # ── Qdrant (RAG vector DB) ────────────────────────────
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "mac_documents"

    # ── SearXNG (web search) ──────────────────────────────
    searxng_url: str = "http://localhost:8888"

    # ── Rate Limits ───────────────────────────────────────
    rate_limit_requests_per_hour: int = 100
    rate_limit_tokens_per_day: int = 50000

    @property
    def cors_origins(self) -> List[str]:
        return json.loads(self.mac_cors_origins)

    @property
    def is_dev(self) -> bool:
        return self.mac_env == "development"

    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.database_url

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
