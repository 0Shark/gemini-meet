import asyncio
import json
import logging
import warnings
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Any

import click
from dotenv import load_dotenv
from fastmcp import Client, FastMCP

# Suppress pydantic-ai warnings about additionalProperties (Gemini compatibility)
warnings.filterwarnings(
    "ignore",
    message=".*additionalProperties.*",
    category=UserWarning,
    module="pydantic_ai.*",
)

# Try to load .env file automatically if it exists (before Datadog initialization)
# This ensures environment variables are available when Datadog initializes
env_file = Path(".env")
if env_file.exists():
    load_dotenv(env_file)

# Initialize Datadog early, before other imports that might use the tracer
from gemini_meet_client.datadog import initialize_datadog  # noqa: E402

initialize_datadog()

from gemini_meet_client.agent import ConversationalToolAgent  # noqa: E402
from gemini_meet_client.client import GeminiMeetClient  # noqa: E402
from gemini_meet_client.data_types import McpClientConfig, TranscriptSegment  # noqa: E402
from gemini_meet_client.utils import (  # noqa: E402
    get_llm,
    get_prompt,
    get_prompt_components,
    load_tools,
)

logger = logging.getLogger(__name__)


def _parse_kv(
    _ctx: click.Context, _param: click.Parameter, value: tuple[str]
) -> dict[str, object] | None:
    """Convert (--foo-arg key=value) repeated tuples to dict."""
    out: dict[str, object] = {}
    for item in value:
        try:
            k, v = item.split("=", 1)
        except ValueError as exc:
            msg = f"{item!r} is not of the form key=value"
            raise click.BadParameter(msg) from exc

        try:
            out[k] = json.loads(v)
        except json.JSONDecodeError:
            out[k] = v
    return out or None


@click.command()
@click.option(
    "--gemini_meet-url",
    type=str,
    help="The URL of the gemini_meet server to connect to.",
    default="http://localhost:8000/mcp/",
    show_default=True,
    show_envvar=True,
    envvar="GEMINI_MEET_URL",
)
@click.option(
    "-n",
    "--name",
    type=str,
    help="The meeting participant name.",
    default="gemini",
    show_default=True,
    show_envvar=True,
    envvar="GEMINI_MEET_NAME",
)
@click.option(
    "--llm-provider",
    "--model-provider",
    type=str,
    help="The provider of the LLM model to use in the client.",
    default="openai",
    show_default=True,
    show_envvar=True,
    envvar=["GEMINI_MEET_LLM_PROVIDER", "GEMINI_MEET_MODEL_PROVIDER"],
)
@click.option(
    "--llm-model",
    "--model-name",
    type=str,
    help="The name of the LLM model to use in the client.",
    default="gpt-4o",
    show_default=True,
    show_envvar=True,
    envvar=["GEMINI_MEET_LLM_MODEL", "GEMINI_MEET_MODEL_NAME"],
)
@click.option(
    "--env-file",
    type=click.Path(exists=True, dir_okay=False, readable=True),
    help="Path to a .env file to load environment variables from.",
    default=None,
    show_default=True,
    is_eager=True,
    expose_value=False,
    callback=lambda _ctx, _param, value: load_dotenv(value),
)
@click.option(
    "--prompt",
    type=str,
    help="System prompt to use for the model. If not provided, the default "
    "system prompt will be used.",
    default=None,
    envvar="GEMINI_MEET_PROMPT",
)
@click.option(
    "--prompt-file",
    type=click.Path(exists=True, dir_okay=False, readable=True),
    help="Path to a text file containing the system prompt.",
    default=None,
    show_default=True,
    envvar="GEMINI_MEET_PROMPT_FILE",
)
@click.option(
    "--prompt-style",
    type=click.Choice(["dyadic", "mpc"], case_sensitive=False),
    help="The type of default prompt to use if no custom prompt is provided."
    "Options are 'dyadic' for one-on-one meetings or 'mpc' for group meetings.",
    default="mpc",
    show_default=True,
    show_envvar=True,
    envvar="GEMINI_MEET_PROMPT_STYLE",
)
@click.option(
    "--mcp-config",
    type=str,
    help="Path to a JSON configuration file for additional MCP servers. "
    "The file should contain configuration like: "
    '\'{"mcpServers": {"remote": {"url": "https://example.com/mcp"}}}\'. '
    "See https://gofastmcp.com/clients/client for more details.",
    default=None,
)
@click.option(
    "--name-trigger",
    is_flag=True,
    help="Trigger the agent only when the name is mentioned in the transcript.",
)
@click.option(
    "--language",
    "--lang",
    type=str,
    help="The language to use for transcription and text-to-speech.",
    default=None,
    show_envvar=True,
    envvar="GEMINI_MEET_LANGUAGE",
)
@click.option(
    "--vad",
    type=str,
    help='Voice Activity Detection service to use. Options are: "silero", "webrtc".',
    default=None,
    show_envvar=True,
    envvar="GEMINI_MEET_VAD",
)
@click.option(
    "--stt",
    type=str,
    help='Speech-to-Text service to use. Options are: "whisper" (local), "deepgram".',
    default=None,
    show_envvar=True,
    envvar="GEMINI_MEET_STT",
)
@click.option(
    "--tts",
    type=str,
    help='Text-to-Speech service to use. Options are: "kokoro" (local), '
    '"elevenlabs", "deepgram".',
    default=None,
    show_envvar=True,
    envvar="GEMINI_MEET_TTS",
)
@click.option(
    "--vad-arg",
    "--vad-args",
    "vad_args",
    multiple=True,
    metavar="KEY=VAL",
    callback=_parse_kv,
    help="Arguments for the VAD service in the form of key=value. "
    "Can be specified multiple times.",
)
@click.option(
    "--stt-arg",
    "--stt-args",
    "stt_args",
    multiple=True,
    metavar="KEY=VAL",
    callback=_parse_kv,
    help="Arguments for the STT service in the form of key=value. "
    "Can be specified multiple times.",
)
@click.option(
    "--tts-arg",
    "--tts-args",
    "tts_args",
    multiple=True,
    metavar="KEY=VAL",
    callback=_parse_kv,
    help="Arguments for the TTS service in the form of key=value. "
    "Can be specified multiple times.",
)
@click.option(
    "--transcription-controller-arg",
    "--transcription-controller-args",
    "transcription_controller_args",
    multiple=True,
    metavar="KEY=VAL",
    callback=_parse_kv,
    help="Arguments for the transcription controller in the form of key=value. "
    "Can be specified multiple times.",
)
@click.option(
    "--speech-controller-arg",
    "--speech-controller-args",
    "speech_controller_args",
    multiple=True,
    metavar="KEY=VAL",
    callback=_parse_kv,
    help="Arguments for the speech controller in the form of key=value. "
    "Can be specified multiple times.",
)
@click.option(
    "-v",
    "--verbose",
    count=True,
    help="Increase logging verbosity (can be used multiple times).",
    default=1,
)
@click.option(
    "-q", "--quiet", is_flag=True, help="Suppress all but error and critical logging."
)
@click.argument(
    "meeting-url",
    type=str,
    required=True,
)
def cli(  # noqa: PLR0913
    *,
    gemini_meet_url: str,
    name: str,
    llm_provider: str,
    llm_model: str,
    prompt: str | None,
    prompt_file: str | None,
    prompt_style: str,
    name_trigger: bool,
    mcp_config: str | None,
    meeting_url: str,
    verbose: int,
    quiet: bool,
    **settings: Any,  # noqa: ANN401
) -> None:
    """Run the gemini_meet client."""
    from rich.logging import RichHandler

    log_level = logging.WARNING
    if quiet:
        log_level = logging.ERROR
    elif verbose == 1:
        log_level = logging.INFO
    elif verbose == 2:  # noqa: PLR2004
        log_level = logging.DEBUG

    logging.basicConfig(
        level=log_level,
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(rich_tracebacks=True)],
    )
    logging.getLogger("gemini_meet_client").setLevel(log_level)
    logging.getLogger("gemini_meet").setLevel(log_level)

    if prompt_file and not prompt:
        try:
            with Path(prompt_file).open("r") as f:
                prompt = f.read().strip()
        except Exception:
            logger.exception("Failed to load prompt file")
            prompt = None

    mcp_config_dict: dict[str, Any] | None = None
    if mcp_config:
        try:
            with Path(mcp_config).open("r") as f:
                mcp_config_dict = json.load(f)
        except Exception:
            logger.exception("Failed to load MCP configuration file")
            mcp_config_dict = None

    try:
        asyncio.run(
            run(
                gemini_meet_url=gemini_meet_url,
                meeting_url=meeting_url,
                llm_provider=llm_provider,
                llm_model=llm_model,
                prompt=prompt,
                prompt_style=prompt_style,
                name=name,
                name_trigger=name_trigger,
                mcp_config=mcp_config_dict,
                settings={k: v for k, v in settings.items() if v is not None},
            )
        )
    except KeyboardInterrupt:
        logger.info("Exiting due to keyboard interrupt.")


async def run(  # noqa: PLR0913
    gemini_meet_url: str | FastMCP,
    meeting_url: str,
    llm_provider: str,
    llm_model: str,
    *,
    prompt: str | None = None,
    prompt_style: str | None = None,
    name: str | None = None,
    name_trigger: bool = False,
    mcp_config: dict[str, Any] | None = None,
    settings: dict[str, Any] | None = None,
) -> None:
    """Run the gemini_meet client.

    Args:
        gemini_meet_url (str | FastMCP): The URL of the gemini_meet server or a FastMCP instance.
        meeting_url (str): The URL of the meeting to join.
        llm_provider (str): The provider of the LLM model to use.
        llm_model (str): The name of the LLM model to use.
        prompt (str | None): System prompt to use for the model.
        prompt_style (str | None): Default prompt to use if no custom one is provided.
        name (str | None): The name of the participant.
        name_trigger (bool): Whether to trigger the agent only when the name is
            mentioned.
        mcp_config (dict[str, Any] | None): Configuration for additional MCP servers.
        settings (dict[str, Any] | None): Additional settings for the client.
    """
    client = GeminiMeetClient(
        gemini_meet_url,
        name=name,
        name_trigger=name_trigger,
        settings=settings,
    )

    if mcp_config and "mcpServers" not in mcp_config:
        logger.warning(
            "MCP configuration does not contain 'mcpServers'. "
            "Using the main gemini_meet client only."
        )
        mcp_config = None
    elif mcp_config and "gemini_meet" in mcp_config["mcpServers"]:
        mcp_config["_gemini_meet"] = mcp_config.pop("gemini_meet")

    additional_clients = (
        {
            name: Client({"mcpServers": {name: config}})
            for name, config in mcp_config["mcpServers"].items()
        }
        if mcp_config
        else {}
    )

    async def log_segments(segments: list[TranscriptSegment]) -> None:
        """Log segments received from the client."""
        for segment in segments:
            logger.info('%s: "%s"', segment.speaker or "Participant", segment.text)

    client.add_segment_callback(log_segments)
    llm = get_llm(llm_provider, llm_model)

    async with AsyncExitStack() as stack:
        await stack.enter_async_context(client)
        for client_name, additional_client in additional_clients.items():
            logger.info("Connecting to %s", client_name)
            await stack.enter_async_context(additional_client)
            logger.debug("Connected to %s", client_name)

        gemini_meet_config = McpClientConfig(
            client=client.client, exclude=["join_meeting"]
        )
        tools, tool_executor = await load_tools(
            gemini_meet_config
            if not additional_clients
            else {
                "gemini_meet": gemini_meet_config,
                **{
                    name: McpClientConfig(client)
                    for name, client in additional_clients.items()
                },
            }
        )

        formatted_prompt, prompt_template, prompt_variables = get_prompt_components(
            instructions=prompt,
            prompt_style=prompt_style,
            name=client.name,
        )

        agent = ConversationalToolAgent(
            llm,
            tools,
            tool_executor,
            prompt=formatted_prompt,
            prompt_template=prompt_template,
            prompt_variables=prompt_variables,
        )
        client.add_utterance_callback(agent.on_utterance)

        async with agent:
            await client.join_meeting(meeting_url)
            try:
                await asyncio.Event().wait()
            finally:
                usage = agent.usage.merge(await client.get_usage())
                if usage.root:
                    logger.info("Usage:\n%s", usage)


if __name__ == "__main__":
    cli()
