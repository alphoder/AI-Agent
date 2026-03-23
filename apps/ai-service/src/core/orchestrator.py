"""Session Orchestrator.

Manages the full lifecycle of a training session:
- Pre-warms avatar session
- Initializes STT WebSocket
- Loads conversation history from Redis
- Processes audio through the critical path:
  STT -> Guardrails -> RAG -> LLM -> Guardrails -> Avatar
"""
from __future__ import annotations

import time
import asyncio
import json
from typing import Callable, Awaitable
import httpx
import redis.asyncio as aioredis
import structlog

from src.config import settings
from src.core.stt import DeepgramSTTClient
from src.core.llm import LLMClient
from src.core.tts import get_tts_client  # GROQ_SWAP: TTS abstraction
from src.core.rag import RAGRetriever
from src.core.guardrails import GuardrailsEngine
from src.core.avatar import get_avatar_provider
from src.metrics import (
    pipeline_latency_seconds,
    pipeline_errors_total,
    active_sessions_gauge,
    sessions_started_total,
    sessions_ended_total,
    turns_total,
    guardrail_triggers_total,
)

logger = structlog.get_logger(__name__)


class SessionOrchestrator:
    """Manages a training session's real-time pipeline."""

    def __init__(
        self,
        session_id: str,
        tenant_id: str,
        scenario_config: dict,
        persona_config: dict,
        avatar_provider: str,
        on_data_event: Callable[[str, dict], Awaitable[None]] | None = None,
    ):
        self.session_id = session_id
        self.tenant_id = tenant_id
        self.scenario = scenario_config
        self.persona = persona_config
        self.on_data_event = on_data_event

        # Initialize components
        self.stt = DeepgramSTTClient(
            on_transcript_interim=self._on_transcript_interim,
            on_transcript_final=self._on_transcript_final,
        )
        self.llm = LLMClient()
        self.tts = get_tts_client()  # GROQ_SWAP: TTS provider based on config
        self.rag = RAGRetriever()
        self.guardrails = GuardrailsEngine(persona_config.get("guardrails", {}))
        self.avatar_provider = get_avatar_provider(
            avatar_provider,
            settings.simli_api_key if avatar_provider == "simli" else settings.heygen_api_key,
        )

        # Redis for conversation history
        self.redis = aioredis.from_url(settings.redis_url)

        # State
        self.turn_number = 0
        self.avatar_session_id: str | None = None
        self._active = False
        self._history: list[dict] = []

        # Latency tracking
        self._latency: dict = {}

        # Shared httpx client for transcript persistence (connection pooling)
        self._http_client: httpx.AsyncClient | None = None

    async def start(self):
        """Start the session: pre-warm avatar, init STT, load history, send opening message."""
        logger.info("session_starting", session_id=self.session_id)
        self._active = True

        # Pre-warm avatar session (saves ~500ms)
        try:
            avatar_result = await self.avatar_provider.create_session(
                self.persona.get("provider_avatar_id", "")
            )
            self.avatar_session_id = avatar_result.get("session_id")
            logger.info("avatar_session_created", avatar_session_id=self.avatar_session_id)
        except Exception as e:
            logger.error("avatar_prewarm_failed", error=str(e))
            pipeline_errors_total.labels(stage="avatar_prewarm").inc()

        # Init Deepgram STT
        await self.stt.connect(self.session_id)

        # Load history from Redis
        history_key = f"session:{self.session_id}:history"
        history_data = await self.redis.lrange(history_key, 0, -1)
        self._history = [json.loads(h) for h in history_data]

        # Send opening message if configured
        opening_message = self.scenario.get("opening_message")
        if opening_message:
            await self._send_avatar_text(opening_message)
            await self._append_history("avatar", opening_message)
            if self.on_data_event:
                await self.on_data_event("TRANSCRIPT_FINAL", {
                    "role": "avatar",
                    "content": opening_message,
                    "turn_number": self.turn_number,
                })

        sessions_started_total.inc()
        active_sessions_gauge.labels(tenant_id=self.tenant_id).inc()
        logger.info("session_started", session_id=self.session_id)

    async def process_audio(self, audio_data: bytes):
        """Forward audio to STT."""
        if not self._active:
            return
        await self.stt.send_audio(audio_data)

    async def _on_transcript_interim(self, text: str):
        """Handle interim STT transcripts."""
        if self.on_data_event:
            await self.on_data_event("TRANSCRIPT_INTERIM", {
                "content": text,
                "role": "learner",
            })

    async def _on_transcript_final(self, text: str, confidence: float):
        """CRITICAL PATH: Process final transcript through the pipeline.

        Target: end-to-end under 2 seconds P95.
        """
        if not self._active:
            return

        e2e_start = time.time()
        self.turn_number += 1
        turns_total.inc()

        logger.info(
            "processing_utterance",
            text=text[:100],
            confidence=confidence,
            turn=self.turn_number,
        )

        # Notify UI of final learner transcript
        if self.on_data_event:
            await self.on_data_event("TRANSCRIPT_FINAL", {
                "role": "learner",
                "content": text,
                "turn_number": self.turn_number,
                "stt_confidence": confidence,
            })

        # 1. Input guardrails (<10ms target)
        guardrail_start = time.time()
        is_safe, violation = self.guardrails.check_input(text)
        guardrail_duration = (time.time() - guardrail_start) * 1000

        if not is_safe:
            guardrail_triggers_total.labels(direction="input").inc()
            logger.warn("input_guardrail_triggered", violation=violation, turn=self.turn_number)
            fallback = self.guardrails.get_safe_fallback()
            await self._send_avatar_text(fallback)
            await self._append_history("learner", text)
            await self._append_history("avatar", fallback, guardrail_triggered=True)
            if self.on_data_event:
                await self.on_data_event("GUARDRAIL_TRIGGERED", {"violation": violation})
            return

        # 2. RAG vector search (<100ms target)
        rag_context = None
        rag_start = time.time()
        if self.persona.get("rag_enabled"):
            chunks = await self.rag.retrieve(
                query=text,
                tenant_id=self.tenant_id,
                persona_id=self.persona["id"],
                top_k=self.persona.get("rag_top_k", 5),
                similarity_threshold=self.persona.get("rag_similarity_threshold", 0.70),
            )
            rag_context = self.rag.format_context(chunks) if chunks else None
        rag_duration = (time.time() - rag_start) * 1000

        # 3. Construct LLM prompt
        system_prompt = self.llm.assemble_prompt(
            persona_prompt=self.persona.get("system_prompt", ""),
            guardrails=self.persona.get("guardrails", {}),
            scenario_context=self.scenario.get("opening_context", ""),
            rag_context=rag_context,
            blocked_topics=self.persona.get("guardrails", {}).get("blocked_topics", []),
        )

        # 4. Buffer-then-send: collect full LLM response, run output guardrails,
        #    THEN send to avatar. This adds ~500ms latency but guarantees the user
        #    never hears unsafe content (fixes C4 — chunks previously streamed
        #    before guardrail check).
        await self._append_history("learner", text)
        full_response = ""
        chunks: list[str] = []
        llm_start = time.time()
        llm_ttft = None

        async for chunk in self.llm.generate_response(
            system_prompt=system_prompt,
            conversation_history=self._history,
            current_utterance=text,
            rag_context=rag_context,
            temperature=self.persona.get("temperature", 0.7),
            max_tokens=self.persona.get("guardrails", {}).get("max_response_tokens", 256),
        ):
            if llm_ttft is None:
                llm_ttft = (time.time() - llm_start) * 1000
            chunks.append(chunk)
            full_response += chunk + " "

        llm_total = (time.time() - llm_start) * 1000

        # Output guardrail: check the complete response BEFORE sending to avatar.
        history_content = full_response.strip()
        is_safe_output, output_violation = self.guardrails.check_output(history_content)
        if not is_safe_output:
            guardrail_triggers_total.labels(direction="output").inc()
            logger.warn(
                "output_guardrail_triggered",
                violation=output_violation,
                turn=self.turn_number,
            )
            safe_fallback = self.guardrails.get_safe_fallback()
            history_content = safe_fallback
            chunks = [safe_fallback]
            if self.on_data_event:
                await self.on_data_event("GUARDRAIL_TRIGGERED", {"violation": output_violation})

        # Now send verified-safe content to avatar
        if self.on_data_event:
            await self.on_data_event("AVATAR_SPEAKING", {})

        for chunk in chunks:
            await self._send_avatar_text(chunk)

        # 5. Append avatar response to history (safe fallback if guardrail fired)
        await self._append_history(
            "avatar",
            history_content,
            guardrail_triggered=not is_safe_output,
        )

        if self.on_data_event:
            await self.on_data_event("AVATAR_IDLE", {})
            await self.on_data_event("TRANSCRIPT_FINAL", {
                "role": "avatar",
                "content": history_content,
                "turn_number": self.turn_number,
            })

        # 6. Record latency
        e2e_total = (time.time() - e2e_start) * 1000
        self._latency = {
            "turn": self.turn_number,
            "guardrail_ms": round(guardrail_duration, 2),
            "rag_ms": round(rag_duration, 2),
            "llm_ttft_ms": round(llm_ttft or 0, 2),
            "llm_total_ms": round(llm_total, 2),
            "total_e2e_ms": round(e2e_total, 2),
        }
        logger.info("turn_latency", **self._latency)

        # Observe Prometheus latency histograms (values in seconds)
        pipeline_latency_seconds.labels(stage="guardrails").observe(guardrail_duration / 1000)
        pipeline_latency_seconds.labels(stage="rag").observe(rag_duration / 1000)
        pipeline_latency_seconds.labels(stage="llm_ttft").observe((llm_ttft or 0) / 1000)
        pipeline_latency_seconds.labels(stage="llm_total").observe(llm_total / 1000)
        pipeline_latency_seconds.labels(stage="e2e").observe(e2e_total / 1000)

        # 7. Persist transcript async (don't block pipeline)
        asyncio.create_task(self._persist_transcript(text, history_content, confidence))

    async def _send_avatar_text(self, text: str):
        """Send text to avatar for lip-synced speech.

        GROQ_SWAP: When using Deepgram TTS, generates audio first then sends
        audio bytes via data event (for Simli Compose lip-sync on client).
        Falls back to avatar provider's send_text() for provider-managed TTS.
        """
        if not text.strip():
            return

        try:
            # GROQ_SWAP: Generate TTS audio and send via data event
            audio_bytes = await self.tts.synthesize(text)
            if audio_bytes and self.on_data_event:
                import base64
                await self.on_data_event("TTS_AUDIO", {
                    "data": base64.b64encode(audio_bytes).decode(),
                    "text": text,
                })
            elif self.avatar_session_id:
                # Fallback: send text directly to avatar provider
                await self.avatar_provider.send_text(self.avatar_session_id, text)
        except Exception as e:
            logger.error("avatar_send_failed", error=str(e))
            pipeline_errors_total.labels(stage="avatar_send").inc()

    async def _append_history(
        self, role: str, content: str, guardrail_triggered: bool = False
    ):
        """Append to Redis conversation history (max 10 turns, 2hr TTL)."""
        entry = {
            "role": role,
            "content": content,
            "timestamp": time.time(),
            "turn_number": self.turn_number,
            "guardrail_triggered": guardrail_triggered,
        }
        self._history.append(entry)

        # Keep only last 10 turns
        if len(self._history) > 10:
            self._history = self._history[-10:]

        history_key = f"session:{self.session_id}:history"
        await self.redis.rpush(history_key, json.dumps(entry))
        await self.redis.ltrim(history_key, -10, -1)
        await self.redis.expire(history_key, 7200)  # 2hr TTL

    async def _get_http_client(self) -> httpx.AsyncClient:
        """Lazy-init shared httpx client for connection pooling."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                base_url=settings.api_gateway_url,
                headers={
                    "Content-Type": "application/json",
                    "X-Internal-Key": settings.internal_api_key,
                },
                timeout=5.0,
            )
        return self._http_client

    async def _persist_transcript(self, learner_text: str, avatar_text: str, confidence: float):
        """Async Postgres persistence via API call (uses shared httpx client)."""
        try:
            client = await self._get_http_client()
            await client.post(
                "/api/internal/transcripts",
                json={
                    "session_id": self.session_id,
                    "turn_number": self.turn_number,
                    "learner_content": learner_text,
                    "avatar_content": avatar_text,
                    "stt_confidence": confidence,
                    "latency": self._latency,
                },
            )
        except Exception as e:
            logger.error("persist_transcript_failed", error=str(e))
            pipeline_errors_total.labels(stage="persist_transcript").inc()

    async def end(self):
        """End the session: close STT, close avatar, cleanup Redis."""
        self._active = False
        logger.info("session_ending", session_id=self.session_id)

        await self.stt.disconnect()

        if self.avatar_session_id:
            try:
                await self.avatar_provider.close_session(self.avatar_session_id)
            except Exception as e:
                logger.error("avatar_close_failed", error=str(e))
                pipeline_errors_total.labels(stage="avatar_close").inc()

        if self.on_data_event:
            await self.on_data_event("SESSION_END", {
                "session_id": self.session_id,
                "total_turns": self.turn_number,
            })

        sessions_ended_total.inc()
        active_sessions_gauge.labels(tenant_id=self.tenant_id).dec()

        # Close shared HTTP client
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()

        await self.redis.aclose()
        logger.info("session_ended", session_id=self.session_id, turns=self.turn_number)
