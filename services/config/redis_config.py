import redis
import os
from dotenv import load_dotenv

load_dotenv()

# Redis Configuration
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', None)
REDIS_DB = int(os.getenv('REDIS_DB', 0))

# Create Redis client
redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    db=REDIS_DB,
    decode_responses=True  # This automatically decodes responses to strings
)

def get_redis_client():
    """Returns the Redis client instance"""
    return redis_client

# Test Redis connection
def test_connection():
    try:
        redis_client.ping()
        print("Successfully connected to Redis")
        return True
    except redis.ConnectionError:
        print("Failed to connect to Redis")
        return False
