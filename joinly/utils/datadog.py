"""Datadog integration utilities for monitoring and LLM observability."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Generator

logger = logging.getLogger(__name__)

# Global state for tracking
_llmobs_enabled = False
_metrics: dict[str, float] = {}


def initialize_datadog() -> None:
    """Initialize Datadog LLM Observability.

    This uses the SDK-based approach for LLM Observability which supports
    agentless mode (sending data directly to Datadog without a local agent).

    Environment variables used:
        DD_SITE: Datadog site (default: datadoghq.com)
        DD_API_KEY: Datadog API key (required)
        DD_SERVICE: Service name (default: joinly)
        DD_ENV: Environment name (default: production)
        DD_VERSION: Application version
        DD_LLMOBS_ENABLED: Enable LLM Observability (default: 1)
        DD_LLMOBS_ML_APP: ML application name (default: joinly-agent)
        DD_TRACE_ENABLED: Enable APM tracing - requires local agent (default: false)
    """
    global _llmobs_enabled

    # Check for API key
    api_key = os.getenv("DD_API_KEY")
    if not api_key:
        logger.warning(
            "DD_API_KEY not set. Datadog monitoring will not be available. "
            "Set DD_API_KEY environment variable to enable Datadog integration."
        )
        return

    # Get configuration
    site = os.getenv("DD_SITE", "datadoghq.com")
    service = os.getenv("DD_SERVICE", "joinly")
    env = os.getenv("DD_ENV", "production")
    version = os.getenv("DD_VERSION", "0.5.2")

    # Set environment variables BEFORE importing ddtrace
    os.environ.setdefault("DD_SERVICE", service)
    os.environ.setdefault("DD_ENV", env)
    os.environ.setdefault("DD_VERSION", version)
    os.environ["DD_API_KEY"] = api_key
    os.environ["DD_SITE"] = site

    # Check if APM tracing is enabled (requires local Datadog Agent)
    apm_enabled = os.getenv("DD_TRACE_ENABLED", "false").lower() in (
        "true",
        "1",
        "yes",
    )

    # LLM Observability settings
    llmobs_enabled = os.getenv("DD_LLMOBS_ENABLED", "1").lower() in (
        "true",
        "1",
        "yes",
    )
    llmobs_ml_app = os.getenv("DD_LLMOBS_ML_APP", "joinly-agent")

    if llmobs_enabled:
        os.environ["DD_LLMOBS_ENABLED"] = "1"
        os.environ["DD_LLMOBS_ML_APP"] = llmobs_ml_app
        os.environ["DD_LLMOBS_AGENTLESS_ENABLED"] = "1"

    if not apm_enabled:
        os.environ["DD_TRACE_ENABLED"] = "false"
        logger.debug(
            "APM tracing disabled (no local agent). "
            "Set DD_TRACE_ENABLED=true if you have Datadog Agent running."
        )

    # NOW import ddtrace after environment variables are set
    try:
        from ddtrace import patch
    except ImportError:
        logger.warning(
            "ddtrace not installed. Datadog monitoring will not be available. "
            "Install with: pip install ddtrace"
        )
        return

    # Initialize LLM Observability SDK if enabled
    if llmobs_enabled:
        try:
            from ddtrace.llmobs import LLMObs

            LLMObs.enable(
                ml_app=llmobs_ml_app,
                api_key=api_key,
                site=site,
                agentless_enabled=True,
                env=env,
                service=service,
            )
            _llmobs_enabled = True
            logger.info(
                "LLM Observability enabled: ml_app=%s, site=%s, agentless=True",
                llmobs_ml_app,
                site,
            )
        except ImportError:
            logger.warning(
                "ddtrace.llmobs not available. "
                "LLM Observability requires ddtrace >= 2.0.0"
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("Failed to enable LLM Observability: %s", e)

    # Patch libraries for auto-instrumentation
    _patch_libraries(patch)

    logger.info(
        "Datadog initialized: service=%s, env=%s, site=%s, "
        "llm_observability=%s, apm_tracing=%s",
        service,
        env,
        site,
        llmobs_enabled,
        apm_enabled,
    )


def _patch_libraries(patch: Any) -> None:  # noqa: ANN401
    """Patch common libraries for auto-instrumentation."""
    for lib in ("openai", "anthropic", "httpx", "aiohttp"):
        try:
            patch(**{lib: True})
            logger.debug("Patched %s for Datadog", lib)
        except Exception:  # noqa: BLE001
            logger.debug("%s patching skipped", lib)


def is_llmobs_enabled() -> bool:
    """Check if LLM Observability is enabled."""
    return _llmobs_enabled


# =============================================================================
# LLM Observability Span Context Managers
# =============================================================================


@contextmanager
def track_workflow(
    name: str,
    *,
    session_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Generator[dict[str, Any], None, None]:
    """Track a workflow span (e.g., meeting session, conversation).

    Args:
        name: Name of the workflow (e.g., "meeting.session")
        session_id: Optional session ID to link related spans
        metadata: Optional metadata to attach

    Yields:
        A dict that can be updated with output_data and additional metadata.
    """
    context: dict[str, Any] = {
        "start_time": time.time(),
        "metadata": metadata or {},
        "output_data": None,
        "error": None,
        "cancelled": False,
    }

    if not _llmobs_enabled:
        try:
            yield context
        except asyncio.CancelledError:
            context["cancelled"] = True
            raise
        return

    cancelled_error: asyncio.CancelledError | None = None
    try:
        from ddtrace.llmobs import LLMObs

        with LLMObs.workflow(name=name, session_id=session_id) as span:
            try:
                yield context
            except asyncio.CancelledError as e:
                # CancelledError is expected - don't mark as error
                context["cancelled"] = True
                context["metadata"]["cancelled"] = True
                cancelled_error = e
            except Exception as e:
                context["error"] = e
                raise
            finally:
                duration = time.time() - context["start_time"]
                context["metadata"]["duration_seconds"] = round(duration, 3)

                LLMObs.annotate(
                    span=span,
                    metadata=context["metadata"],
                    output_data=context.get("output_data"),
                )
    except ImportError:
        try:
            yield context
        except asyncio.CancelledError as e:
            context["cancelled"] = True
            cancelled_error = e

    if cancelled_error is not None:
        raise cancelled_error


@contextmanager
def track_agent(
    name: str = "agent",
    *,
    session_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Generator[dict[str, Any], None, None]:
    """Track an agent span (e.g., agent conversation run).

    Args:
        name: Name of the agent operation
        session_id: Optional session ID to link related spans
        metadata: Optional metadata to attach

    Yields:
        A dict that can be updated with output_data and additional metadata.
    """
    context: dict[str, Any] = {
        "start_time": time.time(),
        "metadata": metadata or {},
        "output_data": None,
        "input_data": None,
        "error": None,
        "cancelled": False,
    }

    if not _llmobs_enabled:
        try:
            yield context
        except asyncio.CancelledError:
            context["cancelled"] = True
            raise
        return

    cancelled_error: asyncio.CancelledError | None = None
    try:
        from ddtrace.llmobs import LLMObs

        with LLMObs.agent(name=name, session_id=session_id) as span:
            try:
                yield context
            except asyncio.CancelledError as e:
                # CancelledError is expected - don't mark as error
                context["cancelled"] = True
                context["metadata"]["cancelled"] = True
                cancelled_error = e
            except Exception as e:
                context["error"] = e
                raise
            finally:
                duration = time.time() - context["start_time"]
                context["metadata"]["duration_seconds"] = round(duration, 3)

                LLMObs.annotate(
                    span=span,
                    input_data=context.get("input_data"),
                    output_data=context.get("output_data"),
                    metadata=context["metadata"],
                )
    except ImportError:
        try:
            yield context
        except asyncio.CancelledError as e:
            context["cancelled"] = True
            cancelled_error = e

    if cancelled_error is not None:
        raise cancelled_error


@contextmanager
def track_tool(
    name: str,
    *,
    arguments: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> Generator[dict[str, Any], None, None]:
    """Track a tool execution span.

    Args:
        name: Name of the tool being executed
        arguments: Tool input arguments
        metadata: Optional metadata to attach

    Yields:
        A dict that can be updated with output_data and additional metadata.
    """
    context: dict[str, Any] = {
        "start_time": time.time(),
        "metadata": metadata or {},
        "output_data": None,
        "error": None,
        "cancelled": False,
    }

    if not _llmobs_enabled:
        try:
            yield context
        except asyncio.CancelledError:
            context["cancelled"] = True
            raise
        return

    cancelled_error: asyncio.CancelledError | None = None
    try:
        from ddtrace.llmobs import LLMObs

        with LLMObs.tool(name=name) as span:
            try:
                yield context
            except asyncio.CancelledError as e:
                # CancelledError is expected behavior - capture but don't re-raise
                # inside span to prevent Datadog from marking as error
                context["cancelled"] = True
                context["metadata"]["cancelled"] = True
                context["output_data"] = "Tool cancelled"
                cancelled_error = e
            except Exception as e:
                context["error"] = e
                context["metadata"]["error"] = True
                context["metadata"]["error.type"] = type(e).__name__
                context["metadata"]["error.message"] = str(e)
                raise
            finally:
                duration = time.time() - context["start_time"]
                context["metadata"]["duration_seconds"] = round(duration, 3)

                # Increment tool counter
                increment_metric("tools.executed")

                LLMObs.annotate(
                    span=span,
                    input_data=arguments,
                    output_data=context.get("output_data"),
                    metadata=context["metadata"],
                )
    except ImportError:
        try:
            yield context
        except asyncio.CancelledError as e:
            context["cancelled"] = True
            cancelled_error = e

    # Re-raise CancelledError outside the span context so it doesn't show as error
    if cancelled_error is not None:
        raise cancelled_error


@contextmanager
def track_task(
    name: str,
    *,
    input_data: Any = None,  # noqa: ANN401
    metadata: dict[str, Any] | None = None,
) -> Generator[dict[str, Any], None, None]:
    """Track a task span (e.g., transcription, speech synthesis).

    Args:
        name: Name of the task
        input_data: Input to the task
        metadata: Optional metadata to attach

    Yields:
        A dict that can be updated with output_data and additional metadata.
    """
    context: dict[str, Any] = {
        "start_time": time.time(),
        "metadata": metadata or {},
        "output_data": None,
        "error": None,
        "cancelled": False,
    }

    if not _llmobs_enabled:
        try:
            yield context
        except asyncio.CancelledError:
            context["cancelled"] = True
            raise
        return

    cancelled_error: asyncio.CancelledError | None = None
    try:
        from ddtrace.llmobs import LLMObs

        with LLMObs.task(name=name) as span:
            try:
                yield context
            except asyncio.CancelledError as e:
                # CancelledError is expected behavior (e.g., speech interrupted)
                # Capture it but don't re-raise inside the span - this prevents
                # Datadog from marking it as an error
                context["cancelled"] = True
                context["metadata"]["cancelled"] = True
                context["output_data"] = "Task cancelled"
                cancelled_error = e
            except Exception as e:
                context["error"] = e
                context["metadata"]["error"] = True
                context["metadata"]["error.type"] = type(e).__name__
                raise
            finally:
                duration = time.time() - context["start_time"]
                context["metadata"]["duration_seconds"] = round(duration, 3)

                LLMObs.annotate(
                    span=span,
                    input_data=input_data,
                    output_data=context.get("output_data"),
                    metadata=context["metadata"],
                )
    except ImportError:
        try:
            yield context
        except asyncio.CancelledError as e:
            context["cancelled"] = True
            cancelled_error = e

    # Re-raise CancelledError outside the span context so it doesn't show as error
    if cancelled_error is not None:
        raise cancelled_error


@contextmanager
def track_llm(
    model_name: str,
    model_provider: str,
    *,
    name: str = "chat",
    metadata: dict[str, Any] | None = None,
) -> Generator[dict[str, Any], None, None]:
    """Track an LLM call span.

    Args:
        model_name: Name of the LLM model
        model_provider: Provider of the model (openai, anthropic, google, etc.)
        name: Name of the operation (default: "chat")
        metadata: Optional metadata to attach

    Yields:
        A dict that can be updated with input/output messages and metrics.
    """
    context: dict[str, Any] = {
        "start_time": time.time(),
        "metadata": metadata or {},
        "input_data": None,
        "output_data": None,
        "metrics": {},
        "error": None,
        "cancelled": False,
    }

    if not _llmobs_enabled:
        try:
            yield context
        except asyncio.CancelledError:
            context["cancelled"] = True
            raise
        return

    cancelled_error: asyncio.CancelledError | None = None
    try:
        from ddtrace.llmobs import LLMObs

        with LLMObs.llm(
            model_name=model_name,
            model_provider=model_provider,
            name=name,
        ) as span:
            try:
                yield context
            except asyncio.CancelledError as e:
                # CancelledError is expected - don't mark as error
                context["cancelled"] = True
                context["metadata"]["cancelled"] = True
                cancelled_error = e
            except Exception as e:
                context["error"] = e
                context["metadata"]["error"] = True
                context["metadata"]["error.type"] = type(e).__name__
                context["metadata"]["error.message"] = str(e)
                increment_metric("errors.llm")
                raise
            finally:
                duration = time.time() - context["start_time"]
                context["metadata"]["duration_seconds"] = round(duration, 3)
                context["metadata"]["model"] = model_name
                context["metadata"]["provider"] = model_provider

                # Track token metrics
                metrics = context.get("metrics", {})
                if "input_tokens" in metrics:
                    increment_metric("llm.tokens.input", metrics["input_tokens"])
                if "output_tokens" in metrics:
                    increment_metric("llm.tokens.output", metrics["output_tokens"])

                LLMObs.annotate(
                    span=span,
                    input_data=context.get("input_data"),
                    output_data=context.get("output_data"),
                    metrics=metrics or None,
                    metadata=context["metadata"],
                )
    except ImportError:
        try:
            yield context
        except asyncio.CancelledError as e:
            context["cancelled"] = True
            cancelled_error = e

    if cancelled_error is not None:
        raise cancelled_error


# =============================================================================
# Meeting-Specific Tracking
# =============================================================================


@contextmanager
def track_meeting_session(
    meeting_url: str | None = None,
    participant_name: str | None = None,
) -> Generator[dict[str, Any], None, None]:
    """Track a complete meeting session as a workflow.

    Args:
        meeting_url: URL of the meeting
        participant_name: Name of the participant

    Yields:
        A dict for tracking session data.
    """
    session_id = f"meeting-{time.time_ns()}"
    metadata = {
        "meeting.url": meeting_url or "unknown",
        "participant.name": participant_name or "unknown",
    }

    with track_workflow(
        "meeting.session",
        session_id=session_id,
        metadata=metadata,
    ) as ctx:
        ctx["session_id"] = session_id
        increment_metric("meetings.joined")
        yield ctx


@contextmanager
def track_meeting_join(
    meeting_url: str | None = None,
    participant_name: str | None = None,
) -> Generator[dict[str, Any], None, None]:
    """Track joining a meeting as a tool operation.

    Args:
        meeting_url: URL of the meeting
        participant_name: Name of the participant

    Yields:
        A dict for tracking join operation.
    """
    with track_tool(
        "meeting.join",
        arguments={
            "meeting_url": meeting_url,
            "participant_name": participant_name,
        },
        metadata={"operation": "join"},
    ) as ctx:
        yield ctx


@contextmanager
def track_meeting_leave() -> Generator[dict[str, Any], None, None]:
    """Track leaving a meeting as a tool operation."""
    with track_tool(
        "meeting.leave",
        metadata={"operation": "leave"},
    ) as ctx:
        yield ctx


# =============================================================================
# Speech Tracking
# =============================================================================


@contextmanager
def track_speech(
    text: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> Generator[dict[str, Any], None, None]:
    """Track text-to-speech as a task.

    Args:
        text: Text being spoken
        metadata: Additional metadata

    Yields:
        A dict for tracking speech operation.
    """
    with track_task(
        "speech.tts",
        input_data=text,
        metadata={
            "text.length": len(text),
            "text.preview": text[:100] if len(text) > 100 else text,
            **(metadata or {}),
        },
    ) as ctx:
        yield ctx


@contextmanager
def track_transcription(
    *,
    metadata: dict[str, Any] | None = None,
) -> Generator[dict[str, Any], None, None]:
    """Track speech-to-text transcription as a task.

    Args:
        metadata: Additional metadata

    Yields:
        A dict for tracking transcription.
    """
    with track_task(
        "speech.transcription",
        metadata=metadata or {},
    ) as ctx:
        yield ctx


# =============================================================================
# Metrics Tracking
# =============================================================================


def increment_metric(name: str, value: float = 1.0) -> None:
    """Increment a custom metric.

    Args:
        name: Name of the metric
        value: Value to increment by (default: 1.0)
    """
    _metrics[name] = _metrics.get(name, 0.0) + value


def get_metric(name: str) -> float:
    """Get the current value of a metric.

    Args:
        name: Name of the metric

    Returns:
        Current metric value (0.0 if not set)
    """
    return _metrics.get(name, 0.0)


def get_all_metrics() -> dict[str, float]:
    """Get all tracked metrics.

    Returns:
        Dict of all metric names to values.
    """
    return _metrics.copy()


def reset_metrics() -> None:
    """Reset all metrics to zero."""
    _metrics.clear()


# =============================================================================
# Error Tracking
# =============================================================================


def track_error(
    error: Exception,
    *,
    operation: str | None = None,
    context: dict[str, Any] | None = None,
) -> None:
    """Track an error event.

    Args:
        error: The exception that occurred
        operation: Name of the operation where error occurred
        context: Additional context about the error
    """
    increment_metric("errors.total")
    if operation:
        increment_metric(f"errors.{operation}")

    if not _llmobs_enabled:
        return

    try:
        from ddtrace.llmobs import LLMObs

        # Annotate current span with error info if there is one
        LLMObs.annotate(
            metadata={
                "error": True,
                "error.type": type(error).__name__,
                "error.message": str(error),
                "error.operation": operation,
                **(context or {}),
            }
        )
    except Exception:  # noqa: BLE001
        pass  # Don't fail if annotation fails


# =============================================================================
# Legacy API (for backward compatibility)
# =============================================================================


def get_tracer() -> Any:  # noqa: ANN401
    """Get the Datadog tracer instance.

    Returns:
        The Datadog tracer instance, or None if Datadog is not available.
    """
    try:
        from ddtrace import tracer

        return tracer
    except ImportError:
        return None


def create_span(
    operation_name: str,
    service: str | None = None,
    resource: str | None = None,
    tags: dict[str, Any] | None = None,
) -> Any:  # noqa: ANN401
    """Create a Datadog span for custom instrumentation (legacy).

    Args:
        operation_name: Name of the operation being traced.
        service: Service name (defaults to DD_SERVICE or 'joinly').
        resource: Resource name for the span.
        tags: Additional tags to add to the span.

    Returns:
        A Datadog span context manager, or a no-op context manager.
    """
    tracer = get_tracer()
    if tracer is None:
        from contextlib import nullcontext

        return nullcontext()

    span = tracer.trace(
        operation_name,
        service=service or os.getenv("DD_SERVICE", "joinly"),
        resource=resource or operation_name,
    )

    if tags:
        for key, value in tags.items():
            span.set_tag(key, value)

    return span


def set_span_tag(key: str, value: Any) -> None:  # noqa: ANN401
    """Set a tag on the current active span."""
    tracer = get_tracer()
    if tracer is None:
        return

    span = tracer.current_span()
    if span:
        span.set_tag(key, value)


def set_span_metric(key: str, value: float) -> None:
    """Set a metric on the current active span."""
    tracer = get_tracer()
    if tracer is None:
        return

    span = tracer.current_span()
    if span:
        span.set_metric(key, value)
