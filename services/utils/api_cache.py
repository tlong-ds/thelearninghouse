# Cache utility functions for API endpoints
import json
import zlib
import base64
import time
from services.config.redis_config import get_redis_client

redis_client = get_redis_client()

# Cache metrics
cache_hits = 0
cache_misses = 0
start_time = time.time()
cached_data_size = 0
compressed_data_size = 0

# Compression threshold in bytes (10KB)
COMPRESSION_THRESHOLD = 10 * 1024

async def get_cached_data(key, db_fetch_func, ttl=3600, use_compression=False):
    """
    Get data from Redis cache or database with optional compression
    
    Args:
        key: Redis key
        db_fetch_func: Function to fetch data from database
        ttl: Time-to-live in seconds
        use_compression: Whether to use compression for large objects
    """
    global cache_hits, cache_misses, cached_data_size, compressed_data_size
    
    # Check if data is in cache
    cached_data = redis_client.get(key)
    if cached_data:
        # Increment hit counter
        cache_hits += 1
        print(f"Cache HIT: {key}")
        
        # Check if data is compressed (starts with special prefix)
        if isinstance(cached_data, bytes) and cached_data.startswith(b'COMPRESSED:'):
            # Remove prefix and decompress
            compressed_data = base64.b64decode(cached_data[11:])
            decompressed_data = zlib.decompress(compressed_data)
            return json.loads(decompressed_data.decode('utf-8'))
        else:
            # Regular non-compressed data
            return json.loads(cached_data)
    
    # Increment miss counter
    cache_misses += 1
    print(f"Cache MISS: {key}")
    
    # Fetch data from database
    data = await db_fetch_func()
    
    # Serialize the data
    serialized_data = json.dumps(data)
    serialized_bytes = serialized_data.encode('utf-8')
    
    # Track original size
    original_size = len(serialized_bytes)
    cached_data_size += original_size
    
    # Decide whether to compress based on size and flag
    if use_compression and original_size > COMPRESSION_THRESHOLD:
        # Compress data
        compressed_data = zlib.compress(serialized_bytes)
        encoded_data = base64.b64encode(compressed_data)
        
        # Store with a prefix to indicate compression
        redis_value = b'COMPRESSED:' + encoded_data
        
        # Track compressed size
        compressed_size = len(redis_value)
        compressed_data_size += compressed_size
        
        # Calculate compression ratio
        ratio = (compressed_size / original_size) * 100
        print(f"Compressed {key}: {original_size} -> {compressed_size} bytes ({ratio:.2f}%)")
        
        # Store compressed data in Redis
        redis_client.setex(key, ttl, redis_value)
    else:
        # Store regular data
        redis_client.setex(key, ttl, serialized_data)
    
    return data

def invalidate_cache(keys):
    """Delete multiple cache keys"""
    if keys:
        redis_client.delete(*keys)

def invalidate_cache_pattern(pattern):
    """
    Delete all cache keys matching a pattern
    For example: 'user:profile:*' to delete all user profiles
    """
    cursor = 0
    while True:
        cursor, keys = redis_client.scan(cursor, match=pattern, count=100)
        if keys:
            redis_client.delete(*keys)
        if cursor == 0:
            break

def get_cache_metrics():
    """Get cache hit/miss metrics and efficiency statistics"""
    global cache_hits, cache_misses, start_time, cached_data_size, compressed_data_size
    
    total_requests = cache_hits + cache_misses
    hit_ratio = 0
    if total_requests > 0:
        hit_ratio = (cache_hits / total_requests) * 100
    
    uptime = time.time() - start_time
    
    compression_savings = 0
    if cached_data_size > 0 and compressed_data_size > 0:
        compression_savings = 100 - ((compressed_data_size / cached_data_size) * 100)
    
    return {
        "hits": cache_hits,
        "misses": cache_misses,
        "total_requests": total_requests,
        "hit_ratio": f"{hit_ratio:.2f}%",
        "uptime_seconds": uptime,
        "cached_data_size_kb": cached_data_size / 1024,
        "compressed_data_size_kb": compressed_data_size / 1024,
        "compression_savings": f"{compression_savings:.2f}%"
    }

def reset_cache_metrics():
    """Reset all cache metrics counters"""
    global cache_hits, cache_misses, start_time, cached_data_size, compressed_data_size
    cache_hits = 0
    cache_misses = 0
    start_time = time.time()
    cached_data_size = 0
    compressed_data_size = 0
    return {"message": "Cache metrics reset"}
