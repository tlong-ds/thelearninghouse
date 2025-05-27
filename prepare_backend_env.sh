#!/bin/zsh
# Script to prepare backend environment for deployment

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "${YELLOW}Preparing backend environment for deployment...${NC}"

# Check if source .env file exists
if [ ! -f ".env" ]; then
  echo "${RED}Error: .env file not found. Please create it first.${NC}"
  exit 1
fi

# Get target deployment environment from argument
ENV_TYPE=${1:-"production"}
echo "${YELLOW}Preparing for ${ENV_TYPE} environment${NC}"

# Create a production .env file based on the development one
# But replace localhost URLs with production URLs
if [ "$ENV_TYPE" = "production" ]; then
  sed 's/localhost:8000/thelearninghouse-backend.example.com/g' .env > .env.deploy
  sed -i '' 's/localhost:8503/thelearninghouse-backend.example.com/g' .env.deploy
  
  echo "${GREEN}Created .env.deploy with production URLs${NC}"
  echo "${YELLOW}WARNING: This file still contains sensitive information!${NC}"
  echo "${YELLOW}Make sure to set environment variables securely on your production server.${NC}"
  
  # Display instructions
  echo ""
  echo "${GREEN}Next steps:${NC}"
  echo "1. Deploy your backend to a server (not GitHub Pages)"
  echo "2. Set environment variables on your server using the values in .env.deploy"
  echo "3. Update your frontend config.js to point to your production backend"
  echo "4. Deploy your frontend to GitHub Pages with: cd react-frontend && npm run deploy"
else
  echo "${YELLOW}No changes needed for development environment${NC}"
fi

echo ""
echo "${GREEN}Remember:${NC}"
echo "1. Never commit .env or .env.deploy files to your repository"
echo "2. GitHub Pages only hosts frontend code; your backend needs a separate server"
echo "3. Use environment variables or secrets management on your backend server"

# Clean up
if [ -f ".env.deploy" ]; then
  echo ""
  echo "${YELLOW}WARNING: .env.deploy contains sensitive information!${NC}"
  echo "${YELLOW}After copying values to your production environment, you should delete this file.${NC}"
  echo "To delete it, run: rm .env.deploy"
fi
