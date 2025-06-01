"""
auth.py  –  Lightweight authentication micro-service
----------------------------------------------------
• Exposes /auth/verify_user  (login check)
• Optional /auth/register_user for sign-up
• Uses MySQL, bcrypt, and Pydantic
• No Streamlit, cookies, or front-end logic
"""

from fastapi import FastAPI, Request, Response, Cookie, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt, JWTError
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import time
import requests
import os
import pymysql
import bcrypt
import sys
import importlib.util
from services.api.db.token_utils import create_token, decode_token
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager

# Add parent directory to path to enable imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Define lifespan context manager for startup/shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Starting up FastAPI application...")
    
    # Start background tasks from upload endpoints
    try:
        # Import and start upload cleanup task
        from services.api.upload_endpoints import start_cleanup_task
        cleanup_task = start_cleanup_task()
        print("Upload cleanup task started successfully")
    except Exception as e:
        print(f"Failed to start upload cleanup task: {e}")
    
    yield
    
    # Shutdown
    print("Shutting down FastAPI application...")
    # Any cleanup can be done here

# Create single FastAPI instance with lifespan
app = FastAPI(lifespan=lifespan)

# Configure CORS with all needed origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8503",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://tlong-ds.github.io",
        "https://tlong-ds.github.io/thelearninghouse/",
        "https://*.hf.space",
        "https://*.huggingface.co"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Import API endpoints
try:
    from services.api.api_endpoints import router as api_router
except ImportError:
    # Try a different import strategy for direct module execution
    spec = importlib.util.spec_from_file_location(
        "api_endpoints", 
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api_endpoints.py")
    )
    api_endpoints = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api_endpoints)
    api_router = api_endpoints.router


# Load environment variables
load_dotenv()
SECRET_KEY = os.getenv("SECRET_TOKEN", "dev-secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
MYSQL_USER = os.getenv("MYSQL_USER")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD")
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_DB = os.getenv("MYSQL_DB")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))



# Import and include chat router
try:
    from services.api.chat_endpoints import router as chat_router
except ImportError:
    spec = importlib.util.spec_from_file_location(
        "chat_endpoints", 
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "chat_endpoints.py")
    )
    chat_endpoints = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(chat_endpoints)
    chat_router = chat_endpoints.router

# Import and include upload router
try:
    from services.api.upload_endpoints import router as upload_router
except ImportError:
    spec = importlib.util.spec_from_file_location(
        "upload_endpoints", 
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "upload_endpoints.py")
    )
    upload_endpoints = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(upload_endpoints)
    upload_router = upload_endpoints.router

# Debug print of available routes
print("DEBUG: Available routes in api_router:")
for route in api_router.routes:
    print(f"Route: {route.path}, Methods: {route.methods}")

# Include API routers
app.include_router(api_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(upload_router, prefix="/api")


class LoginPayload(BaseModel):
    username: str
    password: str
    role: str

class PasswordChangePayload(BaseModel):
    current_password: str
    new_password: str

class PasswordChangePayload(BaseModel):
    current_password: str
    new_password: str

# Token functions moved to token_utils.py

@app.post("/login")
async def login(response: Response, payload: LoginPayload):
    try:
        print(f"Login attempt: {payload.username}, role: {payload.role}")
        
        # Directly verify the user credentials
        table_map = {
            "Learner": "Learners",
            "Instructor": "Instructors"
        }
        table = table_map.get(payload.role)
        if not table:
            print(f"Invalid role: {payload.role}")
            raise HTTPException(status_code=400, detail="Invalid role")

        conn = connect_db()
        user_id = None
        full_name = None
        try:
            with conn.cursor() as cur:
                # Get password, user ID, and full name for token creation
                if payload.role == "Learner":
                    query = f"SELECT Password, LearnerID, LearnerName FROM {table} WHERE AccountName=%s LIMIT 1"
                else:  # Instructor
                    query = f"SELECT Password, InstructorID, InstructorName FROM {table} WHERE AccountName=%s LIMIT 1"
                    
                print(f"Executing query: {query} with username: {payload.username}")
                
                cur.execute(query, (payload.username,))
                row = cur.fetchone()
                
                if not row:
                    print(f"No user found with username: {payload.username} in table: {table}")
                    raise HTTPException(status_code=401, detail="Incorrect username or password")
                    
                password_valid = check_password(payload.password, row[0])
                user_id = row[1]  # Get the LearnerID or InstructorID
                full_name = row[2]  # Get the LearnerName or InstructorName
                print(f"Password check result: {password_valid}, User ID: {user_id}, Full Name: {full_name}")
                
                if not password_valid:
                    print(f"Authentication failed: Invalid password")
                    raise HTTPException(status_code=401, detail="Incorrect username or password")
        except Exception as db_err:
            print(f"Database error: {str(db_err)}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(db_err)}")
        finally:
            conn.close()
        
        # User authenticated successfully - include user_id and full name in token
        user_data = {
            "username": payload.username, 
            "role": payload.role,
            "user_id": user_id,
            "full_name": full_name
        }
        print(f"Authentication successful for: {payload.username} (ID: {user_id}, Name: {full_name})")
        
        token = create_token(user_data)
        # Set cookie with settings that work for both Chrome and Safari
        # For localhost development, we need different settings than production
        is_localhost = os.getenv("ENVIRONMENT", "development") == "development"
        
        response.set_cookie(
            key="auth_token",
            value=token,
            httponly=False,  # Allow JavaScript access for localStorage fallback
            samesite="Lax" if is_localhost else "None",  # Lax for localhost, None for cross-origin
            secure=False if is_localhost else True,  # False for HTTP localhost, True for HTTPS production
            path="/",
            max_age=604800,  # 7 days
            domain=None  # Let browser set the domain automatically
        )
        return {
            "message": f"Login successful for {user_data['username']}", 
            "username": user_data["username"], 
            "role": user_data["role"],
            "user_id": user_data["user_id"],
            "full_name": user_data["full_name"],
            "token": token
        }
    except Exception as e:
        print(f"Login exception: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Login error: {str(e)}")

@app.get("/logout")
def logout(response: Response):
    response.delete_cookie("auth_token")
    return HTMLResponse("<h3>Logged out — cookie cleared!</h3>")

@app.get("/whoami")
async def whoami(auth_token: str = Cookie(None)):
    payload = decode_token(auth_token)
    return {
        "username": payload["username"], 
        "role": payload["role"],
        "user_id": payload.get("user_id"),
        "full_name": payload.get("full_name")
    }

@app.get("/protected")
def protected_route(auth_token: str = Cookie(None)):
    payload = decode_token(auth_token)
    return {"msg": "Access granted", "user": payload}

@app.put("/api/user/password")
async def change_password(payload: PasswordChangePayload, request: Request, auth_token: str = Cookie(None)):
    """Change user password endpoint."""
    # Get token from cookie or Authorization header
    token = auth_token
    if not token and "Authorization" in request.headers:
        auth_header = request.headers["Authorization"]
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]  # Remove 'Bearer ' prefix
    
    if not token:
        raise HTTPException(status_code=401, detail="No authentication token provided")
    try:
        # Decode token to get user info
        user_data = decode_token(token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid token")

        username = user_data["username"]
        role = user_data["role"]

        # Get the correct table based on role
        table_map = {
            "Learner": "Learners",
            "Instructor": "Instructors"
        }
        table = table_map.get(role)
        if not table:
            raise HTTPException(status_code=400, detail="Invalid role")

        conn = connect_db()
        try:
            with conn.cursor() as cur:
                # First verify current password
                query = f"SELECT Password FROM {table} WHERE AccountName=%s LIMIT 1"
                cur.execute(query, (username,))
                row = cur.fetchone()

                if not row or not check_password(payload.current_password, row[0]):
                    raise HTTPException(status_code=401, detail="Current password is incorrect")

                # Hash the new password
                new_password_hash = hash_password(payload.new_password)

                # Update the password
                update_query = f"UPDATE {table} SET Password=%s WHERE AccountName=%s"
                cur.execute(update_query, (new_password_hash, username))
                conn.commit()

                return {"message": "Password updated successfully"}

        except Exception as db_err:
            conn.rollback()
            print(f"Database error: {str(db_err)}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(db_err)}")
        finally:
            conn.close()

    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in change_password: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

def connect_db():
    return pymysql.connect(
        host=MYSQL_HOST,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DB,
        port=MYSQL_PORT
    )

def check_password(plain: str, hashed: str) -> bool:
    """Compare plaintext vs bcrypt hash stored in DB."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def hash_password(plain: str) -> str:
    """Return bcrypt hash for storage."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

# ────────────────────────────────────────────────────────────────────────────────
#  Pydantic models
# ────────────────────────────────────────────────────────────────────────────────
class UserCredentials(BaseModel):
    username: str
    password: str
    role: str  # "Learner" or "Instructor"

class NewUser(UserCredentials):
    name: str
    email: str


@app.post("/auth/verify_user")
def verify_user(creds: UserCredentials):
    """
    Validate user credentials.
    Returns {username, role} on success; 401 on failure.
    """
    try:
        print(f"Verify user attempt for: {creds.username}, role: {creds.role}")
        
        table_map = {
            "Learner": "Learners",
            "Instructor": "Instructors"
        }
        table = table_map.get(creds.role)
        if not table:
            print(f"Invalid role: {creds.role}")
            raise HTTPException(status_code=400, detail="Invalid role")

        conn = connect_db()
        try:
            with conn.cursor() as cur:
                query = f"SELECT Password FROM {table} WHERE AccountName=%s LIMIT 1"
                print(f"Executing query: {query} with username: {creds.username}")
                
                cur.execute(query, (creds.username,))
                row = cur.fetchone()
                
                if not row:
                    print(f"No user found with username: {creds.username} in table: {table}")
        except Exception as db_err:
            print(f"Database error: {str(db_err)}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(db_err)}")
        finally:
            conn.close()

        if not row:
            print(f"Authentication failed: User not found")
            raise HTTPException(status_code=401, detail="Incorrect username or password")
            
        password_valid = check_password(creds.password, row[0])
        print(f"Password check result: {password_valid}")
        
        if not password_valid:
            print(f"Authentication failed: Invalid password")
            raise HTTPException(status_code=401, detail="Incorrect username or password")

        print(f"Authentication successful for: {creds.username}")
        return {"username": creds.username, "role": creds.role}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in verify_user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.post("/auth/register_user")
def register_user(user: NewUser):
    """
    Simple sign-up endpoint.
    Returns 201 Created on success, 409 if username/email exists.
    """
    table_cfg = {
        "Learner": ("Learners", "LearnerName"),
        "Instructor": ("Instructors", "InstructorName")
    }
    cfg = table_cfg.get(user.role)
    if not cfg:
        raise HTTPException(status_code=400, detail="Invalid role")

    table, name_col = cfg
    hashed_pw = hash_password(user.password)

    conn = connect_db()
    try:
        with conn.cursor() as cur:
            # Uniqueness check
            cur.execute(
                f"SELECT 1 FROM {table} WHERE AccountName=%s OR Email=%s LIMIT 1",
                (user.username, user.email)
            )
            if cur.fetchone():
                raise HTTPException(status_code=409, detail="Username or email already exists")

            # Insert new record
            cur.execute(
                f"INSERT INTO {table} ({name_col}, Email, AccountName, Password) "
                f"VALUES (%s, %s, %s, %s)",
                (user.name, user.email, user.username, hashed_pw)
            )
            conn.commit()
    finally:
        conn.close()

    return {"msg": "User created", "username": user.username, "role": user.role}, 201


@app.post("/api/auth/logout")
async def logout():
    response = JSONResponse(content={"message": "Logged out successfully"})
    # Clear all auth-related cookies
    response.delete_cookie(key="auth_token", path="/")
    response.delete_cookie(key="session_id", path="/")
    return response

@app.get("/api/users")
async def get_users(role: str):
    table_map = {
        "Learner": "Learners",
        "Instructor": "Instructors"
    }
    table = table_map.get(role)
    if not table:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    conn = connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT * FROM {table}")
            columns = [desc[0] for desc in cur.description]
            users = [dict(zip(columns, row)) for row in cur.fetchall()]
            return users
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/statistics/users/count")
async def get_user_count(role: str):
    table_map = {
        "Learner": "Learners",
        "Instructor": "Instructors"
    }
    table = table_map.get(role)
    if not table:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    conn = connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            count = cur.fetchone()[0]
            return {"count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()