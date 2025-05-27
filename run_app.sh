#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              The Learning House - Setup Script             ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}This script will set up and run both the backend and frontend servers.${NC}"
echo ""

# Navigate to project root directory
PROJECT_ROOT="/Users/bunnypro/Library/Mobile Documents/com~apple~CloudDocs/Long's Workspace/PROJECT/dbms_online_learning"
cd "$PROJECT_ROOT"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo -e "${YELLOW}Creating a template .env file. Please edit it with your database credentials.${NC}"
    cat > .env << EOF
# Host:port -- address to the database
MYSQL_HOST=localhost
MYSQL_PORT=3306

# user information for connection
MYSQL_USER=root
MYSQL_PASSWORD=password

# Database to use 
MYSQL_DB="OnlineLearning"

# Secret key for JWT token generation
SECRET_TOKEN="your-secure-secret-key"
ALGORITHM="HS256"
EOF
    echo -e "${YELLOW}Please edit the .env file with your database credentials and run this script again.${NC}"
    exit 1
fi

# Check if all required packages are installed
echo -e "${GREEN}Checking backend dependencies...${NC}"
python -c "import fastapi, pymysql, bcrypt, jose, dotenv" 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Installing missing Python packages...${NC}"
    pip install fastapi uvicorn pymysql bcrypt python-jose python-dotenv requests
fi

# Start backend in background
echo -e "${GREEN}Starting the FastAPI backend server...${NC}"
uvicorn services.api.db.auth:app --reload --port 8502 &
BACKEND_PID=$!
echo -e "${YELLOW}Backend server started with PID: $BACKEND_PID${NC}"

# Check if Node.js is installed
echo -e "${GREEN}Checking for Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js is not installed. Please install Node.js to run the React frontend.${NC}"
    echo -e "${YELLOW}Backend server is still running on http://localhost:8502${NC}"
    exit 1
fi

# Navigate to React frontend directory
cd "$PROJECT_ROOT/react-frontend"

# Install npm dependencies if needed
echo -e "${GREEN}Checking frontend dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing npm packages (this may take a few minutes)...${NC}"
    npm install
fi

# Copy assets
echo -e "${GREEN}Copying assets...${NC}"
chmod +x copy_assets.sh
./copy_assets.sh

# Start React frontend
echo -e "${GREEN}Starting the React frontend...${NC}"
npm start &
FRONTEND_PID=$!
echo -e "${YELLOW}Frontend server started with PID: $FRONTEND_PID${NC}"

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo -e "${YELLOW}Backend is running at: http://localhost:8502${NC}"
echo -e "${YELLOW}Frontend is running at: http://localhost:3000${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop both servers${NC}"

# Trap Ctrl+C to kill both processes
trap "kill $BACKEND_PID $FRONTEND_PID; echo -e '${GREEN}Servers stopped.${NC}'; exit" INT

# Wait for both processes
wait
