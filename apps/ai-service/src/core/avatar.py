"""Avatar provider abstraction.

Supports Simli (WebRTC) and HeyGen (LiveAvatar API).
"""
from typing import Protocol, runtime_checkable
import asyncio
import httpx
import structlog

logger = structlog.get_logger(__name__)


@runtime_checkable
class AvatarProviderInterface(Protocol):
    """Protocol for avatar providers."""

    async def create_avatar(self, image_url: str, config: dict) -> dict: ...
    async def get_avatar_status(self, avatar_id: str) -> dict: ...
    async def delete_avatar(self, avatar_id: str) -> bool: ...
    async def create_session(self, avatar_id: str) -> dict: ...
    async def send_text(self, session_id: str, text: str) -> None: ...
    async def close_session(self, session_id: str) -> None: ...


class SimliProvider:
    """Simli avatar provider - REST for creation, WebRTC for sessions."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.simli.ai/v1"
        self.retry_delays = [1, 2, 4]  # exponential backoff
        self.creation_timeout = 30  # seconds

    async def _request(
        self, method: str, path: str, **kwargs
    ) -> httpx.Response:
        """Make HTTP request with retry logic."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        last_error = None

        for attempt, delay in enumerate(self.retry_delays):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.request(
                        method,
                        f"{self.base_url}{path}",
                        headers=headers,
                        **kwargs,
                    )
                    response.raise_for_status()
                    return response
            except (httpx.HTTPStatusError, httpx.ConnectError) as e:
                last_error = e
                logger.warn(
                    "simli_request_retry",
                    attempt=attempt + 1,
                    delay=delay,
                    error=str(e),
                )
                await asyncio.sleep(delay)

        raise last_error  # type: ignore

    async def create_avatar(self, image_url: str, config: dict) -> dict:
        """Create avatar from source image via Simli REST API."""
        logger.info("simli_create_avatar", image_url=image_url[:50])
        response = await self._request(
            "POST",
            "/avatars",
            json={"image_url": image_url, "config": config},
        )
        return response.json()

    async def get_avatar_status(self, avatar_id: str) -> dict:
        """Poll avatar creation status."""
        response = await self._request("GET", f"/avatars/{avatar_id}")
        return response.json()

    async def delete_avatar(self, avatar_id: str) -> bool:
        """Delete an avatar from Simli."""
        try:
            await self._request("DELETE", f"/avatars/{avatar_id}")
            return True
        except Exception as e:
            logger.error("simli_delete_failed", avatar_id=avatar_id, error=str(e))
            return False

    async def create_session(self, avatar_id: str) -> dict:
        """Create a WebRTC session for live avatar interaction."""
        logger.info("simli_create_session", avatar_id=avatar_id)
        response = await self._request(
            "POST",
            "/sessions",
            json={"avatar_id": avatar_id, "type": "webrtc"},
        )
        return response.json()

    async def send_text(self, session_id: str, text: str) -> None:
        """Send text chunk for avatar to speak."""
        await self._request(
            "POST",
            f"/sessions/{session_id}/speak",
            json={"text": text},
        )

    async def close_session(self, session_id: str) -> None:
        """Close a WebRTC avatar session."""
        try:
            await self._request("POST", f"/sessions/{session_id}/close")
        except Exception as e:
            logger.warn("simli_close_session_error", session_id=session_id, error=str(e))


class HeyGenProvider:
    """HeyGen avatar provider - LiveAvatar API."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.heygen.com/v2"

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        headers = {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=headers,
                **kwargs,
            )
            response.raise_for_status()
            return response

    async def create_avatar(self, image_url: str, config: dict) -> dict:
        logger.info("heygen_create_avatar", image_url=image_url[:50])
        response = await self._request(
            "POST",
            "/photo_avatar",
            json={"image_url": image_url, **config},
        )
        return response.json()

    async def get_avatar_status(self, avatar_id: str) -> dict:
        response = await self._request("GET", f"/photo_avatar/{avatar_id}")
        return response.json()

    async def delete_avatar(self, avatar_id: str) -> bool:
        try:
            await self._request("DELETE", f"/photo_avatar/{avatar_id}")
            return True
        except Exception:
            return False

    async def create_session(self, avatar_id: str) -> dict:
        logger.info("heygen_create_session", avatar_id=avatar_id)
        response = await self._request(
            "POST",
            "/streaming.new",
            json={"avatar_id": avatar_id, "quality": "high"},
        )
        return response.json()

    async def send_text(self, session_id: str, text: str) -> None:
        await self._request(
            "POST",
            "/streaming.task",
            json={"session_id": session_id, "text": text, "task_type": "talk"},
        )

    async def close_session(self, session_id: str) -> None:
        try:
            await self._request(
                "POST",
                "/streaming.stop",
                json={"session_id": session_id},
            )
        except Exception as e:
            logger.warn("heygen_close_error", error=str(e))


def get_avatar_provider(provider: str, api_key: str) -> AvatarProviderInterface:
    """Factory function to get the appropriate avatar provider."""
    if provider == "simli":
        return SimliProvider(api_key)
    elif provider == "heygen":
        return HeyGenProvider(api_key)
    else:
        raise ValueError(f"Unknown avatar provider: {provider}")
