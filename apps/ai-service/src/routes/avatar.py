"""Avatar creation and management routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import structlog

from src.config import settings
from src.core.avatar import get_avatar_provider

logger = structlog.get_logger(__name__)

router = APIRouter()


class AvatarCreateRequest(BaseModel):
    avatar_id: str
    tenant_id: str
    image_url: str
    provider: str = "simli"
    config: dict = {}


class AvatarStatusRequest(BaseModel):
    avatar_id: str
    provider: str = "simli"


@router.post("/create")
async def create_avatar(req: AvatarCreateRequest):
    """
    Process avatar creation via the configured provider (Simli/HeyGen).
    Called by the API gateway after image upload to S3.
    Updates the avatar status in the API database when complete.
    """
    logger.info(
        "avatar.create_start",
        avatar_id=req.avatar_id,
        provider=req.provider,
    )

    # Get the appropriate provider API key
    api_key = ""
    if req.provider == "simli":
        api_key = settings.simli_api_key
    elif req.provider == "heygen":
        api_key = settings.heygen_api_key

    # If no API key configured, skip provider call and mark as active directly
    # This enables local development without external service dependencies
    if not api_key:
        logger.warn(
            "avatar.no_api_key",
            provider=req.provider,
            avatar_id=req.avatar_id,
            msg="No API key configured — marking avatar as active for dev mode",
        )
        await _update_avatar_status(
            req.avatar_id, req.tenant_id, "active", provider_avatar_id=f"dev-{req.avatar_id[:8]}"
        )
        return {
            "status": "active",
            "avatar_id": req.avatar_id,
            "provider_avatar_id": f"dev-{req.avatar_id[:8]}",
            "message": "Avatar marked active (dev mode — no provider API key configured)",
        }

    try:
        provider = get_avatar_provider(req.provider, api_key)
        result = await provider.create_avatar(req.image_url, req.config)

        provider_avatar_id = result.get("id") or result.get("avatar_id") or ""

        logger.info(
            "avatar.create_success",
            avatar_id=req.avatar_id,
            provider_avatar_id=provider_avatar_id,
        )

        # Update status in API database
        await _update_avatar_status(
            req.avatar_id, req.tenant_id, "active", provider_avatar_id=provider_avatar_id
        )

        return {
            "status": "active",
            "avatar_id": req.avatar_id,
            "provider_avatar_id": provider_avatar_id,
        }

    except Exception as e:
        logger.error(
            "avatar.create_failed",
            avatar_id=req.avatar_id,
            error=str(e),
        )
        # Mark as failed in API database
        await _update_avatar_status(req.avatar_id, req.tenant_id, "failed")

        raise HTTPException(status_code=502, detail=f"Avatar creation failed: {str(e)}")


@router.post("/status")
async def check_avatar_status(req: AvatarStatusRequest):
    """Check the status of an avatar with the provider."""
    api_key = settings.simli_api_key if req.provider == "simli" else settings.heygen_api_key

    if not api_key:
        return {"status": "active", "message": "Dev mode — no provider configured"}

    try:
        provider = get_avatar_provider(req.provider, api_key)
        result = await provider.get_avatar_status(req.avatar_id)
        return result
    except Exception as e:
        logger.error("avatar.status_check_failed", error=str(e))
        raise HTTPException(status_code=502, detail=str(e))


async def _update_avatar_status(
    avatar_id: str,
    tenant_id: str,
    status: str,
    provider_avatar_id: Optional[str] = None,
) -> None:
    """Update avatar status back in the API gateway database."""
    try:
        url = f"{settings.api_gateway_url}/api/internal/avatar-status"
        payload = {
            "avatar_id": avatar_id,
            "tenant_id": tenant_id,
            "status": status,
        }
        if provider_avatar_id:
            payload["provider_avatar_id"] = provider_avatar_id

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"X-Internal-Key": settings.internal_api_key},
            )
            if resp.status_code != 200:
                logger.warn(
                    "avatar.status_update_failed",
                    status_code=resp.status_code,
                    body=resp.text[:200],
                )
    except Exception as e:
        logger.error("avatar.status_update_error", error=str(e))
