
# gemini-meet-client: Client for a conversational meeting agent used with gemini_meet

## Prerequisites

### Set LLM API key

Create a `.env` file in the current directory with the following content:

```bash
GOOGLE_CLOUD_PROJECT="your-project-id"
GOOGLE_CLOUD_LOCATION="us-central1"
GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```
For other providers, export the corresponding environment variable(s) and set provider and model with the command:
```bash
uvx gemini-meet-client --llm-provider <provider> --llm-model <model> <MeetingUrl>
```

### Start gemini_meet server

Make sure you have a running gemini_meet server. You can start it with:
```bash
docker run -p 8000:8000 ghcr.io/gemini-meet/gemini_meet:latest
```
For more details on gemini_meet, see the GitHub repository: [gemini-meet/gemini_meet](https://github.com/gemini-meet/gemini_meet).

## Command line usage

We recommend using `uv` for running the client, you can install it using the [command in their repository](https://github.com/astral-sh/uv#Installation).

Connect to a running gemini_meet server and join a meeting, here loading environment variables from a `.env` file:
```bash
uvx gemini-meet-client --gemini_meet-url http://localhost:8000/mcp/ --env-file .env <MeetingUrl>
```

Add other MCP servers using a [configuration file](https://gofastmcp.com/clients/client#configuration-based-clients):
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

```bash
uvx gemini-meet-client --mcp-config config.json <MeetingUrl>
```

You can also set other session-specific settings for the gemini_meet server, e.g.:
```bash
uvx gemini-meet-client --tts elevenlabs --tts-arg voice_id=EXAVITQu4vr4xnSDxMa6 --lang de <MeetingUrl>
```

For a full list of command line options, run:
```bash
uvx gemini-meet-client --help
```

## Code usage

Direct use of run function:
```python
import asyncio

from dotenv import load_dotenv
from gemini_meet_client import run

load_dotenv()


async def async_run():
    await run(
        gemini_meet_url="http://localhost:8000/mcp/",
        meeting_url="<MeetingUrl>",
        llm_provider="openai",
        llm_model="gpt-4o-mini",
        prompt="You are gemini_meet, a...",
        name="gemini",
        name_trigger=False,
        mcp_config=None,  # MCP servers configuration (dict)
        settings=None,  # settings propagated to gemini_meet server (dict)
    )


if __name__ == "__main__":
    asyncio.run(async_run())
```

Or only using the client and a custom agent:
```python
import asyncio

from gemini_meet_client import GeminiMeetClient
from gemini_meet_client.data_types import TranscriptSegment


async def run():
    client = GeminiMeetClient(
        url="http://localhost:8000/mcp/",
        name="gemini",
        name_trigger=False,
        settings=None,
    )

    async def on_utterance(segments: list[TranscriptSegment]) -> None:
        for segment in segments:
            print(f"Received utterance: {segment.text}")
            if "marco" in segment.text.lower():
                await client.speak_text("Polo!")

    client.add_utterance_callback(on_utterance)

    async with client:
        # optionally, load all tools from the server
        # can be used to give all tools to the llm
        # e.g., for langchain mcp adapter, use the client.session
        tool_list = await client.list_tools()

        await client.join_meeting("<MeetingUrl>")
        try:
            await asyncio.Event().wait()  # wait until cancelled
        finally:
            print(await client.get_transcript())  # print the final transcript


if __name__ == "__main__":
    asyncio.run(run())
```
