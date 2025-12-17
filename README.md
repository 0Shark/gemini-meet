# Gemini Meet: Your AI Co-Pilot for Meetings & Coding

**Gemini Meet** is an advanced AI agent designed to join your video calls, actively participate, and assist with complex tasks. Beyond standard note-taking, Gemini Meet is specialized for technical environments—it can help solve programming tasks in real-time, act as a pair programmer, and assist during technical interviews.

Built on top of the robust [Joinly](https://github.com/joinly-ai/joinly) framework, this fork is supercharged with developer-centric features like Google Vertex AI integration, Datadog tracking for observability, and specialized tools for coding assistance.

> [!IMPORTANT]
> This project is a specialized fork of **Joinly**, tailored for developers and enterprise technical workflows.

# Features

- **Technical Interview Assistant**: Can solve coding problems, explain algorithms, and provide real-time feedback during technical discussions.
- **Vertex AI Integration**: Leverages the power of Google's Gemini models via Vertex AI for superior reasoning and code generation.
- **Datadog Observability**: Built-in tracing and monitoring to track agent performance, latency, and tool usage in production environments.
- **Live Interaction**: Lets your agents execute tasks and respond in real-time by voice or chat within your meetings.
- **Conversational flow**: Built-in logic that ensures natural conversations by handling interruptions and multi-speaker interactions.
- **Cross-platform**: Join Google Meet, Zoom, and Microsoft Teams (or any available over the browser).
- **Bring-your-own-LLM**: Works with all LLM providers (also locally with Ollama).
- **Choose-your-preferred-TTS/STT**: Modular design supports multiple services - Whisper/Deepgram for STT and Kokoro/ElevenLabs/Deepgram for TTS.
- **100% open-source, self-hosted and privacy-first**.

# Quickstart

## Prerequisites
- [Docker](https://docs.docker.com/engine/install/)
- Google Cloud Project with Vertex AI enabled (or OpenAI API Key)

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/gemini-meet/gemini-meet.git
    cd gemini-meet
    ```

2.  **Configure Environment:**
    Create a new folder `gemini-meet` or use the cloned repository. Create a new `.env` file with your credentials.

    ```env
    # .env
    # Google Vertex AI (Recommended)
    GOOGLE_CLOUD_PROJECT=your-project-id
    GOOGLE_APPLICATION_CREDENTIALS=vertex_credentials.json

    # Datadog (Optional)
    DD_API_KEY=your-datadog-key
    DD_SITE=datadoghq.com

    # Gemini Meet Settings
    GEMINI_MEET_LLM_MODEL=gemini-1.5-pro
    GEMINI_MEET_LLM_PROVIDER=google
    ```

    > [!NOTE]
    > See [.env.example](.env.example) for complete configuration options.

3.  **Run with Docker:**
    Pull the Docker image (or build it locally `docker build -t gemini-meet .`):
    ```bash
    docker pull ghcr.io/gemini-meet/gemini-meet:latest
    ```

    Launch your meeting in Zoom, Google Meet or Teams and let Gemini Meet join using the meeting link as `<MeetingURL>`.
    ```bash
    docker run --env-file .env ghcr.io/gemini-meet/gemini-meet:latest --client <MeetingURL>
    ```

# Run an external client

In Quickstart, we ran the Docker Container directly as a client using `--client`. But we can also run it as a server and connect to it from outside the container.

> [!IMPORTANT]
> **Prerequisites**: [Install uv](https://github.com/astral-sh/uv).

1.  **Start the Server:**
    Start the gemini-meet server in the first terminal:
    ```bash
    docker run -p 8000:8000 ghcr.io/gemini-meet/gemini-meet:latest
    ```

2.  **Run the Client:**
    You can run the client directly from the source code using `uv`. This is useful for development or running without installing the package globally.

    ```bash
    # Run from source
    uv run client/gemini_meet_client/main.py --env-file .env <MeetingUrl>
    ```

    Or if you have the package installed:
    ```bash
    uvx gemini-meet-client --env-file .env <MeetingUrl>
    ```

## Add MCP servers to the client
Add the tools of any MCP server to the agent by providing a JSON configuration. The configuration file can contain multiple entries under `"mcpServers"` which will all be available as tools in the meeting.

```json
{
    "mcpServers": {
        "localServer": {
            "command": "npx",
            "args": ["-y", "package@0.1.0"]
        },
        "remoteServer": {
            "url": "http://mcp.example.com",
            "auth": "oauth"
        }
    }
}
```

Run the client using the config file:

```bash
uv run client/gemini_meet_client/main.py --env-file .env --mcp-config config.json <MeetingUrl>
```

# Configurations

Configurations can be given via env variables and/or command line args.

```bash
docker run --env-file .env -p 8000:8000 ghcr.io/gemini-meet/gemini-meet:latest <MyOptionArgs>
```

Alternatively, you can pass settings as command line arguments to the client:
```bash
uv run client/gemini_meet_client/main.py <MyOptionArgs> <MeetingUrl>
```

## Basic Settings

```bash
# Start directly as client; default is as server
--client <MeetingUrl>

# Change participant name (default: gemini)
--name "AI Assistant"

# Change language of TTS/STT (default: en)
--lang de

# Change host & port of the gemini-meet MCP server
--host 0.0.0.0 --port 8000
```

## Providers

### Text-to-Speech
```bash
# Kokoro (local) TTS (default)
--tts kokoro
--tts-arg voice=<VoiceName>

# ElevenLabs TTS, include ELEVENLABS_API_KEY in .env
--tts elevenlabs
--tts-arg voice_id=<VoiceID>

# Deepgram TTS, include DEEPGRAM_API_KEY in .env
--tts deepgram
--tts-arg model_name=<ModelName>
```

### Transcription
```bash
# Whisper (local) STT (default)
--stt whisper
--stt-arg model_name=<ModelName>

# Deepgram STT, include DEEPGRAM_API_KEY in .env
--stt deepgram
--stt-arg model_name=<ModelName>
```

# Debugging

```bash
# Start browser with a VNC server for debugging
--vnc-server --vnc-server-port 5900

# Logging
-v  # or -vv, -vvv

# Help
--help
```

# GPU Support

We provide a Docker image with CUDA GPU support.
```bash
docker pull ghcr.io/gemini-meet/gemini-meet:latest-cuda
```

Run as client or server with the same commands as above, but use the `gemini-meet:{version}-cuda` image and set `--gpus all`:
```bash
# Run as server
docker run --gpus all --env-file .env -p 8000:8000 ghcr.io/gemini-meet/gemini-meet:latest-cuda -v
```

# Create your own agent

You can also write your own agent and connect it to our MCP server.

The gemini-meet MCP server provides following tools and resources:

### Tools

- **`join_meeting`**: Join meeting with URL, participant name, and optional passcode
- **`leave_meeting`**: Leave the current meeting
- **`speak_text`**: Speak text using TTS
- **`send_chat_message`**: Send chat message
- **`mute_yourself`**: Mute microphone
- **`unmute_yourself`**: Unmute microphone
- **`get_chat_history`**: Get current meeting chat history
- **`get_participants`**: Get current meeting participants
- **`get_transcript`**: Get current meeting transcript
- **`get_video_snapshot`**: Get an image from the current meeting

### Resources

- **`transcript://live`**: Live meeting transcript in JSON format.

# Development

We recommend using the DevContainer for a consistent environment.

1.  Open in VS Code.
2.  Click "Reopen in Container".
3.  Run `uv run gemini_meet/main.py` to start the server locally.

# Roadmap

**Meeting**
- [x] Meeting chat access
- [ ] Camera in video call with status updates
- [ ] Enable screen share during video conferences
- [ ] Participant metadata and joining/leaving
- [ ] Improve browser agent capabilities

**Conversation**
- [x] Speaker attribute for transcription
- [ ] Improve client memory: reduce token usage, allow persistence across meetings
- [ ] Improve End-of-Utterance/turn-taking detection
- [ ] Human approval mechanism from inside the meeting

**Integrations**
- [ ] Showcase how to add agents using the A2A protocol
- [ ] Add more provider integrations (STT, TTS)
- [ ] Integrate meeting platform SDKs
- [ ] Add alternative open-source meeting provider
- [ ] Add support for Speech2Speech models

# License

This project is licensed under the MIT License.

---

*This project is a fork of [Joinly](https://github.com/joinly-ai/joinly).*
