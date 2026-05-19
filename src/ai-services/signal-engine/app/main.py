"""
XAUUSD Signal Engine — FastAPI entry point

Performance targets:
  - P50 inference latency: <80ms
  - P99 inference latency: <200ms
  - Throughput: ≥50 req/s on 2 vCPUs
  - Memory: <512MB (models loaded once at startup, no per-request allocation)
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.gzip import GZipMiddleware
from prometheus_client import Counter, Histogram, make_asgi_app
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from app.models.signal_models import InferenceRequest, InferenceResponse
from app.services.inference_service import run_inference

log = structlog.get_logger()

# ── Metrics ──────────────────────────────────────────────────────────────────
inference_counter = Counter(
    "signal_inferences_total", "Total inference requests",
    ["direction", "result"]
)
inference_latency = Histogram(
    "signal_inference_duration_seconds", "Inference latency",
    buckets=[0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1.0]
)
confidence_histogram = Histogram(
    "signal_confidence_score", "Confidence score distribution",
    buckets=[50, 60, 65, 70, 72, 75, 80, 85, 90, 95, 100]
)

# ── OTel Tracing ──────────────────────────────────────────────────────────────
def setup_tracing() -> None:
    import os
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4317")
    resource = Resource.create({"service.name": "signal-engine", "instrument": "XAUUSD"})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
    trace.set_tracer_provider(provider)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    log.info("signal_engine.startup", instrument="XAUUSD")
    setup_tracing()
    # Pre-warm any ML models here if added (LSTM, ensemble, etc.)
    yield
    log.info("signal_engine.shutdown")


app = FastAPI(
    title="XAUUSD Signal Engine",
    description="Institutional quantitative signal engine for Gold/USD",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(GZipMiddleware, minimum_size=500)
FastAPIInstrumentor.instrument_app(app)

# Prometheus metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


@app.post("/infer", response_model=InferenceResponse)
async def infer(request: InferenceRequest, http_request: Request):
    tracer = trace.get_tracer("signal-engine")

    with tracer.start_as_current_span("inference") as span:
        span.set_attribute("symbol", request.symbol)
        span.set_attribute("session", request.session)
        span.set_attribute("regime", request.regime)

        with inference_latency.time():
            try:
                result = run_inference(request)
            except Exception as e:
                log.error("inference.error", error=str(e), symbol=request.symbol)
                raise HTTPException(status_code=500, detail=str(e))

        span.set_attribute("direction", result.direction)
        span.set_attribute("confidence", result.confidence)
        span.set_attribute("should_trade", result.should_trade)

        inference_counter.labels(
            direction=result.direction,
            result="trade" if result.should_trade else "no_trade"
        ).inc()

        if result.should_trade:
            confidence_histogram.observe(result.confidence)

        log.info(
            "inference.result",
            symbol=request.symbol,
            direction=result.direction,
            confidence=result.confidence,
            should_trade=result.should_trade,
            reason=result.no_trade_reason,
        )

        return result


@app.get("/health")
async def health():
    return {"status": "ok", "instrument": "XAUUSD"}


@app.get("/health/ready")
async def ready():
    return {"status": "ready"}
