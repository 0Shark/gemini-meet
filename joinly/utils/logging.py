import logging
import os

LOGGING_TRACE = 5


class HealthCheckFilter(logging.Filter):
    """Logging filter to skip successful health check logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Filter out health check logs."""
        return not (
            "GET /health" in record.getMessage() and "200" in record.getMessage()
        )


def configure_logging(verbose: int, *, quiet: bool, plain: bool) -> None:
    """Configure logging based on verbosity level."""
    log_level = logging.WARNING

    if quiet:
        log_level = logging.ERROR
    elif verbose == 1:
        log_level = logging.INFO
    elif verbose == 2:  # noqa: PLR2004
        log_level = logging.DEBUG
    elif verbose > 2:  # noqa: PLR2004
        log_level = LOGGING_TRACE

    logging.addLevelName(LOGGING_TRACE, "TRACE")

    logging.getLogger("uvicorn.access").addFilter(HealthCheckFilter())

    # Configure Datadog logging if enabled
    handlers: list[logging.Handler] = []
    dd_logs_enabled = os.getenv("DD_LOGS_ENABLED", "false").lower() in (
        "true",
        "1",
        "yes",
    )

    if dd_logs_enabled:
        try:
            from ddtrace import tracer
            from ddtrace.contrib.logging import DDLogHandler

            dd_handler = DDLogHandler(tracer=tracer)
            dd_handler.setLevel(log_level)
            handlers.append(dd_handler)
        except ImportError:
            pass
        except Exception as e:
            logging.getLogger(__name__).debug(
                "Failed to configure Datadog logging: %s", e
            )

    if not plain:
        try:
            from rich.logging import RichHandler

            rich_handler = RichHandler(rich_tracebacks=True)
            rich_handler.setLevel(
                log_level
            )  # Use the computed log_level, not hardcoded
            handlers.append(rich_handler)

            logging.basicConfig(
                level=log_level,  # Use the computed log_level
                format="%(message)s",
                datefmt="[%X]",
                handlers=handlers if handlers else [RichHandler(rich_tracebacks=True)],
            )
            logging.getLogger("joinly").setLevel(log_level)
            logging.getLogger("joinly_client").setLevel(log_level)
        except ImportError:
            pass
        else:
            return

    if not handlers:
        handlers = [
            logging.StreamHandler(),
        ]

    logging.basicConfig(
        level=log_level,  # Use the computed log_level
        format="[%(asctime)s] %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
    )
    logging.getLogger("joinly").setLevel(log_level)
    logging.getLogger("joinly_client").setLevel(log_level)
