import ipaddress

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as aioredis
import structlog

from src.config import settings
from src.metrics import metrics_endpoint
from src.routes import embedding, scoring, session

logger = structlog.get_logger(__name__)

app = FastAPI(
    title="AI Avatar Training Platform - AI Service",
    version="0.0.1",
    docs_url="/docs" if settings.debug else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health/live")
async def liveness():
    return {"status": "ok"}


@app.get("/health")
async def health_check():
    checks: dict[str, str] = {}
    healthy = True

    # Check Redis
    try:
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
        healthy = False

    # Check API keys configured
    checks["openai"] = "ok" if settings.openai_api_key else "not_configured"
    checks["deepgram"] = "ok" if settings.deepgram_api_key else "not_configured"

    status = "ok" if healthy else "degraded"
    return {"status": status, "service": "ai-service", "dependencies": checks}


@app.on_event("shutdown")
async def shutdown_event():
    """End all active sessions gracefully on shutdown."""
    from src.routes.session import active_sessions, active_rooms

    for session_id, orchestrator in list(active_sessions.items()):
        try:
            await orchestrator.end()
            logger.info("shutdown.session_ended", session_id=session_id)
        except Exception:
            logger.warning("shutdown.session_end_failed", session_id=session_id)
    for session_id, room in list(active_rooms.items()):
        try:
            await room.disconnect()
            logger.info("shutdown.room_disconnected", session_id=session_id)
        except Exception:
            logger.warning("shutdown.room_disconnect_failed", session_id=session_id)


def _is_internal_ip(client_host: str) -> bool:
    """Check if the request comes from an internal/private network."""
    try:
        addr = ipaddress.ip_address(client_host)
        for cidr in settings.metrics_allowed_cidrs:
            if addr in ipaddress.ip_network(cidr, strict=False):
                return True
    except ValueError:
        pass
    return False


async def protected_metrics_endpoint(request: Request):
    """Serve /metrics only to internal callers or with a valid API key."""
    # Check API key header first
    api_key = request.headers.get("x-metrics-key", "")
    if settings.metrics_api_key and api_key == settings.metrics_api_key:
        return await metrics_endpoint()

    # Fall back to IP allowlist
    client_host = request.client.host if request.client else ""
    if _is_internal_ip(client_host):
        return await metrics_endpoint()

    raise HTTPException(status_code=403, detail="Forbidden")


app.add_api_route("/metrics", protected_metrics_endpoint, methods=["GET"], tags=["monitoring"])

app.include_router(session.router, prefix="/session", tags=["session"])
app.include_router(embedding.router, prefix="/embedding", tags=["embedding"])
app.include_router(scoring.router, prefix="/scoring", tags=["scoring"])
