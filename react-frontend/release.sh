#!/bin/zsh
# Script to create a production release with environment variables

# Get the current date
BUILD_DATE=$(date +'%Y-%m-%d %H:%M:%S')

# Get the current git commit hash
GIT_HASH=$(git rev-parse --short HEAD)

# Define the API URL
API_URL="http://localhost:8503"

# Ask for confirmation about the backend URL
echo "Home to prepare a release with backend URL: ${API_URL}"
echo "Is this correct? (y/n)"
read -r response
if [[ "$response" != "y" ]]; then
  echo "Please enter the correct backend URL (include http:// or https://): "
  read -r API_URL
fi

# Create or update the .env.production file
echo "Creating .env.production file..."
cat > .env.production << EOL
REACT_APP_API_URL=${API_URL}
REACT_APP_ASSETS_PATH=/thelearninghouse
REACT_APP_ENABLE_ANALYTICS=true
REACT_APP_BUILD_TIME="${BUILD_DATE}"
REACT_APP_VERSION="${GIT_HASH}"
EOL

echo "Environment variables set:"
cat .env.production

# Build the application
echo "Building application..."
npm run build

# Update runtime-config.json
echo "Updating runtime configuration..."
# Use the update_config.sh script to update the runtime-config.json in the build directory
cp ./public/runtime-config.json ./build/runtime-config.json
chmod +x ./update_config.sh
./update_config.sh production "${API_URL}"
cp ./public/runtime-config.json ./build/runtime-config.json

# Also update the version and build time
cat > build/runtime-config.json << EOL
{
  "apiUrl": "${API_URL}",
  "enableAnalytics": true,
  "features": {
    "chat": true,
    "quizzes": true,
    "certificates": true
  },
  "maintenance": {
    "enabled": false,
    "message": ""
  },
  "version": "${GIT_HASH}",
  "buildTime": "${BUILD_DATE}"
}
EOL

# Display reminder about the backend deployment
echo ""
echo "IMPORTANT REMINDER ABOUT YOUR BACKEND:"
echo "----------------------------------------"
echo "GitHub Pages will only host your frontend code."
echo "You need to deploy your backend code to a separate server that supports Python/FastAPI."
echo "Make sure to:"
echo "1. Set up all environment variables (.env) on your backend server"
echo "2. Configure your backend server to accept CORS requests from: https://tlong-ds.github.io"
echo "3. Update the API_URL in runtime-config.json to match your actual backend URL"
echo "4. Keep your API keys and credentials secure - never commit them to GitHub"
echo ""
echo "Ready to deploy! Run 'npm run deploy' to publish to GitHub Pages."
