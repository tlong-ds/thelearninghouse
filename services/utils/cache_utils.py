import json
from functools import wraps
from services.config.redis_config import get_redis_client
import time

redis_client = get_redis_client()

def cache_data(key_prefix, expire_time=3600):
    """
    A decorator that caches the result of a function in Redis.
    
    Args:
        key_prefix (str): Prefix for the Redis key
        expire_time (int): Time in seconds for the cache to expire (default: 1 hour)
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Create a unique key based on the function arguments
            cache_key = f"{key_prefix}:{str(args)}:{str(kwargs)}"
            
            # Try to get the cached result
            cached_result = redis_client.get(cache_key)
            if cached_result:
                return json.loads(cached_result)
            
            # If not cached, execute the function
            result = await func(*args, **kwargs)
            
            # Cache the result
            redis_client.setex(
                cache_key,
                expire_time,
                json.dumps(result)
            )
            
            return result
        return wrapper
    return decorator

def clear_cache(pattern="*"):
    """
    Clear cache entries matching the given pattern
    """
    cursor = 0
    while True:
        cursor, keys = redis_client.scan(cursor, match=pattern)
        if keys:
            redis_client.delete(*keys)
        if cursor == 0:
            break

def cache_with_fallback(func):
    """
    A decorator that implements cache with fallback mechanism
    If Redis is unavailable, it will execute the function directly
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        cache_key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
        try:
            # Try to get from cache
            cached_result = redis_client.get(cache_key)
            if cached_result:
                return json.loads(cached_result)
            
            # If not in cache, execute function
            result = await func(*args, **kwargs)
            
            # Cache the result
            redis_client.setex(
                cache_key,
                3600,  # 1 hour default
                json.dumps(result)
            )
            return result
        except Exception as e:
            # If Redis fails, execute function directly
            print(f"Cache error: {str(e)}, executing function directly")
            return await func(*args, **kwargs)
    return wrapper
