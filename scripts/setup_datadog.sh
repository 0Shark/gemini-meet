#!/bin/bash
set -e

# Check if DD_API_KEY is set
if [ -z "$DD_API_KEY" ]; then
    echo "Warning: DD_API_KEY environment variable is not set."
    echo "Datadog Agent setup skipped. Set DD_API_KEY and run this script manually."
    exit 0
fi

DD_SITE=${DD_SITE:-"datadoghq.com"}

# Check if datadog-agent is installed
if ! dpkg -l | grep -q datadog-agent; then
    echo "Datadog Agent not found. Installing..."
    
    # Install dependencies
    sudo apt-get update && sudo apt-get install -y curl gnupg

    # Add Datadog repository
    echo 'deb [signed-by=/usr/share/keyrings/datadog-archive-keyring.gpg] https://apt.datadoghq.com/ stable 7' | sudo tee /etc/apt/sources.list.d/datadog.list
    sudo touch /usr/share/keyrings/datadog-archive-keyring.gpg
    sudo chmod a+r /usr/share/keyrings/datadog-archive-keyring.gpg
    
    # Import keys
    curl -fsSL https://keys.datadoghq.com/DATADOG_APT_KEY_CURRENT.public | sudo gpg --no-default-keyring --keyring /usr/share/keyrings/datadog-archive-keyring.gpg --import
    curl -fsSL https://keys.datadoghq.com/DATADOG_APT_KEY_F14F620E.public | sudo gpg --no-default-keyring --keyring /usr/share/keyrings/datadog-archive-keyring.gpg --import
    curl -fsSL https://keys.datadoghq.com/DATADOG_APT_KEY_382E94DE.public | sudo gpg --no-default-keyring --keyring /usr/share/keyrings/datadog-archive-keyring.gpg --import

    # Install agent
    sudo apt-get update
    sudo apt-get install -y datadog-agent
    
    echo "Datadog Agent installed successfully."
else
    echo "Datadog Agent is already installed."
fi

# Configure Datadog Agent
echo "Configuring Datadog Agent..."
HOSTNAME=$(hostname)
sudo sh -c "cat > /etc/datadog-agent/datadog.yaml <<EOF
api_key: $DD_API_KEY
site: $DD_SITE
hostname: $HOSTNAME
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

# Start or Restart Datadog Agent
echo "Starting Datadog Agent..."
if sudo service datadog-agent status > /dev/null; then
    sudo service datadog-agent restart
else
    sudo service datadog-agent start
fi

echo "Datadog Agent is running."
