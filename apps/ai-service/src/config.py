from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # Gemini is the sole AI provider.
    #  - gemini_api_key (KEY 1): conversation (Gemini 3 Live) + report/scoring +
    #    body-language vision (Gemini 3.1 Flash Lite).
    #  - gemini_prompt_api_key (KEY 2): used ONLY to redesign a user's own prompt
    #    into an optimised agent prompt (Gemini 3.1 Flash Lite).
    # Model ids are env-overridable — adjust if Google's exact id strings differ.
    gemini_api_key: str = ""
    gemini_prompt_api_key: str = ""
    gemini_live_model: str = "models/gemini-3.1-flash-live-preview"  # conversation (Live API, key 1)
    gemini_flash_model: str = "gemini-3.1-flash-lite"      # reports + scoring + vision (key 1)
    gemini_prompt_model: str = "gemini-3.1-flash-lite"     # prompt redesign (key 2)
    gemini_assistant_model: str = "models/gemini-3.1-flash-live-preview"  # site assistant (Live API, key 2)

    # API gateway (for internal transcript/score/body-language persistence)
    api_gateway_url: str = "http://localhost:4000"

    # Internal service-to-service key (MUST be set in env; empty = reject all)
    internal_api_key: str = ""

    # Secret used to verify the short-lived signed WebSocket ticket issued by the
    # API gateway. MUST match the gateway's WS_TICKET_SECRET. Empty = reject all.
    ws_ticket_secret: str = ""

    # Metrics protection
    metrics_api_key: str = ""
    metrics_allowed_cidrs: list[str] = ["127.0.0.1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:4000"]

    class Config:
        env_file = ("../../.env", ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
