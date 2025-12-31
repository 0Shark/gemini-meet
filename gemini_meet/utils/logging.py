import atexit
import json
import logging
import os
import queue
import threading
import time
import urllib.request
from typing import Any

LOGGING_TRACE = 5


class DatadogHttpHandler(logging.Handler):
    """
    A logging handler that sends logs to Datadog via HTTP API.
    This enables agentless logging without storing files on the host.
    """

    def __init__(self, api_key: str, site: str, service: str, tags: str | None = None):
        super().__init__()
        self.api_key = api_key
        self.url = f"https://http-intake.logs.{site}/api/v2/logs"
        self.service = service
        self.tags = tags
        self.hostname = os.getenv("HOSTNAME", "unknown")

        # Buffer for logs
        self.buffer: list[dict[str, Any]] = []
        self.buffer_lock = threading.Lock()
        self.queue: queue.Queue = queue.Queue()

        # Background worker
        self.shutdown_event = threading.Event()
        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()

        # Register cleanup
        atexit.register(self.shutdown)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            # Format the message
            msg = self.format(record)

            # Create log entry
            log_entry = {
                "message": msg,
                "status": record.levelname,
                "service": self.service,
                "hostname": self.hostname,
                "ddsource": "python",
                "timestamp": int(record.created * 1000),  # ms
                "logger.name": record.name,  # Include logger name for filtering
            }

            # Add trace info if available (injected by DDLogHandler or others)
            if hasattr(record, "dd.trace_id"):
                log_entry["dd.trace_id"] = getattr(record, "dd.trace_id")
                log_entry["dd.span_id"] = getattr(record, "dd.span_id")

            # Combine global tags with record specific tags if any
            record_tags = self.tags
            if hasattr(record, "dd.tags"):
                extra = getattr(record, "dd.tags")
                if record_tags:
                    record_tags = f"{record_tags},{extra}"
                else:
                    record_tags = extra

            if record_tags:
                log_entry["ddtags"] = record_tags

            self.queue.put(log_entry)
        except Exception:
            self.handleError(record)

    def _worker(self) -> None:
        batch = []
        last_flush = time.time()

        while not self.shutdown_event.is_set() or not self.queue.empty():
            try:
                try:
                    # Wait for item or timeout to flush
                    item = self.queue.get(timeout=2.0)
                    batch.append(item)
                except queue.Empty:
                    pass

                # Flush if batch is big enough or time passed
                if batch and (len(batch) >= 50 or (time.time() - last_flush > 2.0)):
                    self._flush_batch(batch)
                    batch = []
                    last_flush = time.time()

            except Exception:
                # Avoid crashing the worker thread
                pass

    def _flush_batch(self, batch: list[dict[str, Any]]) -> None:
        if not batch:
            return

        try:
            data = json.dumps(batch).encode("utf-8")
            req = urllib.request.Request(self.url, data=data, method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("DD-API-KEY", self.api_key)

            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status >= 400:
                    print(f"Failed to send logs to Datadog: {response.status}")
        except Exception as e:
            # We can't log here via logging because it might recurse
            print(f"Error sending logs to Datadog: {e}")

    def shutdown(self) -> None:
        self.shutdown_event.set()
        if self.worker_thread.is_alive():
            self.worker_thread.join(timeout=5.0)


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

    # Check for direct HTTP logging (Agentless)
    dd_api_key = os.getenv("DD_API_KEY")
    if dd_api_key:
        dd_site = os.getenv("DD_SITE", "datadoghq.com")
        dd_service = os.getenv("DD_SERVICE", "gemini-meet-agent")
        dd_tags = os.getenv("DD_TAGS")

        try:
            http_handler = DatadogHttpHandler(
                api_key=dd_api_key, site=dd_site, service=dd_service, tags=dd_tags
            )
            http_handler.setLevel(log_level)
            handlers.append(http_handler)
        except Exception as e:
            logging.getLogger(__name__).debug(
                f"Failed to init Datadog HTTP handler: {e}"
            )

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
            logging.getLogger("gemini_meet").setLevel(log_level)
            logging.getLogger("gemini_meet_client").setLevel(log_level)
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
    logging.getLogger("gemini_meet").setLevel(log_level)
    logging.getLogger("gemini_meet_client").setLevel(log_level)
