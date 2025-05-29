# Cache utility functions for API endpoints
import json
import zlib
import base64
import binascii
import time
from services.config.valkey_config import get_redis_client, is_connection_available

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
    Get data from Valkey cache or database with optional compression
    
    Args:
        key: Valkey key
        db_fetch_func: Function to fetch data from database
        ttl: Time-to-live in seconds
        use_compression: Whether to use compression for large objects
    """
    global cache_hits, cache_misses, cached_data_size, compressed_data_size
    
    # If Valkey is not available, fetch directly from database
    if not is_connection_available() or not redis_client:
        print(f"Cache DISABLED: {key} - fetching from database")
        cache_misses += 1
        return await db_fetch_func()
    
    try:
        # Check if data is in cache
        cached_data = redis_client.get(key)
        if cached_data:
            # Increment hit counter
            cache_hits += 1
            print(f"Cache HIT: {key}")
            
            try:
                # Check if data is compressed (starts with special prefix)
                # Handle both string and bytes (due to decode_responses setting)
                if ((isinstance(cached_data, bytes) and cached_data.startswith(b'COMPRESSED:')) or
                    (isinstance(cached_data, str) and cached_data.startswith('COMPRESSED:'))):
                    # Remove prefix and decompress
                    if isinstance(cached_data, str):
                        compressed_data = base64.b64decode(cached_data[11:])
                    else:
                        compressed_data = base64.b64decode(cached_data[11:])
                    decompressed_data = zlib.decompress(compressed_data)
                    return json.loads(decompressed_data.decode('utf-8'))
                else:
                    # Regular non-compressed data
                    return json.loads(cached_data)
            except (json.JSONDecodeError, zlib.error, binascii.Error) as e:
                print(f"Cache ERROR for {key}: {e}")
                print("Falling back to database")
                # Delete corrupted cache entry
                redis_client.delete(key)
                cache_misses += 1
                return await db_fetch_func()
        
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
            
            # Store compressed data in Valkey
            redis_client.setex(key, ttl, redis_value)
        else:
            # Store regular data
            redis_client.setex(key, ttl, serialized_data)
        
        return data
    
    except Exception as e:
        print(f"Cache ERROR for {key}: {e}")
        print("Falling back to database")
        cache_misses += 1
        return await db_fetch_func()

def invalidate_cache(keys):
    """Delete multiple cache keys"""
    if not is_connection_available() or not redis_client:
        print("Cache DISABLED: Cannot invalidate cache keys")
        return
    
    try:
        if keys:
            redis_client.delete(*keys)
    except Exception as e:
        print(f"Cache invalidation ERROR: {e}")

def invalidate_cache_pattern(pattern):
    """
    Delete all cache keys matching a pattern
    For example: 'user:profile:*' to delete all user profiles
    """
    if not is_connection_available() or not redis_client:
        print("Cache DISABLED: Cannot invalidate cache pattern")
        return
    
    try:
        cursor = 0
        while True:
            cursor, keys = redis_client.scan(cursor, match=pattern, count=100)
            if keys:
                redis_client.delete(*keys)
            if cursor == 0:
                break
    except Exception as e:
        print(f"Cache pattern invalidation ERROR: {e}")

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
