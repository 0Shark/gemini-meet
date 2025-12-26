# Telemetry & Observability

Gemini Meet integrates with **Datadog** to provide comprehensive observability into your agents' performance, stability, and usage.

## Setup

To enable Datadog telemetry, set the following environment variables:

```bash
DD_API_KEY=your_datadog_api_key
DD_SITE=datadoghq.com  # or datadoghq.eu, etc.
DD_SERVICE=gemini-meet
DD_ENV=production
```

## Metrics

We track custom metrics to monitor critical components like Speech-to-Text (STT).

### STT Performance (Speech-to-Text)

Monitor the health and latency of transcription services (Whisper, Deepgram, Google).

| Metric Name | Type | Description | Tags |
| :--- | :--- | :--- | :--- |
| `gemini_meet.stt.error` | Count | Number of failed transcription attempts or service errors. | `stt:{provider}`, `error_type:{type}` |
| `gemini_meet.stt.request` | Count | Number of transcription requests initiated. | `stt:{provider}`, `status:{status}` |
| `gemini_meet.stt.drift` | Histogram | The lag (in seconds) between audio duration and transcription processing time. High drift indicates the agent is falling behind. | `stt:{provider}` |
| `gemini_meet.stt.audio_duration` | Histogram | Duration of the audio chunk being processed (in seconds). | `stt:{provider}` |
| `gemini_meet.stt.transcription_duration` | Histogram | Time taken to generate the transcript or duration of the transcript produced. | `stt:{provider}` |

#### Useful Monitors

**1. High Transcription Error Rate**
Alert if the error rate exceeds 5% over a 2-minute window.
*   **Query**: `sum:gemini_meet.stt.error{*}.as_count() / sum:gemini_meet.stt.request{*}.as_count() > 0.05`

**2. STT Drift / Lag Spike**
Alert if the system is falling behind real-time (drift > 2s).
*   **Query**: `avg:gemini_meet.stt.drift{*} > 2`

## Logs

Gemini Meet emits structured logs compatible with Datadog's log management. Ensure `DD_LOGS_INJECTION=true` is set to correlate logs with traces.

## Traces (APM)

APM tracing is supported for detailed performance analysis of:
*   **LLM calls**: Vertex AI, OpenAI (trace latency and token usage)
*   **Tool execution**: MCP tools, Browser interactions
*   **Internal processing**: Main loop, Event handling
