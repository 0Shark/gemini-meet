import asyncio
import io
import logging
import os
import time
import wave
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Self

from google import genai
from google.genai import types

try:
    from ddtrace.trace import tracer
except ImportError:

    class MockTracer:
        def wrap(self, *args, **kwargs):
            def decorator(func):
                return func

            return decorator

        def current_span(self):
            return None

    tracer = MockTracer()

try:
    from datadog import statsd
except ImportError:

    class MockStatsd:
        def gauge(self, *args, **kwargs):
            pass

        def increment(self, *args, **kwargs):
            pass

    statsd = MockStatsd()


from gemini_meet.core import STT
from gemini_meet.data_types import (
    AudioFormat,
    SpeechWindow,
    TranscriptSegment,
)
from gemini_meet.utils.audio import calculate_audio_duration
from gemini_meet.utils.usage import add_usage

logger = logging.getLogger(__name__)


# tanscript_drift.json is used to create a Datadog monitor to track STT drift
##
####
#####
class GoogleSTT(STT):
    """Speech-to-Text (STT) service using Gemini audio understanding API."""

    def __init__(
        self,
        *,
        model_name: str = "gemini-2.5-flash",
        prompt: str = "Transcribe the speech exactly. Do not add any other text.",
        sample_rate: int = 16000,
    ) -> None:
        if os.getenv("GEMINI_MEET_MODEL_PROVIDER") == "google":
            # Using Vertex AI (Application Default Credentials)
            pass
        elif (
            os.getenv("GEMINI_API_KEY") is None and os.getenv("GOOGLE_API_KEY") is None
        ):
            msg = "GEMINI_API_KEY or GOOGLE_API_KEY must be set in the environment, or GEMINI_MEET_MODEL_PROVIDER must be 'google'."
            raise ValueError(msg)

        self._model = model_name
        self._prompt = prompt
        self._client: genai.Client | None = None
        self._lock = asyncio.Lock()
        self.audio_format = AudioFormat(sample_rate=sample_rate, byte_depth=2)

    async def __aenter__(self) -> Self:
        if os.getenv("GEMINI_MEET_MODEL_PROVIDER") == "google":
            self._client = genai.Client(
                vertexai=True,
                project=os.getenv("GCP_PROJECT_ID"),
                location=os.getenv("GCP_LLM_LOCATION", "us-central1"),
            )
            logger.info("Initialized Vertex AI STT with model: %s", self._model)
        else:
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            self._client = genai.Client(api_key=api_key)
            logger.info("Initialized Gemini STT with model: %s", self._model)
        return self

    async def __aexit__(self, *_exc: object) -> None:
        self._client = None

    @tracer.wrap(service="gemini_meet-stt", resource="google_stt_stream")
    async def stream(
        self, windows: AsyncIterator[SpeechWindow]
    ) -> AsyncIterator[TranscriptSegment]:
        """Transcribe audio stream using Gemini audio understanding."""

        span = tracer.current_span()

        if self._client is None:
            raise RuntimeError("STT service is not initialized.")

        # start timing for drift calculation
        process_start_time = time.time()

        start_time: float | None = None
        end_time: float = 0.0
        audio_buffer = bytearray()
        speakers: defaultdict[str, float] = defaultdict(float)

        async for window in windows:
            if start_time is None:
                start_time = window.time_ns / 1e9
            audio_buffer.extend(window.data)
            duration = calculate_audio_duration(len(window.data), self.audio_format)
            end_time = (window.time_ns / 1e9) + duration
            if window.speaker:
                speakers[window.speaker] += duration

        if not audio_buffer:
            return

        # Prepare Audio
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(self.audio_format.byte_depth)
            wf.setframerate(self.audio_format.sample_rate)
            wf.writeframes(audio_buffer)
        wav_buffer.seek(0)
        audio_bytes = wav_buffer.getvalue()

        async with self._lock:
            audio_duration_secs = calculate_audio_duration(
                len(audio_buffer), self.audio_format
            )

            try:
                response = await self._client.aio.models.generate_content(
                    model=self._model,
                    contents=[
                        self._prompt,
                        types.Part.from_bytes(data=audio_bytes, mime_type="audio/wav"),
                    ],
                )
                transcribed_text = (response.text or "").strip()

                # drift calculation
                process_end_time = time.time()
                processing_duration = process_end_time - process_start_time
                drift = processing_duration - audio_duration_secs

                # Send stats to Datadog
                if span:
                    span.set_tag("stt.provider", "google")
                    span.set_tag("stt.model", self._model)
                    span.set_metric("stt.audio_duration", audio_duration_secs)
                    span.set_metric("stt.drift", drift)

                    # Log snippet for Incident Context (last 10 chunks logic would hook here)
                    if transcribed_text:
                        span.set_tag("stt.transcript_snippet", transcribed_text[:200])

                # Send explicit Metric for Monitor
                # (Use try/except in case Agent is not running locally)
                try:
                    statsd.gauge("gemini_meet.stt.drift", drift, tags=["stt:google"])
                    statsd.increment(
                        "gemini_meet.stt.transcription_success", tags=["stt:google"]
                    )
                except Exception:
                    pass

                add_usage(
                    service="gemini_stt",
                    usage={"seconds": audio_duration_secs},
                    meta={"model": self._model},
                )

                if transcribed_text:
                    speaker = (
                        max(speakers.items(), key=lambda item: item[1])[0]
                        if speakers
                        else None
                    )
                    yield TranscriptSegment(
                        text=transcribed_text,
                        start=start_time or 0.0,
                        end=end_time,
                        speaker=speaker,
                    )

            except Exception as e:
                # --- Error Handling & Metrics ---
                logger.exception("Error during Gemini transcription")

                # Mark span as error for Trace Error Rate
                if span:
                    span.error = 1
                    span.set_tag("error.msg", str(e))

                # Send Error Metric for Monitor
                try:
                    statsd.increment(
                        "gemini_meet.stt.transcription_error", tags=["stt:google"]
                    )
                except Exception:
                    pass

                raise RuntimeError(f"Failed to transcribe: {e}") from e
