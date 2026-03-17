from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.metrics import metrics_endpoint
from src.routes import embedding, scoring, session

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


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ai-service"}


app.add_api_route("/metrics", metrics_endpoint, methods=["GET"], tags=["monitoring"])

app.include_router(session.router, prefix="/session", tags=["session"])
app.include_router(embedding.router, prefix="/embedding", tags=["embedding"])
app.include_router(scoring.router, prefix="/scoring", tags=["scoring"])
