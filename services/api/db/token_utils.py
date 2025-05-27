"""
token_utils.py - JWT token utilities for authentication
------------------------------------------------------
This module contains functions for JWT token encoding and decoding
Extracted to avoid circular imports between auth.py and api_endpoints.py
"""

from fastapi import HTTPException
from jose import jwt, JWTError
import time
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
SECRET_KEY = os.getenv("SECRET_TOKEN", "somesecretkey")
ALGORITHM = os.getenv("ALGORITHM", "HS256")

def create_token(data: dict, expires_in: int = 86400):
    """
    Create a JWT token from user data
    
    Args:
        data: Dictionary containing user information
        expires_in: Token expiration time in seconds (default: 24 hours)
        
    Returns:
        JWT token string
    """
    to_encode = data.copy()
    to_encode.update({"exp": time.time() + expires_in})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str):
    """
    Decode and validate a JWT token
    
    Args:
        token: JWT token string
        
    Returns:
        Dictionary with decoded token data
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=403, detail="Invalid or expired token")
