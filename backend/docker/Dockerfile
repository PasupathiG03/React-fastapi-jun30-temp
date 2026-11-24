# syntax=docker/dockerfile:1.4

# ── Stage 1: AI & Deep Learning Base (Heavy - Permanently Cached) ─────────────
# PyTorch, Torchvision, Transformers, Timm, ONNX Runtime, RapidOCR
FROM python:3.10-slim AS ai-base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

# OS libraries for OpenCV, PyTorch, ONNX
RUN rm -f /etc/apt/apt.conf.d/docker-clean; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl

# Dedicated virtual environment for AI packages
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install CPU PyTorch first (cached permanently in BuildKit)
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip setuptools wheel && \
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install heavy AI & Vision dependencies (never re-run unless requirements-ai.txt changes)
COPY docker/requirements-ai.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements-ai.txt


# ── Stage 2: Web Application Dependencies (Lightweight & Fast) ────────────────
FROM ai-base AS app-builder

WORKDIR /build

# Install FastAPI, SQLAlchemy, Alembic, Celery, Redis (builds in ~5 seconds)
COPY requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt


# ── Stage 3: Minimal Production Runtime ───────────────────────────────────────
FROM python:3.10-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app/backend

# Runtime shared libraries only (no gcc/g++ compilers)
RUN rm -f /etc/apt/apt.conf.d/docker-clean; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-installed virtual environment with ALL AI & Web packages
COPY --from=app-builder /opt/venv /opt/venv

# Copy entrypoint script to system PATH (safe from bind-mount overwrites)
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Copy application source code (Changes frequently, builds in milliseconds)
COPY . ./

# Ensure data directories exist
RUN mkdir -p /app/backend/uploads /app/backend/exports /app/models

EXPOSE 8107

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["server"]
