import base64
import json
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Annotated, Literal

from fastmcp import Context, FastMCP
from mcp.types import ImageContent
from pydantic import AnyUrl, Field, ValidationError
from starlette.requests import Request
from starlette.responses import JSONResponse

from joinly.container import SessionContainer
from joinly.session import MeetingSession
from joinly.settings import Settings, get_settings, reset_settings, set_settings
from joinly.types import (
    MeetingChatHistory,
    MeetingParticipantList,
    SpeakerRole,
    SpeechInterruptedError,
    Transcript,
    Usage,
)
from joinly.utils.datadog import (
    track_meeting_join,
    track_meeting_leave,
    track_speech,
    track_tool,
    track_error,
)
from joinly.utils.usage import get_usage, reset_usage, set_usage

logger = logging.getLogger(__name__)

TRANSCRIPT_URL = AnyUrl("transcript://live")
SEGMENTS_URL = AnyUrl("transcript://live/segments")


@dataclass
class SessionContext:
    """Context for the meeting session."""

    meeting_session: MeetingSession


def _extract_settings() -> Settings:
    """Extract settings from the HTTP headers."""
    current = get_settings()
    try:
        from fastmcp.server.http import _current_http_request

        request = _current_http_request.get()
        header = request.headers.get("joinly-settings") if request is not None else None
    except RuntimeError:
        logger.exception("Failed to get HTTP headers")
        header = None

    if not header:
        return current

    try:
        base = current.model_copy(deep=True).model_dump()
        patch = Settings.model_validate(json.loads(header)).model_dump(
            exclude_unset=True
        )
        for k, v in patch.items():
            base[k] = (base.get(k, {}) | v) if isinstance(v, dict) else v
        settings = Settings.model_validate(base)
    except (json.JSONDecodeError, ValidationError):
        msg = "Invalid joinly-settings."
        logger.exception(msg)
        logger.warning("Continuing with current settings")
        return current

    return settings


@asynccontextmanager
async def session_lifespan(server: FastMCP) -> AsyncIterator[SessionContext]:
    """Create and enter a MeetingSession once per client connection."""
    logger.info("Creating meeting session")
    settings = _extract_settings()
    settings_token = set_settings(settings)
    usage = Usage()
    usage_token = set_usage(usage)
    session_container = SessionContainer()
    meeting_session = await session_container.__aenter__()

    _remover: dict[AnyUrl, Callable[[], None]] = {}

    @server._mcp_server.subscribe_resource()  # noqa: SLF001
    async def _handle_subscribe_resource(url: AnyUrl) -> None:
        if url not in (TRANSCRIPT_URL, SEGMENTS_URL) or url in _remover:
            return
        logger.debug("Subscribing to resource: %s", url)
        session = server._mcp_server.request_context.session  # noqa: SLF001

        _event = "utterance" if url == TRANSCRIPT_URL else "segment"

        async def _push() -> None:
            logger.debug("Sending %s notification", _event)
            await session.send_resource_updated(url)

        _remover[url] = meeting_session.subscribe(_event, _push)

    @server._mcp_server.unsubscribe_resource()  # noqa: SLF001
    async def _handle_unsubscribe_resource(url: AnyUrl) -> None:
        if url in _remover:
            logger.debug("Unsubscribing from resource: %s", url)
            _remover[url]()
            _remover.pop(url)

    try:
        yield SessionContext(meeting_session=meeting_session)
    finally:
        for _rem in _remover.values():
            _rem()

        # ensure proper cleanup
        from anyio import CancelScope

        with CancelScope(shield=True):
            await session_container.__aexit__()

        reset_settings(settings_token)
        reset_usage(usage_token)


mcp = FastMCP("joinly", lifespan=session_lifespan)


@mcp.resource(
    str(TRANSCRIPT_URL),
    description="Live transcript of the meeting participant utterances.",
    mime_type="application/json",
)
async def get_transcript(ctx: Context) -> Transcript:
    """Get the live transcript of the meeting."""
    ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
    return ms.transcript.with_role(SpeakerRole.participant)


@mcp.resource(
    str(SEGMENTS_URL),
    description="Live transcript segments.",
    mime_type="application/json",
)
async def get_transcript_segments(ctx: Context) -> Transcript:
    """Get the live transcript segments of the meeting."""
    ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
    return ms.transcript


@mcp.resource(
    "usage://current",
    description="Current usage statistics of services",
    mime_type="application/json",
)
async def get_usage_report(_ctx: Context) -> Usage:
    """Get the current usage statistics."""
    return get_usage()


@mcp.tool(
    "join_meeting",
    description="Join a meeting with the given URL and participant name.",
)
async def join_meeting(
    ctx: Context,
    meeting_url: Annotated[
        str | None, Field(default=None, description="URL to join an online meeting")
    ],
    participant_name: Annotated[
        str | None,
        Field(default=None, description="Name of the participant to join as"),
    ],
    passcode: Annotated[
        str | None,
        Field(
            default=None,
            description="Password or passcode for the meeting (if required)",
        ),
    ] = None,
) -> str:
    """Join a meeting with the given URL and participant name."""
    with track_meeting_join(
        meeting_url=meeting_url,
        participant_name=participant_name,
    ) as ctx_dd:
        try:
            ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
            await ms.join_meeting(meeting_url, participant_name, passcode)
            ctx_dd["output_data"] = "Joined meeting successfully"
            ctx_dd["metadata"]["status"] = "joined"
            ctx_dd["metadata"]["has_passcode"] = passcode is not None
            return "Joined meeting."
        except Exception as e:
            track_error(e, operation="join_meeting")
            raise


@mcp.tool(
    "leave_meeting",
    description="Leave the current meeting.",
)
async def leave_meeting(
    ctx: Context,
) -> str:
    """Leave the current meeting."""
    with track_meeting_leave() as ctx_dd:
        try:
            ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
            await ms.leave_meeting()
            ctx_dd["output_data"] = "Left meeting successfully"
            ctx_dd["metadata"]["status"] = "left"
            return "Left the meeting."
        except Exception as e:
            track_error(e, operation="leave_meeting")
            raise


@mcp.tool(
    "speak_text",
    description="Speak the given text in the meeting.",
)
async def speak_text(
    ctx: Context,
    text: Annotated[str, Field(description="Text to be spoken")],
) -> str:
    """Speak the given text in the meeting using TTS."""
    with track_speech(text) as ctx_dd:
        ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
        try:
            await ms.speak_text(text)
            ctx_dd["output_data"] = "Finished speaking"
            ctx_dd["metadata"]["status"] = "completed"
            return "Finished speaking."
        except SpeechInterruptedError as e:
            ctx_dd["output_data"] = str(e)
            ctx_dd["metadata"]["status"] = "interrupted"
            ctx_dd["metadata"]["interrupted"] = True
            ctx_dd["metadata"]["spoken_text"] = e.spoken_text
            return str(e)


@mcp.tool(
    "send_chat_message",
    description="Send a chat message in the meeting chat.",
)
async def send_chat_message(
    ctx: Context,
    message: Annotated[str, Field(description="Message to be sent")],
) -> str:
    """Send a chat message in the meeting."""
    with track_tool(
        "chat.send",
        arguments={"message": message[:100] if len(message) > 100 else message},
        metadata={"message.length": len(message)},
    ) as ctx_dd:
        ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
        await ms.send_chat_message(message)
        ctx_dd["output_data"] = "Sent message"
        return "Sent message."


@mcp.tool(
    "get_chat_history",
    description="Get the chat history from the chat inside the meeting.",
)
async def get_chat_history(
    ctx: Context,
) -> MeetingChatHistory:
    """Get the chat history from the meeting."""
    with track_tool("chat.get_history") as ctx_dd:
        ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
        history = await ms.get_chat_history()
        ctx_dd["metadata"]["message_count"] = len(history.messages)
        ctx_dd["output_data"] = f"Retrieved {len(history.messages)} messages"
        return history


@mcp.tool(
    "get_transcript",
    description=(
        "Get the transcript of the meeting. By default, returns the full transcript. "
        "To get a slice, set mode to 'first' or 'latest' and provide a positive "
        "minutes value."
    ),
)
async def get_transcript_tool(
    ctx: Context,
    mode: Annotated[
        Literal["full", "first", "latest"],
        Field(
            default="full",
            description="Mode to get the transcript: 'full' for the entire transcript, "
            "'first' for the first N minutes, 'latest' for the last N minutes.",
        ),
    ] = "full",
    minutes: Annotated[
        int,
        Field(
            default=0,
            description="Number of minutes to slice the transcript. "
            "Only used if mode is 'first' or 'latest'.",
        ),
    ] = 0,
) -> Transcript:
    """Get the transcript of the meeting."""
    with track_tool(
        "transcript.get",
        arguments={"mode": mode, "minutes": minutes},
    ) as ctx_dd:
        ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
        if mode == "first":
            transcript = ms.transcript.before(minutes * 60).compact()
        elif mode == "latest":
            transcript = ms.transcript.after(
                ms.meeting_seconds - minutes * 60
            ).compact()
        else:
            transcript = ms.transcript.compact()
        ctx_dd["metadata"]["segment_count"] = len(transcript.segments)
        ctx_dd["metadata"]["speaker_count"] = len(transcript.speakers)
        ctx_dd["output_data"] = f"Retrieved {len(transcript.segments)} segments"
        return transcript


@mcp.tool(
    "get_participants",
    description="Get the list of participants in the meeting.",
)
async def get_participants(
    ctx: Context,
) -> MeetingParticipantList:
    """Get the list of participants in the meeting."""
    with track_tool("meeting.get_participants") as ctx_dd:
        ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
        participants = await ms.get_participants()
        ctx_dd["metadata"]["participant_count"] = len(participants)
        ctx_dd["output_data"] = f"Retrieved {len(participants)} participants"
        return MeetingParticipantList(participants)


@mcp.tool(
    "get_video_snapshot",
    description=(
        "Get a snapshot of the current video feed, including participant webcams and "
        "screenshares inside the meeting."
    ),
)
async def get_video_snapshot(ctx: Context) -> ImageContent:
    """Get a snapshot of the current video feed."""
    with track_tool("video.snapshot") as ctx_dd:
        ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
        snapshot = await ms.get_video_snapshot()
        ctx_dd["metadata"]["image.size_bytes"] = len(snapshot.data)
        ctx_dd["metadata"]["image.media_type"] = snapshot.media_type
        ctx_dd["output_data"] = (
            f"Captured {snapshot.media_type} ({len(snapshot.data)} bytes)"
        )
        return ImageContent(
            type="image",
            data=base64.b64encode(snapshot.data).decode(),
            mimeType=snapshot.media_type,
        )


@mcp.tool(
    "mute_yourself",
    description="Mute yourself in the meeting.",
)
async def mute_yourself(
    ctx: Context,
) -> str:
    """Mute yourself in the meeting."""
    with track_tool("audio.mute") as ctx_dd:
        ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
        await ms.mute()
        ctx_dd["output_data"] = "Muted successfully"
        return "Muted yourself."


@mcp.tool(
    "unmute_yourself",
    description="Unmute yourself in the meeting.",
)
async def unmute_yourself(
    ctx: Context,
) -> str:
    """Unmute yourself in the meeting."""
    with track_tool("audio.unmute") as ctx_dd:
        ms: MeetingSession = ctx.request_context.lifespan_context.meeting_session
        await ms.unmute()
        ctx_dd["output_data"] = "Unmuted successfully"
        return "Unmuted yourself."


@mcp.custom_route("/health", methods=["GET"])
async def health_check(_req: Request) -> JSONResponse:
    """Health check endpoint."""
    return JSONResponse({"status": "healthy"})


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
