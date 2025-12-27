"""Datadog integration utilities for the client package."""

import logging
import os
from typing import Any

from datadog import initialize
from datadog import statsd  # type: ignore

logger = logging.getLogger(__name__)


def initialize_datadog() -> None:
    """Initialize Datadog LLM Observability for the client.

    This uses the SDK-based approach for LLM Observability which supports
    agentless mode (sending data directly to Datadog without a local agent).

    Environment variables used:
        DD_SITE: Datadog site (default: datadoghq.com)
        DD_API_KEY: Datadog API key (required)
        DD_SERVICE: Service name (default: gemini-meet-client)
        DD_ENV: Environment name (default: production)
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
    service = os.getenv("DD_SERVICE", "gemini-meet-client")
    env = os.getenv("DD_ENV", "production")
    version = os.getenv("DD_VERSION", "0.1.18")

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

    # NOW import ddtrace after environment variables are set
    try:
        from ddtrace import patch
    except ImportError:
        logger.warning(
            "ddtrace not installed. Datadog monitoring will not be available. "
            "Install with: pip install ddtrace"
        )
        return

    # Initialize Datadog Python client (for custom metrics)
    try:
        initialize(
            api_key=api_key,
            app_key=os.getenv("DD_APP_KEY"),
            statsd_host=os.getenv("DD_AGENT_HOST", "localhost"),
            statsd_port=int(os.getenv("DD_DOGSTATSD_PORT", "8125")),
        )
        logger.debug("Datadog Python client initialized")
    except Exception as e:
        logger.warning("Failed to initialize Datadog Python client: %s", e)

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

    # LangChain
    try:
        patch(langchain=True)
        logger.debug("Patched LangChain for Datadog")
    except Exception:
        logger.debug("LangChain patching skipped")

    # Google Generative AI
    try:
        patch(google_generativeai=True)
        logger.debug("Patched Google Generative AI for Datadog")
    except Exception:
        logger.debug("Google Generative AI patching skipped")


def report_llm_metric(
    metric_type: str,
    value: float = 1.0,
    tags: dict[str, str] | None = None,
) -> None:
    """Report an LLM-related metric to Datadog.

    Args:
        metric_type: The type of metric (e.g., "latency", "tokens", "error").
        value: The value of the metric (default: 1.0).
        tags: Additional tags for the metric.
    """
    if tags is None:
        tags = {}

    tags["service"] = os.getenv("DD_SERVICE", "gemini-meet-client")
    tags["env"] = os.getenv("DD_ENV", "production")

    metric_name = f"gemini_meet.llm.{metric_type}"
    # Convert dict to list of "key:value" strings
    tag_list = [f"{k}:{v}" for k, v in tags.items()]

    try:
        if metric_type in ["latency", "tokens"]:
            statsd.histogram(metric_name, value, tags=tag_list)
        else:
            statsd.increment(metric_name, value, tags=tag_list)
    except Exception:
        # Fail silently if Datadog is not available or configured
        pass
