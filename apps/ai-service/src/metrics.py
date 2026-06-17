from prometheus_client import Counter, Gauge, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response


# --- Pipeline latency ---
pipeline_latency_seconds = Histogram(
    "pipeline_latency_seconds",
    "Latency of each pipeline stage in seconds",
    labelnames=["stage"],
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0],
)

# --- Pipeline errors ---
pipeline_errors_total = Counter(
    "pipeline_errors_total",
    "Total number of pipeline errors",
    labelnames=["stage"],
)

# --- Active sessions ---
active_sessions_gauge = Gauge(
    "active_sessions_total",
    "Number of active training sessions",
    labelnames=["tenant_id"],
)

# --- Session lifecycle ---
sessions_started_total = Counter(
    "sessions_started_total",
    "Total number of sessions started",
)

sessions_ended_total = Counter(
    "sessions_ended_total",
    "Total number of sessions ended",
)

# --- Turn counter ---
turns_total = Counter(
    "turns_total",
    "Total number of conversation turns processed",
)

# --- Guardrail triggers ---
guardrail_triggers_total = Counter(
    "guardrail_triggers_total",
    "Total number of guardrail violations",
    labelnames=["direction"],  # "input" or "output"
)

# --- Embedding jobs ---
embedding_jobs_total = Counter(
    "embedding_jobs_total",
    "Total number of embedding jobs processed",
    labelnames=["status"],
)

# --- Scoring jobs ---
scoring_jobs_total = Counter(
    "scoring_jobs_total",
    "Total number of scoring jobs processed",
    labelnames=["status"],
)


async def metrics_endpoint() -> Response:
    """FastAPI endpoint handler that returns Prometheus metrics."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )
