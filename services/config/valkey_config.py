import valkey
import os
from dotenv import load_dotenv

load_dotenv()

# Valkey Configuration
VALKEY_HOST = os.getenv('VALKEY_HOST', os.getenv('REDIS_HOST', 'localhost'))
VALKEY_PORT = int(os.getenv('VALKEY_PORT', os.getenv('REDIS_PORT', 6379)))
VALKEY_USER = os.getenv('VALKEY_USER', os.getenv('REDIS_USER', 'default'))
VALKEY_PASSWORD = os.getenv('VALKEY_PASSWORD', os.getenv('REDIS_PASSWORD', None))
VALKEY_DB = int(os.getenv('VALKEY_DB', os.getenv('REDIS_DB', 0)))
VALKEY_TTL = int(os.getenv('VALKEY_TTL', os.getenv('REDIS_TTL', 0)))
# Try to create Valkey client with fallback options
valkey_client = None
connection_available = False

def create_valkey_client():
    """Create Valkey client with fallback connection options"""
    global valkey_client, connection_available
    
    try:
        # Try with SSL if password is provided (production)
        if VALKEY_PASSWORD:
            print(f"🔐 Attempting SSL connection to Valkey at {VALKEY_HOST}:{VALKEY_PORT}")
            valkey_client = valkey.Valkey(
                host=VALKEY_HOST,
                port=VALKEY_PORT,
                username=VALKEY_USER,
                password=VALKEY_PASSWORD,
                db=VALKEY_DB,
                decode_responses=True,
                ssl=True,
                ssl_cert_reqs="required",
                cache_ttl=VALKEY_TTL
            )
        else:
            # Try without SSL for local development
            print(f"🔓 Attempting local connection to Valkey at {VALKEY_HOST}:{VALKEY_PORT}")
            valkey_client = valkey.Valkey(
                host=VALKEY_HOST,
                port=VALKEY_PORT,
                db=VALKEY_DB,
                decode_responses=True,
                cache_ttl=VALKEY_TTL
            )
        
        # Test the connection for both SSL and non-SSL
        valkey_client.ping()
        connection_available = True
        print("✅ Successfully connected to Valkey")
        
    except Exception as e:
        print(f"⚠️  Valkey connection failed: {e}")
        print("🔄 Falling back to non-cached operations")
        connection_available = False
        valkey_client = None

# Initialize the client
create_valkey_client()

# Maintain backward compatibility - alias for existing code
redis_client = valkey_client

def get_redis_client():
    """Returns the Valkey client instance (backward compatible)"""
    return valkey_client

def get_valkey_client():
    """Returns the Valkey client instance"""
    return valkey_client

def is_connection_available():
    """Check if Valkey connection is available"""
    return connection_available

# Test Valkey connection
def test_connection():
    global connection_available
    if not valkey_client:
        return False
        
    try:
        valkey_client.ping()
        connection_available = True
        print("Successfully connected to Valkey")
        return True
    except Exception as e:
        connection_available = False
        print(f"Failed to connect to Valkey: {e}")
        return False
