# The Learning House - React Frontend

This is the React-based frontend for The Learning House online learning platform. It communicates with a FastAPI backend for authentication and data retrieval.

## Setup and Installation

1. Make sure you have Node.js and npm installed on your system.

2. Install dependencies:
   ```
   npm install
   ```

3. Copy assets from the Streamlit project:
   ```
   chmod +x copy_assets.sh
   ./copy_assets.sh
   ```

4. Start the development server:
   ```
   npm start
   ```

## Backend Requirements

The React frontend requires the FastAPI backend to be running on port 8503. Make sure the backend is started before using the React app:

```
cd /path/to/project
uvicorn services.api.db.auth:app --reload --port 8503
```

## Project Structure

- `/src/components`: Reusable UI components
- `/src/pages`: Main page components
- `/src/services`: API and authentication services
- `/src/styles`: CSS files for styling components and pages
- `/public`: Static assets and HTML template

## Features

- User authentication (login and registration)
- Role-based access (Learner and Instructor roles)
- Course browsing and searching
- Course and lecture viewing
- User settings management

## Deployment

To build the app for production:

```
npm run build
```

This will create a `build` folder with optimized production files that can be deployed to any static hosting service.
