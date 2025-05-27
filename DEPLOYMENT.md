# Deployment Guide for The Learning House

This guide explains how to deploy both the frontend and backend components of The Learning House application.

## Deployment Overview

The application consists of two main components:
1. **React Frontend**: Deployed to GitHub Pages
2. **FastAPI Backend**: Must be deployed to a server that supports Python/FastAPI

## Frontend Deployment (GitHub Pages)

### Automatic Deployment with GitHub Actions
The repository is configured with GitHub Actions to automatically deploy the frontend to GitHub Pages whenever changes are pushed to the main branch.

To configure the GitHub Actions deployment:

1. Go to your GitHub repository settings
2. Navigate to "Secrets and variables" > "Actions"
3. Add a new repository secret named `API_URL` with the value of your deployed backend URL (e.g., `https://your-backend-server.com`)

### Manual Deployment

To manually deploy the frontend:

1. Update the API URL in `react-frontend/public/runtime-config.json`:
   ```json
   {
     "apiUrl": "https://your-backend-server.com",
     ...
   }
   ```

2. Run the release script which will prompt for the backend URL:
   ```bash
   cd react-frontend
   ./release.sh
   ```

3. Deploy to GitHub Pages:
   ```bash
   npm run deploy
   ```

## Backend Deployment

The backend needs to be deployed to a server that supports Python and FastAPI. Here are some options:

### Option 1: Deploy to a VPS (DigitalOcean, AWS EC2, etc.)

1. Clone the repository on your server
2. Set up your environment variables by creating a `.env` file:
   ```
   MYSQL_HOST=your-database-host
   MYSQL_PORT=3306
   MYSQL_USER=your-database-user
   MYSQL_PASSWORD=your-database-password
   MYSQL_DB=OnlineLearning
   SECRET_TOKEN=your-secure-secret-key
   ALGORITHM=HS256
   AWS_ACCESS_KEY_ID=your-aws-key
   AWS_SECRET_ACCESS_KEY=your-aws-secret
   REGION_NAME=ap-southeast-1
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the application with Gunicorn for production:
   ```bash
   gunicorn -w 4 -k uvicorn.workers.UvicornWorker services.api.db.auth:app --bind 0.0.0.0:8503
   ```

5. Set up Nginx as a reverse proxy (recommended):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:8503;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

6. Secure with SSL using Let's Encrypt

### Option 2: Deploy to a Serverless Platform (AWS Lambda, Google Cloud Functions, etc.)

Follow the specific instructions for your chosen serverless platform for deploying FastAPI applications.

### Important Backend Configuration

Make sure to update the CORS settings in `services/api/db/auth.py` to allow requests from your GitHub Pages domain:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://tlong-ds.github.io", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)
```

## Testing Your Deployment

1. Verify the frontend is accessible at `https://tlong-ds.github.io/thelearninghouse`
2. Test the API connection by logging in or accessing course data
3. Check the browser console for any CORS errors

## Troubleshooting

### CORS Issues
If you encounter CORS errors, ensure:
- The backend CORS settings include your frontend domain
- Your backend is accessible from the internet
- Your API URL in `runtime-config.json` is correct

### API Connection Issues
- Verify the backend server is running
- Check the API URL in both the GitHub repository secrets and the runtime config
- Ensure your database connection is properly configured

### SSL Certificate Issues
- If using HTTPS for your backend, ensure your certificate is valid
- Use a proper SSL certificate from Let's Encrypt or similar provider

## Maintenance

After deployment, regularly:
1. Update the application by pushing changes to the main branch
2. Monitor server logs for errors
3. Backup your database regularly
