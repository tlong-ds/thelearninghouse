from services.config.redis_config import get_redis_client
import json

redis_client = get_redis_client()
CHAT_HISTORY_TTL = 3600  # 1 hour session expiry

def get_chat_history(username: str) -> list:
    """Get cached chat history for a user"""
    key = f"chat:history:{username}"
    history = redis_client.get(key)
    if history:
        try:
            parsed = json.loads(history)
            print(f"Retrieved chat history for {username}: {len(parsed)} messages")
            return parsed
        except Exception as e:
            print(f"Error parsing chat history: {str(e)}")
            return []
    return []

def append_chat_message(username: str, message: str, is_user: bool):
    """Add a new message to user's chat history"""
    key = f"chat:history:{username}"
    history = get_chat_history(username)
    history.append({
        "content": message,
        "is_user": is_user
    })
    redis_client.setex(key, CHAT_HISTORY_TTL, json.dumps(history))

def clear_user_chat_history(username: str):
    """Clear chat history for a user"""
    key = f"chat:history:{username}"
    redis_client.delete(key)