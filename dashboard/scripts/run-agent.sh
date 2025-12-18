#!/bin/bash
set -e

# Start Datadog Agent if API Key is set
if [ -n "$DD_API_KEY" ]; then
    echo "Initializing Datadog Agent..."

    # Default site to datadoghq.com if not set
    export DD_SITE=${DD_SITE:-"datadoghq.com"}
    
    # Set Hostname for identification
    export DD_HOSTNAME=${DD_HOSTNAME:-$(hostname)}
    
    echo "Datadog Site: $DD_SITE"
    echo "Datadog Hostname: $DD_HOSTNAME"

    # Create/Update configuration
    # We use sudo because /etc/datadog-agent is owned by root/dd-agent
    sudo sh -c "cat > /etc/datadog-agent/datadog.yaml <<EOF
api_key: $DD_API_KEY
site: $DD_SITE
hostname: $DD_HOSTNAME
logs_enabled: true
process_config:
  process_collection:
    enabled: true
dogstatsd_non_local_traffic: true
apm_config:
  enabled: true
  apm_non_local_traffic: true
EOF"
    
    # Fix permissions
    sudo chown dd-agent:dd-agent /etc/datadog-agent/datadog.yaml
    sudo chmod 640 /etc/datadog-agent/datadog.yaml
    
    # Start Agent
    sudo service datadog-agent start || echo "Warning: Failed to start Datadog Agent"
fi

# Create output file
touch /app/data/transcript.log

# Function to run summary on exit
cleanup() {
    echo "Meeting finished (or interrupted). Running post-meeting summary..."
    python3 /app/post-meeting.py || echo "Post-meeting script failed"
}

# Trap exit signals to ensure cleanup runs
trap cleanup EXIT

# Run the command passed as arguments, piping output to the log file
# We use 'tee' to show output in docker logs AND save to file
"$@" 2>&1 | tee /app/data/transcript.log

