# Stage 1: Build environment
FROM python:3.12-slim AS builder

ENV UV_LINK_MODE="copy" \
    UV_COMPILE_BYTECODE=1

# Install uv (fast Python package manager)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Install dependencies using uv and lock files
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=client/pyproject.toml,target=client/pyproject.toml \
    --mount=type=bind,source=common/pyproject.toml,target=common/pyproject.toml \
    uv sync --locked --no-install-project --no-install-workspace --no-dev --no-editable

# Copy app source code
COPY . /app

# Install application into .venv (non-editable mode)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

# Stage 2: Runtime image
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    GEMINI_MEET_SERVER_HOST="0.0.0.0" \
    GEMINI_MEET_SERVER_PORT=8000 \
    GEMINI_MEET_LOGGING_PLAIN=1

EXPOSE 8000

# Install system dependencies (for audio, video, browser, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxcomposite1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    pulseaudio \
    pulseaudio-utils \
    xvfb \
    x11vnc \
    gnupg \
    curl \
    && apt-get purge -y --auto-remove \
    && rm -rf /var/lib/apt/lists/* /tmp/*

# Install Datadog Agent
RUN sh -c "echo 'deb [signed-by=/usr/share/keyrings/datadog-archive-keyring.gpg] https://apt.datadoghq.com/ stable 7' > /etc/apt/sources.list.d/datadog.list" \
    && touch /usr/share/keyrings/datadog-archive-keyring.gpg \
    && chmod a+r /usr/share/keyrings/datadog-archive-keyring.gpg \
    && curl https://keys.datadoghq.com/DATADOG_APT_KEY_CURRENT.public | gpg --no-default-keyring --keyring /usr/share/keyrings/datadog-archive-keyring.gpg --import \
    && curl https://keys.datadoghq.com/DATADOG_APT_KEY_F14F620E.public | gpg --no-default-keyring --keyring /usr/share/keyrings/datadog-archive-keyring.gpg --import \
    && curl https://keys.datadoghq.com/DATADOG_APT_KEY_382E94DE.public | gpg --no-default-keyring --keyring /usr/share/keyrings/datadog-archive-keyring.gpg --import \
    && apt-get update && apt-get install -y datadog-agent \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid 1001 app && \
    useradd --uid 1001 --gid 1001 -m app

# Copy virtual environment from builder and set permissions
COPY --from=builder --chown=app:app /app/.venv /app/.venv

# Set user and working directory
USER app
WORKDIR /app

# Run download assets script to package all required assets
# Note: this makes the image size very large, but has all assets on startup
RUN --mount=type=bind,source=scripts/download_assets.py,target=download_assets.py \
    PATH="/app/.venv/bin:${PATH}" \
    /app/.venv/bin/python download_assets.py \
    --assets playwright whisper silero kokoro \
    --whisper-model base

# Set entrypoint
ENTRYPOINT ["/app/.venv/bin/gemini_meet"]
