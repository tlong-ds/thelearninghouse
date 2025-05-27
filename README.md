# The Learning House

The Learning House is an online learning platform that supports both learners and instructors. The platform allows users to browse, enroll in, and take courses, while instructors can create and manage their course content.

## Project Overview


To run the React version:

1. Use the provided setup script that starts both backend and frontend:
   ```bash
   ./run_app.sh
   ```

   This will:
   - Start the FastAPI backend on port 8502
   - Install React dependencies if needed
   - Copy assets from the Streamlit project
   - Start the React development server on port 3000

2. Access the application at `http://localhost:3000`

### Manual Setup for React Frontend

If you prefer to start the services manually:

1. Start the backend:
   ```bash
   uvicorn services.api.db.auth:app --reload --port 8502
   ```

2. Navigate to the React frontend directory:
   ```bash
   cd react-frontend
   ```

3. Install dependencies (first time only):
   ```bash
   npm install
   ```

5. Start the React development server:
   ```bash
   npm start
   ```

## Project Structure

- `services/api/db/auth.py`: FastAPI authentication backend
- `services/api/api_endpoints.py`: API endpoints for course data
- `pages/`: Streamlit UI pages
- `react-frontend/`: React UI implementation
- `style/`: CSS and styling assets
- `db/`: Database SQL files

## Features

- User authentication (login/registration)
- Role-based access control (Learner/Instructor)
- Course browsing and searching
- Course enrollment
- Course content viewing
- User settings

## Migration from Streamlit to React

The project has been migrated from Streamlit to React for:

- Better performance
- More flexibility in UI design
- Improved user experience
- Separation of frontend and backend concerns

Both versions share the same FastAPI backend to ensure data consistency.
