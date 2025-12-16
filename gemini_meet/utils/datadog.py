"""Datadog integration utilities for monitoring and LLM observability."""

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def initialize_datadog() -> None:
    """Initialize Datadog LLM Observability.

    This uses the SDK-based approach for LLM Observability which supports
    agentless mode (sending data directly to Datadog without a local agent).

    For full APM tracing, you need to run the Datadog Agent locally.
    This implementation focuses on LLM Observability which works agentless.

    Environment variables used:
        DD_SITE: Datadog site (default: datadoghq.com)
        DD_API_KEY: Datadog API key (required)
        DD_SERVICE: Service name (default: gemini_meet)
        DD_ENV: Environment name (default: production)
        DD_VERSION: Application version
        DD_LLMOBS_ENABLED: Enable LLM Observability (default: 1)
        DD_LLMOBS_ML_APP: ML application name (default: gemini_meet-agent)
        DD_TRACE_ENABLED: Enable APM tracing - requires local agent (default: false)
    """
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
    service = os.getenv("DD_SERVICE", "gemini-meet")
    env = os.getenv("DD_ENV", "production")
    version = os.getenv("DD_VERSION", "0.5.2")

    # =========================================================================
    # Set environment variables BEFORE importing ddtrace
    # =========================================================================
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
    llmobs_ml_app = os.getenv("DD_LLMOBS_ML_APP", "gemini-meet-agent")

    if llmobs_enabled:
        # Enable agentless mode for LLM Observability
        os.environ["DD_LLMOBS_ENABLED"] = "1"
        os.environ["DD_LLMOBS_ML_APP"] = llmobs_ml_app
        os.environ["DD_LLMOBS_AGENTLESS_ENABLED"] = "1"

    if not apm_enabled:
        # Disable APM tracing when no local agent is available
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
        except Exception as e:
            logger.warning("Failed to enable LLM Observability: %s", e)

    # Patch libraries for auto-instrumentation (useful even without APM)
    _patch_libraries(patch)

    # Configure sampling rate if APM is enabled
    if apm_enabled:
        try:
            from ddtrace import config, tracer

            sample_rate = float(os.getenv("DD_TRACE_SAMPLE_RATE", "1.0"))
            config.trace_sample_rate = sample_rate

            # Set global tags on tracer
            tags: dict[str, str] = {
                "service": service,
                "env": env,
                "version": version,
            }

            # Parse additional tags from DD_TAGS
            dd_tags = os.getenv("DD_TAGS", "")
            if dd_tags:
                for tag_str in dd_tags.split(","):
                    tag_str = tag_str.strip()
                    if ":" in tag_str:
                        key, value = tag_str.split(":", 1)
                        tags[key.strip()] = value.strip()

            tracer.set_tags(tags)
            logger.info(
                "APM tracing enabled: service=%s, env=%s, sample_rate=%s",
                service,
                env,
                sample_rate,
            )
        except Exception as e:
            logger.warning("Failed to configure APM tracing: %s", e)

    logger.info(
        "Datadog initialized: service=%s, env=%s, site=%s, "
        "llm_observability=%s, apm_tracing=%s",
        service,
        env,
        site,
        llmobs_enabled,
        apm_enabled,
    )


def _patch_libraries(patch: Any) -> None:
    """Patch common libraries for auto-instrumentation."""
    # OpenAI for LLM calls
    try:
        patch(openai=True)
        logger.debug("Patched OpenAI for Datadog")
    except Exception:
        logger.debug("OpenAI patching skipped")

    # Anthropic for LLM calls
    try:
        patch(anthropic=True)
        logger.debug("Patched Anthropic for Datadog")
    except Exception:
        logger.debug("Anthropic patching skipped")

    # httpx for async HTTP (used by Google/Anthropic providers in pydantic-ai)
    try:
        patch(httpx=True)
        logger.debug("Patched httpx for Datadog")
    except Exception:
        logger.debug("httpx patching skipped")

    # aiohttp for async HTTP
    try:
        patch(aiohttp=True)
        logger.debug("Patched aiohttp for Datadog")
    except Exception:
        logger.debug("aiohttp patching skipped")


def get_tracer() -> Any:
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
) -> Any:
    """Create a Datadog span for custom instrumentation.

    Args:
        operation_name: Name of the operation being traced.
        service: Service name (defaults to DD_SERVICE or 'gemini-meet').
        resource: Resource name for the span.
        tags: Additional tags to add to the span.

    Returns:
        A Datadog span context manager, or a no-op context manager if Datadog
        is not available.
    """
    tracer = get_tracer()
    if tracer is None:
        from contextlib import nullcontext

        return nullcontext()

    span = tracer.trace(
        operation_name,
        service=service or os.getenv("DD_SERVICE", "gemini-meet"),
        resource=resource or operation_name,
    )

    if tags:
        for key, value in tags.items():
            span.set_tag(key, value)

    return span


def set_span_tag(key: str, value: Any) -> None:
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
