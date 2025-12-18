#!/bin/bash
set -e

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
