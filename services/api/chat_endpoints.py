from fastapi import APIRouter, Depends, HTTPException, Request, Cookie
from typing import Dict
from services.api.db.token_utils import decode_token
from services.api.chatbot.core import get_chat_response, get_chat_response_lecture
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
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Get chatbot response
        response = get_chat_response(message.message)
        return {"answer": response}

    except HTTPException as he:
        raise he
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
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Get chatbot response for specific lecture
        response = get_chat_response_lecture(message.message, lecture_id)
        return {"answer": response}

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Lecture chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/chat/history")
async def clear_history_endpoint(request: Request, auth_token: str = Cookie(None)):
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
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Clear both regular and lecture chat history
        from services.api.chatbot.core import clear_chat_history, clear_lecture_chat_history
        clear_chat_history()
        clear_lecture_chat_history()
        
        return {"status": "success", "message": "Chat history cleared"}

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Clear history error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
