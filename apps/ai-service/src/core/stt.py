"""Deepgram Speech-to-Text client.

Handles real-time audio transcription via WebSocket connection.
Uses nova-2 model with opus encoding at 16kHz mono.
"""
from __future__ import annotations

import asyncio
import re
import time
from collections import deque
from typing import Callable, Awaitable
import structlog
from deepgram import DeepgramClient

try:
    from deepgram import LiveTranscriptionEvents, LiveOptions
except ImportError:
    # Deepgram SDK v6+ moved these classes; provide stubs so the module
    # can be imported even when the installed version differs from what
    # the code was originally written against.
    LiveTranscriptionEvents = None  # type: ignore[assignment, misc]
    LiveOptions = None  # type: ignore[assignment, misc]

from src.config import settings

logger = structlog.get_logger(__name__)

# --- PII redaction patterns ---
PII_PATTERNS = [
    (re.compile(r'\b[\w.-]+@[\w.-]+\.\w+\b'), '[EMAIL]'),
    (re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'), '[PHONE]'),
    (re.compile(r'\b\d{3}[-]?\d{2}[-]?\d{4}\b'), '[SSN]'),
]


def redact_pii(text: str) -> str:
    """Replace common PII patterns (emails, phones, SSNs) with placeholders."""
    for pattern, replacement in PII_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


class DeepgramSTTClient:
    """Real-time speech-to-text using Deepgram nova-2."""

    def __init__(
        self,
        on_transcript_interim: Callable[[str], Awaitable[None]] | None = None,
        on_transcript_final: Callable[[str, float], Awaitable[None]] | None = None,
    ):
        self._client: DeepgramClient | None = None
        self.connection = None
        self.session_id: str | None = None
        self.on_transcript_interim = on_transcript_interim
        self.on_transcript_final = on_transcript_final

        # Config
        self.model = "nova-2"
        self.encoding = "opus"
        self.sample_rate = 16000
        self.channels = 1
        self.endpointing_ms = 300
        self.interim_results = True
        self.smart_format = True

        # Auto-reconnect state
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 5
        self._audio_buffer: deque = deque(maxlen=5 * 16000 * 2)  # 5s ring buffer
        self._last_audio_time = 0.0
        self._silence_timeout = 10.0  # Force finalize after 10s silence
        self._connected = False

    @property
    def client(self) -> DeepgramClient:
        if self._client is None:
            self._client = DeepgramClient(settings.deepgram_api_key)
        return self._client

    async def connect(self, session_id: str):
        """Establish WebSocket connection to Deepgram."""
        self.session_id = session_id
        logger.info("stt_connecting", session_id=session_id)

        options = LiveOptions(
            model=self.model,
            encoding=self.encoding,
            sample_rate=self.sample_rate,
            channels=self.channels,
            endpointing=self.endpointing_ms,
            interim_results=self.interim_results,
            smart_format=self.smart_format,
            language="en",
        )

        self.connection = self.client.listen.asynclive.v("1")

        # Register event handlers
        self.connection.on(LiveTranscriptionEvents.Transcript, self._on_transcript)
        self.connection.on(LiveTranscriptionEvents.Error, self._on_error)
        self.connection.on(LiveTranscriptionEvents.Close, self._on_close)

        await self.connection.start(options)
        self._connected = True
        self._reconnect_attempts = 0
        self._last_audio_time = time.time()

        logger.info("stt_connected", session_id=session_id)

        # Flush any audio buffered during disconnect
        if len(self._audio_buffer) > 0:
            buffered = bytes(self._audio_buffer)
            self._audio_buffer.clear()
            logger.info(
                "stt_flushing_buffer",
                buffered_bytes=len(buffered),
                session_id=session_id,
            )
            try:
                await self.connection.send(buffered)
            except Exception as e:
                logger.error("stt_buffer_flush_failed", error=str(e))

        # Start silence monitor
        asyncio.create_task(self._monitor_silence())

    async def _on_transcript(self, _self, result, **kwargs):
        """Handle transcript events from Deepgram."""
        try:
            transcript = result.channel.alternatives[0].transcript
            if not transcript or len(transcript.strip()) < 3:
                return  # Ignore transcripts under 3 characters

            confidence = result.channel.alternatives[0].confidence
            is_final = result.is_final

            if is_final and self.on_transcript_final:
                # Optionally redact PII before passing downstream
                if settings.pii_redaction_enabled:
                    transcript = redact_pii(transcript)

                logger.info(
                    "stt_final",
                    text=transcript[:100],
                    confidence=confidence,
                    session_id=self.session_id,
                )
                await self.on_transcript_final(transcript, confidence)
            elif not is_final and self.on_transcript_interim:
                await self.on_transcript_interim(transcript)
        except Exception as e:
            logger.error("stt_transcript_error", error=str(e))

    async def _on_error(self, _self, error, **kwargs):
        """Handle errors from Deepgram."""
        logger.error("stt_error", error=str(error), session_id=self.session_id)

    async def _on_close(self, _self, close, **kwargs):
        """Handle connection close - attempt reconnection."""
        self._connected = False
        logger.warn("stt_closed", session_id=self.session_id)

        if self._reconnect_attempts < self._max_reconnect_attempts:
            await self._reconnect()

    async def _reconnect(self):
        """Auto-reconnect with exponential backoff (100ms to 2s)."""
        self._reconnect_attempts += 1
        delay = min(0.1 * (2 ** self._reconnect_attempts), 2.0)

        logger.info(
            "stt_reconnecting",
            attempt=self._reconnect_attempts,
            delay=delay,
            session_id=self.session_id,
        )

        await asyncio.sleep(delay)

        try:
            await self.connect(self.session_id or "")
        except Exception as e:
            logger.error("stt_reconnect_failed", error=str(e))
            if self._reconnect_attempts < self._max_reconnect_attempts:
                await self._reconnect()

    async def send_audio(self, audio_data: bytes):
        """Send audio chunk to Deepgram."""
        if not self._connected or not self.connection:
            self._audio_buffer.extend(audio_data)
            return

        self._last_audio_time = time.time()
        await self.connection.send(audio_data)

    async def _monitor_silence(self):
        """Force-finalize after 10s silence."""
        while self._connected:
            await asyncio.sleep(1)
            if time.time() - self._last_audio_time > self._silence_timeout:
                if self.connection and self._connected:
                    logger.info("stt_silence_finalize", session_id=self.session_id)
                    # Send keepalive to prevent timeout
                    try:
                        await self.connection.keep_alive()
                    except Exception:
                        pass

    async def disconnect(self):
        """Close WebSocket connection."""
        self._connected = False
        if self.connection:
            try:
                await self.connection.finish()
            except Exception:
                pass
        logger.info("stt_disconnected", session_id=self.session_id)
