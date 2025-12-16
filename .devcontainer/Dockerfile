FROM ghcr.io/astral-sh/uv:latest AS uv

FROM mcr.microsoft.com/vscode/devcontainers/base:bookworm

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
    ffmpeg \
    xvfb \
    x11vnc \
    gnupg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Datadog Agent
RUN sh -c "echo 'deb [signed-by=/usr/share/keyrings/datadog-archive-keyring.gpg] https://apt.datadoghq.com/ stable 7' > /etc/apt/sources.list.d/datadog.list" \
    && touch /usr/share/keyrings/datadog-archive-keyring.gpg \
    && chmod a+r /usr/share/keyrings/datadog-archive-keyring.gpg \
    && curl https://keys.datadoghq.com/DATADOG_APT_KEY_CURRENT.public | gpg --no-default-keyring --keyring /usr/share/keyrings/datadog-archive-keyring.gpg --import \
    && curl https://keys.datadoghq.com/DATADOG_APT_KEY_F14F620E.public | gpg --no-default-keyring --keyring /usr/share/keyrings/datadog-archive-keyring.gpg --import \
    && curl https://keys.datadoghq.com/DATADOG_APT_KEY_382E94DE.public | gpg --no-default-keyring --keyring /usr/share/keyrings/datadog-archive-keyring.gpg --import \
    && apt-get update && apt-get install -y datadog-agent \
    && rm -rf /var/lib/apt/lists/*

ENV XDG_RUNTIME_DIR=/home/vscode/.xdg_runtime
RUN mkdir -p $XDG_RUNTIME_DIR && chown vscode: $XDG_RUNTIME_DIR

# Add venv to PATH for automatic activation
ENV PATH="/home/vscode/.venv/bin:${PATH}"

COPY --from=uv --chown=vscode: /uv /uvx /bin/
