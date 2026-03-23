"""Text-to-Speech client abstraction.

GROQ_SWAP: Supports OpenAI TTS and Deepgram Aura TTS.
To revert: set TTS_PROVIDER=openai in .env

Deepgram Aura voices:
  - aura-asteria-en (female, default)
  - aura-orion-en (male)
  - aura-luna-en (female, soft)
  - aura-arcas-en (male, deep)
"""
from __future__ import annotations

from typing import Protocol
import httpx
import structlog

from src.config import settings

logger = structlog.get_logger(__name__)


class TTSClientInterface(Protocol):
    """Protocol for TTS providers."""

    async def synthesize(self, text: str) -> bytes:
        """Convert text to PCM16 audio bytes at 16kHz."""
        ...


class DeepgramTTSClient:
    """Deepgram Aura TTS — returns linear16 PCM audio.

    GROQ_SWAP: Free alternative to OpenAI TTS.
    Uses Deepgram's $200 free credits (shared with STT).
    """

    def __init__(self, model: str | None = None):
        self.model = model or settings.deepgram_tts_model
        self.api_key = settings.deepgram_api_key
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url="https://api.deepgram.com/v1",
                headers={
                    "Authorization": f"Token {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=15.0,
            )
        return self._client

    async def synthesize(self, text: str) -> bytes:
        """Convert text to PCM16 audio via Deepgram Aura."""
        if not text.strip():
            return b""

        try:
            response = await self.client.post(
                f"/speak?model={self.model}&encoding=linear16&sample_rate=16000",
                json={"text": text},
            )
            response.raise_for_status()
            audio_bytes = response.content
            logger.debug(
                "deepgram_tts_complete",
                text_len=len(text),
                audio_bytes=len(audio_bytes),
            )
            return audio_bytes
        except Exception as e:
            logger.error("deepgram_tts_error", error=str(e), text=text[:50])
            return b""

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None


class OpenAITTSClient:
    """OpenAI TTS — returns audio via OpenAI's speech endpoint.

    Used when TTS_PROVIDER=openai (default, requires funded OpenAI key).
    """

    def __init__(self, voice: str = "nova"):
        self.voice = voice
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url="https://api.openai.com/v1",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                timeout=15.0,
            )
        return self._client

    async def synthesize(self, text: str) -> bytes:
        """Convert text to PCM16 audio via OpenAI TTS."""
        if not text.strip():
            return b""

        try:
            response = await self.client.post(
                "/audio/speech",
                json={
                    "model": "tts-1",
                    "input": text,
                    "voice": self.voice,
                    "response_format": "pcm",
                },
            )
            response.raise_for_status()
            return response.content
        except Exception as e:
            logger.error("openai_tts_error", error=str(e), text=text[:50])
            return b""

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None


def get_tts_client() -> TTSClientInterface:
    """Factory: returns TTS client based on config.

    GROQ_SWAP: Set TTS_PROVIDER=deepgram for free Deepgram Aura TTS.
    Set TTS_PROVIDER=openai to use OpenAI TTS (requires funded key).
    """
    if settings.tts_provider == "deepgram" and settings.deepgram_api_key:
        logger.info("tts_provider_init", provider="deepgram", model=settings.deepgram_tts_model)
        return DeepgramTTSClient()
    else:
        logger.info("tts_provider_init", provider="openai")
        return OpenAITTSClient()
