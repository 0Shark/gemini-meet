import os
import requests
import vertexai
from vertexai.generative_models import GenerativeModel
import json


def load_env_manual(env_path=".env"):
    """Manually parse .env file since python-dotenv might not be installed."""
    if not os.path.exists(env_path):
        return

    print(f"Loading environment from {env_path}...")
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()

            # Remove quotes if present
            if (value.startswith('"') and value.endswith('"')) or (
                value.startswith("'") and value.endswith("'")
            ):
                value = value[1:-1]

            if key and not os.environ.get(key):
                os.environ[key] = value


def summarize_and_report():
    # Load env vars first
    load_env_manual("/app/agent.env")

    meeting_id = os.environ.get("MEETING_ID")
    dashboard_url = os.environ.get("DASHBOARD_URL")

    if not meeting_id or not dashboard_url:
        print("Missing MEETING_ID or DASHBOARD_URL, skipping summary report.")
        return

    print(f"Generating summary for meeting {meeting_id}...")

    try:
        # Read transcript from log file
        log_path = "/app/data/transcript.log"
        if not os.path.exists(log_path):
            print(f"Log file not found at {log_path}")
            transcript = "No log file found."
        else:
            with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                transcript = f.read()

        summary = "No summary generated."

        # Vertex AI Summarization
        try:
            # Assumes credentials are set via GOOGLE_APPLICATION_CREDENTIALS
            # and project_id is inferred or set in env
            project_id = os.environ.get("GOOGLE_CLOUD_PROJECT")
            location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

            # Try to find project id from credentials file if not in env
            if not project_id:
                cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
                if cred_path and os.path.exists(cred_path):
                    with open(cred_path, "r") as f:
                        creds = json.load(f)
                        project_id = creds.get("project_id")

            if project_id:
                vertexai.init(project=project_id, location=location)

                # Use configured model or fallback to standard flash
                model_name = os.environ.get(
                    "GEMINI_MEET_MODEL_NAME", "gemini-1.5-flash"
                )
                print(f"Using Vertex AI model: {model_name}")

                model = GenerativeModel(model_name)

                # Limit context to avoid hitting limits or errors
                context = transcript[:30000]
                prompt = f"""Please summarize the following meeting transcript. Focus on key decisions and action items. 
                If the text is just system logs with no conversation, say "No conversation recorded."
                
                TRANSCRIPT:
                {context}
                """

                response = model.generate_content(prompt)
                summary = response.text
            else:
                print("Project ID not found for Vertex AI.")
                summary = "Vertex AI configuration missing."

        except Exception as e:
            print(f"Vertex AI summarization failed: {e}")
            summary = f"Summary generation failed: {str(e)}"

        # Report to Dashboard
        print(f"Reporting results to {dashboard_url}...")
        payload = {"transcript": transcript, "summary": summary}

        # Use endpoint /api/meetings/[id]/transcript
        url = f"{dashboard_url}/api/meetings/{meeting_id}/transcript"
        try:
            r = requests.post(url, json=payload, timeout=10)
            if r.status_code == 200:
                print("Successfully uploaded transcript and summary.")
            else:
                print(f"Failed to upload: {r.status_code} {r.text}")
        except Exception as req_err:
            print(f"Request failed: {req_err}")

    except Exception as e:
        print(f"Critical error in summarize script: {e}")


if __name__ == "__main__":
    summarize_and_report()
