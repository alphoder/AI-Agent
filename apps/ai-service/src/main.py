import ipaddress
import secrets

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import structlog

from src.config import settings
from src.metrics import metrics_endpoint
from src.routes import scoring, session, prompt, assistant, drill, plan

logger = structlog.get_logger(__name__)

app = FastAPI(
    title="Voice Training Platform - AI Service",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Internal-Key", "X-Metrics-Key"],
)


async def require_internal_key(request: Request) -> None:
    key = request.headers.get("x-internal-key", "")
    if not settings.internal_api_key or not secrets.compare_digest(key, settings.internal_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Internal-Key")


@app.get("/health/live")
async def liveness():
    return {"status": "ok"}


@app.get("/health")
async def health_check():
    checks = {"gemini": "ok" if settings.gemini_api_key else "not_configured"}
    healthy = bool(settings.gemini_api_key)
    return {"status": "ok" if healthy else "degraded", "service": "ai-service", "dependencies": checks}


@app.get("/health/ready")
async def readiness_check():
    if not settings.gemini_api_key:
        return {"status": "not_ready", "issues": ["gemini_api_key not configured"]}
    return {"status": "ready"}


def _is_internal_ip(client_host: str) -> bool:
    try:
        addr = ipaddress.ip_address(client_host)
        for cidr in settings.metrics_allowed_cidrs:
            if addr in ipaddress.ip_network(cidr, strict=False):
                return True
    except ValueError:
        pass
    return False


async def protected_metrics_endpoint(request: Request):
    api_key = request.headers.get("x-metrics-key", "")
    if settings.metrics_api_key and api_key and secrets.compare_digest(api_key, settings.metrics_api_key):
        return await metrics_endpoint()
    client_host = request.client.host if request.client else ""
    if _is_internal_ip(client_host):
        return await metrics_endpoint()
    raise HTTPException(status_code=403, detail="Forbidden")


app.add_api_route("/metrics", protected_metrics_endpoint, methods=["GET"], tags=["monitoring"])

# Internal service-to-service routes.
app.include_router(scoring.router, prefix="/scoring", tags=["scoring"], dependencies=[Depends(require_internal_key)])
app.include_router(prompt.router, prefix="/prompt", tags=["prompt"], dependencies=[Depends(require_internal_key)])
app.include_router(drill.router, prefix="/drill", tags=["drill"], dependencies=[Depends(require_internal_key)])
app.include_router(plan.router, prefix="/plan", tags=["plan"], dependencies=[Depends(require_internal_key)])
# Live WebSockets — browser connects directly with a signed ticket (no internal key).
app.include_router(session.router, tags=["session"])
app.include_router(assistant.router, tags=["assistant"])
