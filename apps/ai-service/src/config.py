from __future__ import annotations

from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode


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
    # Models verified against the API key (ListModels + live setup probes):
    #   - practice call: gemini-2.5-flash-native-audio — same price as flash-live but
    #     tuned for pacing/naturalness/mood, so the customer's voice speeds up, slows
    #     down and shows interest with the emotion of the line. Tools + transcription
    #     + all 30 voices verified compatible.
    #   - assistant (Bixy): flash-live (cheap; slated to move to a flash-lite cascade)
    #   - scoring/prompt/vision: gemini-3.1-flash-lite
    # REVERTED to flash-live: native-audio threw "stream error" mid-call under real
    # audio streaming. Re-test native-audio properly before switching back.
    gemini_live_model: str = "models/gemini-3.1-flash-live-preview"  # conversation (Live API)
    gemini_flash_model: str = "gemini-3.5-flash-lite"      # reports + scoring + vision (key 1)
    gemini_prompt_model: str = "gemini-3.5-flash-lite"     # prompt redesign (key 2)
    # Scenario authoring runs on a stronger model: it writes a persona, an
    # opening line and a whole rubric in one pass. It THINKS before answering
    # (hundreds of thought tokens), so give it a generous output budget or it
    # returns an empty candidate.
    gemini_scenario_model: str = "gemini-3.6-flash"        # scenario authoring
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

    # Browser origins allowed to open the WS relays. Loopback hosts are always
    # allowed (see core/origins.py); set CORS_ORIGINS (comma-separated) in
    # production to add the deployed web origin, e.g. the Vercel domain.
    # NoDecode: take the raw CORS_ORIGINS string as-is (pydantic-settings would
    # otherwise JSON-decode a list-typed env var and crash on a plain string);
    # the validator below splits it on commas.
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000", "http://localhost:4000",
        "http://127.0.0.1:3000", "http://127.0.0.1:4000",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v):
        # Accept a comma-separated string from the CORS_ORIGINS env var.
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    class Config:
        env_file = ("../../.env", ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
