#!/bin/zsh
# Deploy backend to a server
# This is a template - you'll need to adapt it to your specific hosting provider

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "${YELLOW}Preparing to deploy backend...${NC}"

# Check for backend hosting provider
echo "${YELLOW}Where are you deploying your backend?${NC}"
echo "1) Heroku"
echo "2) AWS (EC2/Elastic Beanstalk)"
echo "3) DigitalOcean"
echo "4) Other (generic instructions)"
read -r provider_choice

case $provider_choice in
  1)
    # Heroku deployment
    echo "${YELLOW}Deploying to Heroku...${NC}"
    echo "Make sure you have the Heroku CLI installed and you're logged in."
    
    # Check if Heroku CLI is installed
    if ! command -v heroku &> /dev/null; then
      echo "${RED}Heroku CLI not found. Please install it first.${NC}"
      echo "Visit https://devcenter.heroku.com/articles/heroku-cli for installation instructions."
      exit 1
    fi
    
    # Create Heroku app if it doesn't exist
    echo "${YELLOW}Checking for existing Heroku app...${NC}"
    if ! heroku apps:info --app thelearninghouse-backend &> /dev/null; then
      echo "${YELLOW}Creating new Heroku app...${NC}"
      heroku create thelearninghouse-backend
    fi
    
    # Set environment variables from .env
    echo "${YELLOW}Setting environment variables on Heroku...${NC}"
    while IFS= read -r line || [[ -n "$line" ]]; do
      # Skip comments and empty lines
      [[ "$line" =~ ^#.*$ ]] || [[ -z "$line" ]] && continue
      
      # Extract key and value
      key=$(echo "$line" | cut -d '=' -f 1)
      value=$(echo "$line" | cut -d '=' -f 2- | sed 's/^"//;s/"$//')
      
      echo "Setting $key"
      heroku config:set "$key=$value" --app thelearninghouse-backend
    done < .env
    
    # Deploy to Heroku
    echo "${YELLOW}Pushing code to Heroku...${NC}"
    git subtree push --prefix services heroku main
    
    echo "${GREEN}Backend deployed to Heroku!${NC}"
    echo "Your backend is available at: https://thelearninghouse-backend.herokuapp.com"
    echo "Make sure to update your frontend config.js with this URL."
    ;;
    
  2)
    # AWS deployment
    echo "${YELLOW}For AWS deployment:${NC}"
    echo "1. Prepare your backend code: zip -r backend.zip services/"
    echo "2. Set up environment variables in AWS console or using EB CLI"
    echo "3. Follow the AWS deployment guides for your specific service:"
    echo "   - EC2: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html"
    echo "   - Elastic Beanstalk: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/Welcome.html"
    echo "   - AWS App Runner: https://docs.aws.amazon.com/apprunner/latest/dg/what-is-apprunner.html"
    ;;
    
  3)
    # DigitalOcean deployment
    echo "${YELLOW}For DigitalOcean deployment:${NC}"
    echo "1. Create a DigitalOcean App or Droplet"
    echo "2. Add environment variables from your .env file to the DigitalOcean App settings"
    echo "3. Connect your repository or upload your code"
    echo "4. Configure your app to run the FastAPI server"
    echo "5. Deploy your app"
    echo "For detailed instructions, visit: https://docs.digitalocean.com/products/app-platform/"
    ;;
    
  *)
    # Generic instructions
    echo "${YELLOW}Generic deployment steps:${NC}"
    echo "1. Prepare your server environment (install Python, etc.)"
    echo "2. Copy your backend code to the server"
    echo "3. Install dependencies: pip install -r requirements.txt"
    echo "4. Set up environment variables from your .env file"
    echo "5. Run your FastAPI app with a production server like Gunicorn:"
    echo "   gunicorn -w 4 -k uvicorn.workers.UvicornWorker services.api.db.auth:app"
    echo "6. Set up a reverse proxy with Nginx or similar"
    echo "7. Update your frontend config to point to your new backend URL"
    ;;
esac

echo ""
echo "${YELLOW}After deploying your backend:${NC}"
echo "1. Update the API_URL in your react-frontend/release.sh script"
echo "2. Run cd react-frontend && ./release.sh to prepare your frontend"
echo "3. Deploy your frontend with npm run deploy"
