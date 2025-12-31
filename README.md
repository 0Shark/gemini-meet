# Gemini Meet: Autonomous Meeting Agents Platform

**Gemini Meet** is an open-source platform for deploying autonomous AI agents into video calls (Google Meet, Zoom, Teams). 

Unlike simple transcription bots, Gemini Meet agents are **active participants**: they can speak, use tools (via MCP), and reason in real-time using **Google's Gemini** models (or other providers).

[Gemini Meet](https://meetings.juledz.com)

## 🚀 The Platform

The platform consists of two parts:
1.  **The Dashboard**: A web interface to manage agents, configure tools (MCP), and view live meeting details.
2.  **The Agents**: Ephemeral Docker containers spawned by the dashboard that actually join the meetings.

![Dashboard Preview](https://raw.githubusercontent.com/0Shark/gemini-meet/main/docs/dashboard-preview.png)

## ⚡️ Quickstart

The recommended way to use Gemini Meet is through the **Dashboard**.

### Prerequisites
- **Docker** (Must be running)
- **Node.js 18+** & npm
- **PostgreSQL** (Or use the docker-compose in `dashboard/` directory)

### 1. Build Agent Images
The dashboard needs these images to spawn agents. You **must** build them first.

```bash
# 1. Build the base image
docker build -f docker/Dockerfile -t ghcr.io/gemini-meet:latest .

# 2. Build the agent image (used by the dashboard)
cd dashboard
docker build -f Dockerfile.agent -t gemini-meet-with-node:latest .
cd ..
```

### 2. Start the Dashboard
Navigate to the dashboard directory and follow the setup there.

```bash
cd dashboard
cp .env.example .env.local
# Edit .env.local with your Google Cloud Credentials and Database URL
npm install
npm run init-db
npm run dev
```

> **Detailed Setup:** For full database setup and production deployment instructions, see the **[Dashboard Documentation](dashboard/README.md)**.

### 3. Create an Agent
Open [http://localhost:3000](http://localhost:3000), click **"New Agent"**, and paste your Google Meet or Zoom link.

---

## 📊 Observability & Telemetry

Gemini Meet is designed for production with built-in **Datadog** integration. We track:
- **Browser Health**: Detect if the agent fails to join or if UI selectors break.
- **Real-time Latency**: Monitor STT drift and LLM response times.
- **Tool Usage**: Track which MCP tools your agents are using.

We provide pre-configured Datadog Monitors and Workflows in the [`datadog_exports/`](datadog_exports/) directory ready for import.

For setup instructions and metric definitions, see **[TELEMETRY.md](TELEMETRY.md)**.

---

## 🛠️ Advanced: CLI / Headless Usage

If you don't want the UI and just want to run a single agent container from the command line:

### 1. Configure Credentials
Create a `.env` file in the root directory:
```env
# Google Cloud (Required for Gemini)
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=vertex_credentials.json

# Datadog Observability (Optional)
DD_SITE=datadoghq.com
DD_API_KEY=your-datadog-api-key
DD_APP_KEY=your-datadog-app-key
DD_LLMOBS_ENABLED=1
DD_LLMOBS_ML_APP=gemini-meet-agent
DD_TRACE_AGENTLESS=true

# Model Settings
GEMINI_MEET_MODEL_PROVIDER=google
GEMINI_MEET_MODEL_NAME=your-model-name # e.g. gemini-1.5-flash

# Optional: ElevenLabs TTS
ELEVENLABS_API_KEY=your-elevenlabs-key
```

### 2. Run with Docker
```bash
docker run \
  --env-file .env \
  -v "$(pwd)/vertex_credentials.json:/app/vertex_credentials.json" \
  ghcr.io/gemini-meet/gemini-meet:latest --client "https://meet.google.com/abc-defg-hij"
```

## Features

- **Google Gemini Integration**: Native support for Google's latest Gemini models via Vertex AI for superior multimodal reasoning.
- **Privacy & Local Execution**: Fully capable of running locally with **Ollama** (LLM), **Whisper** (STT), and **Kokoro** (TTS) for complete data sovereignty.
- **Technical Interview Assistant**: Can solve coding problems and act as a pair programmer.
- **Live Interaction**: Responds in real-time by voice or chat.
- **Cross-platform**: Google Meet, Zoom, and Microsoft Teams.
- **Flexible Model Support**: While optimized for Gemini, supports other providers like OpenAI or Anthropic if needed.
- **Modular Audio**: Supports Whisper/Deepgram (STT) and Kokoro/ElevenLabs (TTS).

## Development

We recommend using the DevContainer for a consistent environment.
1.  Open in VS Code.
2.  Click "Reopen in Container".
3.  Run `uv run gemini_meet/main.py` to start the server locally.

## License

This project is licensed under the MIT License.

---
*This project is a fork of [Joinly](https://github.com/joinly-ai/joinly).*
