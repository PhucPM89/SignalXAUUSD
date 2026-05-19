FROM python:3.12-slim AS base
WORKDIR /app

# System deps for numpy/scipy
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps — separate layer for cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS production
COPY app/ ./app/

# Security: non-root user
RUN addgroup --system --gid 1001 signal && \
    adduser --system --uid 1001 --ingroup signal signal
USER signal

EXPOSE 8000
# 2 workers per vCPU; uvloop for async performance
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", "--loop", "uvloop", "--log-level", "info"]
