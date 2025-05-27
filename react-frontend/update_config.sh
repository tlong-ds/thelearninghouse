#!/bin/bash

# Script to update runtime configuration for different environments
# Usage: ./update_config.sh [environment] [api_url]

# Default values
ENVIRONMENT=${1:-"development"}
API_URL=${2:-"http://localhost:8503"}

# Config file path
CONFIG_FILE="./public/runtime-config.json"

echo "Updating runtime configuration for $ENVIRONMENT environment..."
echo "API URL: $API_URL"

# Create the JSON with jq if available, otherwise use a simple sed command
if command -v jq &> /dev/null; then
  # Create a temporary file with the new configuration
  jq --arg url "$API_URL" '.apiUrl = $url' "$CONFIG_FILE" > "$CONFIG_FILE.tmp"
  mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
else
  # Simple sed replacement if jq is not available
  sed -i'.bak' "s|\"apiUrl\": \"[^\"]*\"|\"apiUrl\": \"$API_URL\"|g" "$CONFIG_FILE"
  rm -f "$CONFIG_FILE.bak"
fi

echo "Configuration updated successfully!"
