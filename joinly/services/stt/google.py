import asyncio
import io
import logging
import os
import wave
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Self

from google import genai
from google.genai import types

from joinly.core import STT
from joinly.types import (
    AudioFormat,
    SpeechWindow,
    TranscriptSegment,
)
from joinly.utils.audio import calculate_audio_duration
from joinly.utils.usage import add_usage

logger = logging.getLogger(__name__)


class GoogleVertexSTT(STT):
    """Speech-to-Text (STT) service using Google Vertex AI."""

    def __init__(
        self,
        *,
        project_id: str | None = None,
        location: str | None = None,
        model_name: str = "gemini-2.0-flash", # Vertex often gets newer models slightly later or with different version names
        prompt: str = "Generate a transcript of the speech.",
        sample_rate: int = 16000,
    ) -> None:
        """Initialize the Vertex AI STT service.

        Args:
            project_id: GCP Project ID. If None, reads from GOOGLE_CLOUD_PROJECT env var.
            location: GCP Region (e.g., "us-central1"). If None, reads from GOOGLE_CLOUD_LOCATION env var.
            model_name: The Gemini model to use (e.g., "gemini-1.5-flash-002").
            prompt: The prompt to send with the audio.
            sample_rate: The sample rate of the audio.
        """
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

        # Gemini downsamples audio to 16kHz for processing
        self.audio_format = AudioFormat(sample_rate=sample_rate, byte_depth=2)

    async def __aenter__(self) -> Self:
        """Initialize the Vertex AI client."""
        # Initialize Client with vertexai=True
        # This relies on 'gcloud auth application-default login' or 
        # GOOGLE_APPLICATION_CREDENTIALS environment variable for auth.
        self._client = genai.Client(
            vertexai=True,
            project=self._project_id,
            location=self._location
        )

        logger.info(
            "Initialized Vertex AI STT with model: %s in project: %s", 
            self._model, 
            self._project_id
        )
        return self

    async def __aexit__(self, *_exc: object) -> None:
        """Clean up resources."""
        self._client = None

    async def stream(
        self, windows: AsyncIterator[SpeechWindow]
    ) -> AsyncIterator[TranscriptSegment]:
        """Transcribe audio stream using Vertex AI.
        
        Buffers stream and sends as a single request.
        """
        if self._client is None:
            msg = "STT service is not initialized."
            raise RuntimeError(msg)

        # Buffer the entire audio stream
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

        # Send to Vertex AI
        async with self._lock:
            audio_duration_secs = calculate_audio_duration(
                len(audio_buffer), self.audio_format
            )
            logger.debug(
                "Sending %.2f seconds of audio to Vertex AI.",
                audio_duration_secs,
            )

            try:
                # Vertex AI call is identical structure-wise using the new SDK
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

                # Track usage
                add_usage(
                    service="vertex_stt",
                    usage={"seconds": audio_duration_secs},
                    meta={"model": self._model, "project": self._project_id},
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
                msg = f"Failed to transcribe audio with Vertex AI: {e}"
                raise RuntimeError(msg) from e