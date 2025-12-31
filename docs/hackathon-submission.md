# Gemini Meet - Hackathon Submission

## Inspiration

The rise of AI assistants has transformed how we work individually, but meetings remain a largely manual experience. We noticed that while tools like transcription bots exist, they're passive observers - just recording what happens. We asked: **What if AI could actively participate in meetings?** An AI that doesn't just listen, but speaks up, takes action, searches the web, creates tickets, and reasons through complex problems in real-time. We were inspired by Google's Gemini models and the emerging Model Context Protocol (MCP) standard to build truly autonomous meeting agents.

## What it does

**Gemini Meet** is an open-source platform for deploying autonomous AI agents into video calls (Google Meet, Zoom, Microsoft Teams).

Unlike simple transcription bots, Gemini Meet agents are **active participants**:
- **Speak in real-time** using text-to-speech (ElevenLabs, Google, Kokoro)
- **Listen and transcribe** using speech-to-text (Whisper, Deepgram, Google)
- **Use tools via MCP** - search the web, create GitHub issues, query databases, send Slack messages, access Google Drive, and 30+ other integrations
- **Reason with Google Gemini** models for multimodal understanding and complex problem-solving
- **Act as a technical interview assistant**, pair programmer, or meeting facilitator

The platform consists of a **Next.js Dashboard** for managing agents and configuring tools, and **ephemeral Docker containers** that join meetings on demand.

## How we built it

- **Core Engine (Python)**: The agent runtime uses an async architecture with protocol-based interfaces for modularity. Voice Activity Detection (VAD) with Silero, STT/TTS pipelines, and browser automation via Playwright work together seamlessly.
- **Browser Automation**: Platform-specific providers handle joining Google Meet, Zoom, and Teams - managing audio streams, chat, and participant detection.
- **LLM Integration**: Built with pydantic-ai for type-safe Gemini integration. The conversational agent handles tool calling, speech interruption detection, and context management.
- **MCP Support**: Full Model Context Protocol support lets agents use any MCP server - GitHub, Slack, Notion, databases, and more.
- **Dashboard (Next.js/React)**: A modern UI with better-auth authentication, PostgreSQL storage, and Docker orchestration to spawn agents.
- **Observability**: Production-ready Datadog integration for tracking browser health, STT drift, LLM latency, and tool usage.

## Challenges we ran into

1. **Real-time audio synchronization**: Coordinating STT transcription with VAD while preventing the agent from transcribing its own speech was complex. We implemented speech window buffering and interrupt detection.

2. **Browser automation reliability**: Meeting platforms frequently update their UIs. We built platform-specific selector abstractions and comprehensive error tracking.

3. **Conversational flow**: Preventing the agent from talking over participants required implementing barge-in detection and graceful speech interruption handling.

4. **Docker orchestration**: The dashboard spawns agent containers dynamically. Managing file path mapping between host and container filesystems was tricky.

5. **Token/context management**: Long meetings generate massive transcripts. We implemented sliding window context management with intelligent truncation.

## Accomplishments that we're proud of

- **Cross-platform support**: One codebase works with Google Meet, Zoom, and Microsoft Teams
- **30+ MCP integrations**: Agents can use GitHub, Slack, PostgreSQL, Google Drive, Brave Search, and many more tools out of the box
- **Privacy-first option**: Full local execution with Ollama (LLM), Whisper (STT), and Kokoro (TTS) for complete data sovereignty
- **Production observability**: Pre-configured Datadog monitors and workflows ready for import
- **Open source**: MIT licensed and designed for extensibility

## What we learned

- **Protocol-driven design pays off**: Using Python protocols for components (STT, TTS, VAD, MeetingProvider) made the system highly modular and testable
- **MCP is powerful**: The Model Context Protocol enables incredible agent capabilities with minimal integration effort
- **Audio is hard**: Real-time bidirectional audio with VAD, transcription, and synthesis requires careful timing and buffering
- **Observability from day one**: Building in Datadog metrics early saved countless debugging hours

## What's next for Gemini Meet

- **Multi-agent meetings**: Multiple AI agents collaborating in the same meeting
- **Persistent memory**: Cross-meeting knowledge graphs using MCP memory servers
- **Custom voice cloning**: Personalized agent voices for brand consistency
- **Meeting summarization**: Automatic post-meeting summaries with action items pushed to project management tools
- **Scheduled agents**: Calendar integration to auto-join recurring meetings
- **Mobile support**: React Native companion app for on-the-go agent management

## Built With

Python, TypeScript, Next.js, React, Google Gemini, Vertex AI, Playwright, Docker, PostgreSQL, Drizzle ORM, Whisper, Deepgram, ElevenLabs, Kokoro, Silero VAD, MCP (Model Context Protocol), Datadog, Tailwind CSS, Radix UI, shadcn/ui

## Google Cloud Products Used

- **Gemini API** - Core LLM powering agent reasoning, tool calling, and multimodal understanding
- **Vertex AI** - Production deployment of Gemini models with enterprise-grade reliability
- **Google Cloud Speech-to-Text** - Real-time transcription option for meeting audio
- **Google Cloud Text-to-Speech** - Natural voice synthesis for agent responses

## Other Tools & Products Used

- **Playwright** - Browser automation for joining Google Meet, Zoom, and Teams
- **Docker** - Containerized agent deployment and orchestration
- **PostgreSQL** - Database for meeting metadata, user auth, and MCP configurations
- **Drizzle ORM** - Type-safe database queries for the Next.js dashboard
- **Deepgram** - Alternative STT provider for real-time transcription
- **ElevenLabs** - High-quality TTS for natural-sounding agent voices
- **Whisper (OpenAI)** - Local STT option for privacy-first deployments
- **Kokoro** - Local TTS engine for offline voice synthesis
- **Silero VAD** - Voice activity detection for speech segmentation
- **MCP (Model Context Protocol)** - Tool integration standard (GitHub, Slack, Notion, etc.)
- **Datadog** - Observability platform for metrics, logs, and APM tracing
- **Next.js** - React framework for the dashboard web application
- **better-auth** - Authentication library for user management
- **pydantic-ai** - Type-safe Python SDK for LLM interactions
- **Tailwind CSS / shadcn/ui** - UI styling and component library
