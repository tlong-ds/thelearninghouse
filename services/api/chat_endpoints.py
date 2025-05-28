from fastapi import APIRouter, Depends, HTTPException, Request, Cookie
from typing import Dict, Optional
from services.api.db.token_utils import decode_token
from services.api.chatbot.core import get_chat_response, get_chat_response_lecture, clear_chat_history, clear_lecture_chat_history
from services.utils.chat_cache import get_chat_history, append_chat_message, clear_user_chat_history
from pydantic import BaseModel

router = APIRouter()

class ChatMessage(BaseModel):
    message: str

@router.post("/chat")
async def chat_endpoint(message: ChatMessage, request: Request, auth_token: str = Cookie(None)):
    try:
        # Verify auth token
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
        
        if not auth_token:
            raise HTTPException(status_code=401, detail="No authentication token provided")
            
        try:
            user_data = decode_token(auth_token)
            username = user_data.get('username')  # Get username from token
            if not username:
                raise HTTPException(status_code=401, detail="Invalid token: missing username")
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Get chatbot response
        chat_history = get_chat_history(username)
        append_chat_message(username, message.message, is_user=True)
        
        response = get_chat_response(username, message.message)
        append_chat_message(username, response, is_user=False)
        
        return {"answer": response, "history": get_chat_history(username)}

    except Exception as e:
        print(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat/lecture/{lecture_id}")
async def lecture_chat_endpoint(
    lecture_id: int, 
    message: ChatMessage, 
    request: Request, 
    auth_token: str = Cookie(None)
):
    try:
        # Verify auth token
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
        
        if not auth_token:
            raise HTTPException(status_code=401, detail="No authentication token provided")
            
        try:
            user_data = decode_token(auth_token)
            username = user_data.get('username')  # Get username from token
            if not username:
                raise HTTPException(status_code=401, detail="Invalid token: missing username")
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Get chatbot response for specific lecture
        chat_history = get_chat_history(username)
        append_chat_message(username, message.message, is_user=True)
        
        response = get_chat_response_lecture(username, message.message, lecture_id)
        append_chat_message(username, response, is_user=False)
        
        return {"answer": response, "history": get_chat_history(username)}

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Lecture chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/chat/history")
async def clear_history_endpoint(request: Request, auth_token: str = Cookie(None), lectureId: Optional[int] = None):
    try:
        # Verify auth token
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
        
        if not auth_token:
            raise HTTPException(status_code=401, detail="No authentication token provided")
            
        try:
            user_data = decode_token(auth_token)
            username = user_data.get('username')  # Get username from token
            if not username:
                raise HTTPException(status_code=401, detail="Invalid token: missing username")
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Clear Redis cache
        clear_user_chat_history(username)
        
        # Clear memory-based chat histories based on lectureId
        if lectureId is not None:
            # Only clear the specific lecture chat
            clear_lecture_chat_history(username, lectureId)
        else:
            # Clear both regular and all lecture chat histories for this user
            clear_chat_history(username)
            clear_lecture_chat_history(username)
        
        # Return empty history for frontend to use
        return {"status": "success", "message": "Chat history cleared", "history": []}

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Clear history error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/chat/history/{lecture_id}")
async def get_history_endpoint(
    lecture_id: int,
    request: Request, 
    auth_token: str = Cookie(None)
):
    try:
        # Verify auth token
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
        
        if not auth_token:
            raise HTTPException(status_code=401, detail="No authentication token provided")
            
        try:
            user_data = decode_token(auth_token)
            username = user_data.get('username')  # Get username from token
            if not username:
                raise HTTPException(status_code=401, detail="Invalid token: missing username")
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Get chat history from Redis
        chat_history = get_chat_history(username)
        
        # Return the chat history - make sure formatting is consistent
        return {"history": chat_history, "message": "History retrieved successfully"}

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Get history error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/chat/history")
async def get_general_history_endpoint(
    request: Request, 
    auth_token: str = Cookie(None)
):
    try:
        # Verify auth token
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
        
        if not auth_token:
            raise HTTPException(status_code=401, detail="No authentication token provided")
            
        try:
            user_data = decode_token(auth_token)
            username = user_data.get('username')  # Get username from token
            if not username:
                raise HTTPException(status_code=401, detail="Invalid token: missing username")
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Get chat history from Redis
        chat_history = get_chat_history(username)
        
        # Return the chat history with a debugging message
        print(f"Returning chat history for {username}: {len(chat_history)} messages")
        return {"history": chat_history, "message": "History retrieved successfully"}

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Get history error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


