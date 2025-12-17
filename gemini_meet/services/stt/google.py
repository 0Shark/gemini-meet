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
from ddtrace import tracer
from datadog import statsd

from gemini_meet.core import STT
from gemini_meet.data_types import (
    AudioFormat,
    SpeechWindow,
    TranscriptSegment,
)
from gemini_meet.utils.audio import calculate_audio_duration
from gemini_meet.utils.usage import add_usage

logger = logging.getLogger(__name__)


class GoogleVertexSTT(STT):
    """Speech-to-Text (STT) service using Google Vertex AI."""

    def __init__(
        self,
        *,
        project_id: str | None = None,
        location: str | None = None,
        model_name: str = "gemini-2.0-flash",
        prompt: str = "Generate a transcript of the speech.",
        sample_rate: int = 16000,
    ) -> None:
        self._project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        self._location = location or os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

        if not self._project_id:
            raise ValueError(
                "project_id must be provided or set in GOOGLE_CLOUD_PROJECT environment variable."
            )

        self._model = model_name
        self._prompt = prompt
        self._client: genai.Client | None = None
        self._lock = asyncio.Lock()
        self.audio_format = AudioFormat(sample_rate=sample_rate, byte_depth=2)

    async def __aenter__(self) -> Self:
        self._client = genai.Client(
            vertexai=True, project=self._project_id, location=self._location
        )
        logger.info(
            "Initialized Vertex AI STT with model: %s in project: %s",
            self._model,
            self._project_id,
        )
        return self

    async def __aexit__(self, *_exc: object) -> None:
        self._client = None

    # 1. Wrap the method in a Datadog Span
    @tracer.wrap(service="gemini_meet-stt", resource="vertex_stt_stream")
    async def stream(
        self, windows: AsyncIterator[SpeechWindow]
    ) -> AsyncIterator[TranscriptSegment]:
        """Transcribe audio stream using Vertex AI."""
        
        # Get the active span to add tags later
        span = tracer.current_span()

        if self._client is None:
            raise RuntimeError("STT service is not initialized.")

        #  Start Timing for Drift Calculation
        # (Drift = Total Processing Time - Audio Duration)
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
            logger.warning("Received no audio data to transcribe.")
            return

        # Convert PCM to WAV format
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
            logger.debug(
                "Sending %.2f seconds of audio to Vertex AI.",
                audio_duration_secs,
            )

            try:
                try:
                    from ddtrace.llmobs import LLMObs
                except ImportError:
                    LLMObs = None

                if LLMObs:
                    with LLMObs.llm(
                        model_name=self._model,
                        model_provider="google",
                        name="transcribe_audio",
                    ) as llm_span:
                        LLMObs.annotate(
                            input_data=self._prompt,
                            metadata={"audio_duration": audio_duration_secs},
                        )
                        response = await self._client.aio.models.generate_content(
                            model=self._model,
                            contents=[
                                self._prompt,
                                types.Part.from_bytes(
                                    data=audio_bytes,
                                    mime_type="audio/wav",
                                ),
                            ],
                        )
                        transcribed_text = (response.text or "").strip()
                        LLMObs.annotate(
                            output_data=transcribed_text,
                            metrics={
                                "audio_seconds": audio_duration_secs,
                                "input_tokens": response.usage_metadata.prompt_token_count if response.usage_metadata else 0,
                                "output_tokens": response.usage_metadata.candidates_token_count if response.usage_metadata else 0,
                            },
                        )
                else:
                    response = await self._client.aio.models.generate_content(
                        model=self._model,
                        contents=[
                            self._prompt,
                            types.Part.from_bytes(
                                data=audio_bytes,
                                mime_type="audio/wav",
                            ),
                        ],
                    )
                    transcribed_text = (response.text or "").strip()

                #Drift Calculation & Success Metrics
                process_end_time = time.time()
                processing_duration = process_end_time - process_start_time
                drift = processing_duration - audio_duration_secs

                # Emit Metric: Drift (for Dashboard/Context)
                statsd.gauge("gemini_meet.stt.drift", drift, tags=["stt:vertex"])

                # Emit Metric: Success (for Error Rate Monitor)
                statsd.increment("gemini_meet.stt.transcription_success", tags=["stt:vertex"])

                # Update Span Context (for Incident details)
                if span:
                    span.set_tag("stt.provider", "google_vertex")
                    span.set_tag("stt.model", self._model)
                    span.set_metric("stt.drift", drift)
                    span.set_metric("stt.audio_duration", audio_duration_secs)
                    
                    if transcribed_text:
                        # Capture snippet for debugging (truncated)
                        span.set_tag("stt.transcript_snippet", transcribed_text[:200])

                # Track internal usage
                add_usage(
                    service="vertex_stt",
                    usage={"seconds": audio_duration_secs},
                    meta={
                        "model": self._model,
                        "project": self._project_id or "unknown",
                    },
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
                else:
                    logger.info("Vertex AI returned an empty transcription.")

            except Exception as e:
                logger.exception("Error during Vertex AI transcription")
                
                # Emit Metric: Error (for Error Rate Monitor)
                statsd.increment("gemini_meet.stt.transcription_error", tags=["stt:vertex"])

                # Mark Span as Error (for Trace)
                if span:
                    span.error = 1
                    span.set_tag("error.msg", str(e))
                
                msg = f"Failed to transcribe audio with Vertex AI: {e}"
                raise RuntimeError(msg) from e