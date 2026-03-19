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
import redis.asyncio as aioredis
import structlog

from src.config import settings
from src.core.stt import DeepgramSTTClient
from src.core.llm import LLMClient
from src.core.rag import RAGRetriever
from src.core.guardrails import GuardrailsEngine
from src.core.avatar import get_avatar_provider

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

        # Latency tracking
        self._latency: dict = {}

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

        # 4. Stream LLM response with chunk buffering + per-chunk guardrails + avatar send
        await self._append_history("learner", text)
        full_response = ""
        llm_start = time.time()
        llm_ttft = None

        if self.on_data_event:
            await self.on_data_event("AVATAR_SPEAKING", {})

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

            # Per-chunk output guardrails
            is_safe_output, output_violation = self.guardrails.check_output(chunk)
            if not is_safe_output:
                logger.warn("output_guardrail_triggered", violation=output_violation)
                chunk = self.guardrails.get_safe_fallback()

            # Send chunk to avatar
            await self._send_avatar_text(chunk)
            full_response += chunk + " "

        llm_total = (time.time() - llm_start) * 1000

        # 5. Append avatar response to history
        await self._append_history("avatar", full_response.strip())

        if self.on_data_event:
            await self.on_data_event("AVATAR_IDLE", {})
            await self.on_data_event("TRANSCRIPT_FINAL", {
                "role": "avatar",
                "content": full_response.strip(),
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

        # 7. Persist transcript async (don't block pipeline)
        asyncio.create_task(self._persist_transcript(text, full_response.strip(), confidence))

    async def _send_avatar_text(self, text: str):
        """Send text to avatar for lip-synced speech."""
        if self.avatar_session_id:
            try:
                await self.avatar_provider.send_text(self.avatar_session_id, text)
            except Exception as e:
                logger.error("avatar_send_failed", error=str(e))

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

    async def _persist_transcript(self, learner_text: str, avatar_text: str, confidence: float):
        """Async Postgres persistence via API call."""
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{settings.api_gateway_url}/api/internal/transcripts",
                    json={
                        "session_id": self.session_id,
                        "turn_number": self.turn_number,
                        "learner_content": learner_text,
                        "avatar_content": avatar_text,
                        "stt_confidence": confidence,
                        "latency": self._latency,
                    },
                    timeout=5.0,
                )
        except Exception as e:
            logger.error("persist_transcript_failed", error=str(e))

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

        if self.on_data_event:
            await self.on_data_event("SESSION_END", {
                "session_id": self.session_id,
                "total_turns": self.turn_number,
            })

        await self.redis.aclose()
        logger.info("session_ended", session_id=self.session_id, turns=self.turn_number)
