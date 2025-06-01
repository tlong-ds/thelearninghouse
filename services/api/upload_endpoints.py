from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
import boto3
import json
import os
import time
import logging
import asyncio
from typing import Dict, List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
from botocore.exceptions import ClientError
from services.api.api_endpoints import connect_db
from services.api.db.token_utils import decode_token
from services.utils.api_cache import invalidate_cache_pattern

# Configure logging for upload operations
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("upload_endpoints")

# Initialize S3 client
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
REGION = os.getenv("REGION_NAME", "ap-southeast-1")
BUCKET_NAME = "tlhmaterials"

s3 = boto3.client('s3',
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=REGION
)

# Router initialization
router = APIRouter(
    tags=["uploads"],
    responses={404: {"description": "Not found"}},
)

# In-memory storage for active multipart uploads (for quick access)
# Structure: {upload_id: {parts: [], course_id: str, lecture_id: str, upload_key: str, ...}}
active_uploads = {}

# Cache persistence functions for upload state
def save_upload_to_cache(upload_id, upload_info):
    """Save upload information to cache for persistence"""
    try:
        from services.config.valkey_config import get_redis_client, is_connection_available
        
        if not is_connection_available():
            logger.warning("Cache not available, upload data will only be stored in memory")
            return
        
        redis_client = get_redis_client()
        cache_key = f"multipart_upload:{upload_id}"
        
        # Convert datetime objects to ISO strings for JSON serialization
        cache_data = upload_info.copy()
        if isinstance(cache_data.get('created_at'), datetime):
            cache_data['created_at'] = cache_data['created_at'].isoformat()
        if isinstance(cache_data.get('expires_at'), datetime):
            cache_data['expires_at'] = cache_data['expires_at'].isoformat()
        
        # Set expiry based on upload expiry time (24 hours)
        ttl = 24 * 3600  # 24 hours
        redis_client.setex(cache_key, ttl, json.dumps(cache_data))
        logger.info(f"Saved upload {upload_id} to cache with TTL {ttl}s")
        
    except Exception as e:
        logger.error(f"Error saving upload to cache: {e}")

def save_upload_part_to_cache(upload_id, part_number, etag):
    """Save individual part information to cache"""
    try:
        from services.config.valkey_config import get_redis_client, is_connection_available
        
        if not is_connection_available():
            return
        
        redis_client = get_redis_client()
        cache_key = f"multipart_upload_part:{upload_id}:{part_number}"
        
        part_data = {
            'part_number': part_number,
            'etag': etag,
            'uploaded_at': datetime.now().isoformat()
        }
        
        # Set expiry to 24 hours
        ttl = 24 * 3600
        redis_client.setex(cache_key, ttl, json.dumps(part_data))
        logger.debug(f"Saved part {part_number} for upload {upload_id} to cache")
        
    except Exception as e:
        logger.error(f"Error saving upload part to cache: {e}")

def load_upload_from_cache(upload_id):
    """Load upload information from cache"""
    try:
        from services.config.valkey_config import get_redis_client, is_connection_available
        
        if not is_connection_available():
            return None
        
        redis_client = get_redis_client()
        cache_key = f"multipart_upload:{upload_id}"
        
        cached_data = redis_client.get(cache_key)
        if not cached_data:
            return None
        
        upload_info = json.loads(cached_data)
        
        # Convert ISO strings back to datetime objects
        if 'created_at' in upload_info and isinstance(upload_info['created_at'], str):
            upload_info['created_at'] = datetime.fromisoformat(upload_info['created_at'])
        if 'expires_at' in upload_info and isinstance(upload_info['expires_at'], str):
            upload_info['expires_at'] = datetime.fromisoformat(upload_info['expires_at'])
        
        # Load parts data
        parts_pattern = f"multipart_upload_part:{upload_id}:*"
        parts_keys = redis_client.keys(parts_pattern)
        parts = []
        
        for part_key in parts_keys:
            try:
                part_data = json.loads(redis_client.get(part_key))
                parts.append({
                    'PartNumber': part_data['part_number'],
                    'ETag': part_data['etag']
                })
            except Exception as e:
                logger.error(f"Error loading part data from {part_key}: {e}")
        
        # Sort parts by part number
        parts.sort(key=lambda x: x['PartNumber'])
        upload_info['parts'] = parts
        upload_info['parts_received'] = len(parts)
        
        logger.info(f"Loaded upload {upload_id} from cache with {len(parts)} parts")
        return upload_info
        
    except Exception as e:
        logger.error(f"Error loading upload from cache: {e}")
        return None

def remove_upload_from_cache(upload_id):
    """Remove upload and its parts from cache"""
    try:
        from services.config.valkey_config import get_redis_client, is_connection_available
        
        if not is_connection_available():
            return
        
        redis_client = get_redis_client()
        
        # Remove main upload data
        cache_key = f"multipart_upload:{upload_id}"
        redis_client.delete(cache_key)
        
        # Remove all parts
        parts_pattern = f"multipart_upload_part:{upload_id}:*"
        parts_keys = redis_client.keys(parts_pattern)
        if parts_keys:
            redis_client.delete(*parts_keys)
        
        logger.info(f"Removed upload {upload_id} and {len(parts_keys)} parts from cache")
        
    except Exception as e:
        logger.error(f"Error removing upload from cache: {e}")

def get_upload_info(upload_id):
    """Get upload info from memory first, then cache if not found"""
    # Try memory first (fastest)
    if upload_id in active_uploads:
        return active_uploads[upload_id]
    
    # Try cache
    upload_info = load_upload_from_cache(upload_id)
    if upload_info:
        # Cache in memory for faster subsequent access
        active_uploads[upload_id] = upload_info
        return upload_info
    
    return None

# Models
class InitUploadResponse(BaseModel):
    upload_id: str
    presigned_urls: Dict[str, str]
    key: str
    expires_at: datetime

class CompletedPart(BaseModel):
    ETag: str
    PartNumber: int

class CompleteUploadRequest(BaseModel):
    upload_id: str
    parts: List[CompletedPart]

# Helper functions for user info extraction
def get_user_info_from_token(request: Request, auth_token: Optional[str] = None):
    """Extract user information from token without additional verification"""
    if not auth_token:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            auth_token = auth_header.split(' ')[1]
        else:
            raise HTTPException(status_code=401, detail="Authentication token required")
    
    try:
        user_data = decode_token(auth_token)
        return {
            'username': user_data.get('username'),
            'role': user_data.get('role'),
            'user_id': user_data.get('user_id')
        }
    except Exception as e:
        logger.error(f"Token decode error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid authentication token")

# Helper to generate upload key for lecture video
def get_lecture_video_key(course_id: int, lecture_id: int):
    return f"videos/cid{course_id}/lid{lecture_id}/vid_lecture.mp4"

@router.post("/upload/init-upload")
async def init_upload(
    request: Request,
    course_id: int = Form(...),
    lecture_id: int = Form(...),
    file_size: int = Form(...),
    file_type: str = Form(...),
    parts: int = Form(...),
    auth_token: Optional[str] = None
):
    # Get user info from token
    user_info = get_user_info_from_token(request, auth_token)
    instructor_id = user_info['user_id']
    
    # Verify this instructor owns this course and lecture exists (with retry for newly created lectures)
    max_retries = 3
    retry_delay = 0.5  # 500ms delay between retries
    
    for attempt in range(max_retries):
        conn = connect_db()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT CourseID FROM Courses WHERE CourseID = %s AND InstructorID = %s",
                    (course_id, instructor_id)
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=403, detail="Not authorized to modify this course")
                
                # Verify lecture belongs to this course (with retry for newly created lectures)
                cursor.execute(
                    "SELECT LectureID FROM Lectures WHERE LectureID = %s AND CourseID = %s",
                    (lecture_id, course_id)
                )
                lecture_result = cursor.fetchone()
                
                if lecture_result:
                    # Lecture found, break out of retry loop
                    break
                elif attempt < max_retries - 1:
                    # Lecture not found, but we have more retries
                    logger.info(f"Lecture {lecture_id} not found on attempt {attempt + 1}, retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                    retry_delay *= 1.5  # Exponential backoff
                else:
                    # Final attempt failed
                    raise HTTPException(status_code=404, detail="Lecture not found or doesn't belong to this course")
        finally:
            conn.close()
        
        # If we reached here and haven't broken out, we need to retry
        if attempt < max_retries - 1:
            continue
        else:
            break
    
    # Generate S3 key for the video
    key = get_lecture_video_key(course_id, lecture_id)
    
    # Log upload initialization
    logger.info(f"Initializing upload for course {course_id}, lecture {lecture_id}, size: {file_size}, parts: {parts}")
    logger.info(f"Instructor ID: {instructor_id}, File type: {file_type}")
    
    try:
        # Create multipart upload
        logger.info(f"Creating multipart upload for key: {key}")
        multipart_upload = s3.create_multipart_upload(
            Bucket=BUCKET_NAME,
            Key=key,
            ContentType=file_type,
            ACL='public-read',
            ContentDisposition='inline'
        )
        
        upload_id = multipart_upload['UploadId']
        logger.info(f"Multipart upload created with ID: {upload_id}")
        
        # Generate presigned URLs for each part
        presigned_urls = {}
        logger.info(f"Generating {parts} presigned URLs...")
        for part_number in range(1, parts + 1):
            presigned_url = s3.generate_presigned_url(
                'upload_part',
                Params={
                    'Bucket': BUCKET_NAME,
                    'Key': key,
                    'UploadId': upload_id,
                    'PartNumber': part_number
                },
                ExpiresIn=3600  # 1 hour expiry
            )
            presigned_urls[str(part_number)] = presigned_url
            logger.debug(f"Generated presigned URL for part {part_number}")
        
        logger.info(f"Generated {len(presigned_urls)} presigned URLs")
        
        # Store upload info in both memory and cache
        expires_at = datetime.now() + timedelta(hours=24)
        upload_info = {
            'course_id': course_id,
            'lecture_id': lecture_id,
            'key': key,
            'file_size': file_size,
            'file_type': file_type,
            'parts_expected': parts,
            'parts_received': 0,
            'parts': [],
            'instructor_id': instructor_id,
            'status': 'initialized',
            'created_at': datetime.now(),
            'expires_at': expires_at
        }
        
        # Save to cache for persistence across server restarts
        save_upload_to_cache(upload_id, upload_info)
        
        # Store in memory for faster access
        active_uploads[upload_id] = upload_info
        
        logger.info(f"Upload initialized with ID: {upload_id}")
        
        return JSONResponse({
            'upload_id': upload_id,
            'presigned_urls': presigned_urls,
            'key': key,
            'expires_at': expires_at.isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error initializing upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize upload: {str(e)}")

@router.post("/upload/upload-part")
async def upload_part_status(
    request: Request,
    upload_id: str = Form(...),
    part_number: int = Form(...),
    etag: str = Form(...),
    auth_token: Optional[str] = None
):
    # Get user info from token
    user_info = get_user_info_from_token(request, auth_token)
    instructor_id = user_info['user_id']
    
    # Verify upload exists and belongs to this instructor
    upload_info = get_upload_info(upload_id)
    if not upload_info:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    if upload_info['instructor_id'] != instructor_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this upload")
     # Check if upload is still valid
    if upload_info['expires_at'] < datetime.now():
        raise HTTPException(status_code=400, detail="Upload expired")
    
    # Validate and clean up ETag format
    def normalize_etag(etag_value):
        """Normalize ETag format to ensure proper S3 compatibility"""
        if not etag_value:
            return None
        
        # Remove any existing quotes first
        clean_etag = etag_value.strip().strip('"')
        
        # Add quotes back for S3 compatibility
        normalized = f'"{clean_etag}"'
        return normalized
    
    etag = normalize_etag(etag)
    if not etag:
        raise HTTPException(status_code=400, detail=f"Invalid ETag provided for part {part_number}")
    
    logger.info(f"Normalized ETag for part {part_number}: {etag}")

    # Add part info
    part_info = {
        'ETag': etag,
        'PartNumber': part_number
    }
    upload_info['parts'].append(part_info)
    
    upload_info['parts_received'] += 1
    
    # Save part to cache for persistence
    save_upload_part_to_cache(upload_id, part_number, etag)
    
    # Update the upload info in cache
    save_upload_to_cache(upload_id, upload_info)
    
    # Log progress with detailed part info
    logger.info(f"Upload {upload_id}: Part {part_number} received with ETag {etag}. Progress: {upload_info['parts_received']}/{upload_info['parts_expected']}")
    logger.info(f"Current parts for upload {upload_id}: {[p['PartNumber'] for p in upload_info['parts']]}")
    
    return JSONResponse({
        'upload_id': upload_id,
        'part_number': part_number,
        'parts_received': upload_info['parts_received'],
        'parts_expected': upload_info['parts_expected'],
        'progress': f"{int((upload_info['parts_received'] / upload_info['parts_expected']) * 100)}%"
    })

@router.post("/upload/complete-upload")
async def complete_upload(
    request: Request,
    upload_id: str = Form(...),
    auth_token: Optional[str] = None
):
    # Get user info from token
    user_info = get_user_info_from_token(request, auth_token)
    instructor_id = user_info['user_id']
    
    # Verify upload exists and belongs to this instructor
    upload_info = get_upload_info(upload_id)
    if not upload_info:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    if upload_info['instructor_id'] != instructor_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this upload")
    
    # Check if upload is still valid
    if upload_info['expires_at'] < datetime.now():
        # Try to abort the upload
        try:
            s3.abort_multipart_upload(
                Bucket=BUCKET_NAME,
                Key=upload_info['key'],
                UploadId=upload_id
            )
        except Exception as e:
            logger.error(f"Error aborting expired upload {upload_id}: {str(e)}")
        
        del active_uploads[upload_id]
        raise HTTPException(status_code=400, detail="Upload expired")
    
    # Verify all parts are received
    if upload_info['parts_received'] != upload_info['parts_expected']:
        raise HTTPException(status_code=400, detail=f"Not all parts received. Expected {upload_info['parts_expected']}, got {upload_info['parts_received']}")
    
    try:
        # Sort parts by part number
        parts = sorted(upload_info['parts'], key=lambda x: x['PartNumber'])
        
        # Log the parts being sent to S3
        logger.info(f"Completing upload {upload_id} with {len(parts)} parts:")
        for i, part in enumerate(parts):
            logger.info(f"  Part {i+1}: PartNumber={part['PartNumber']}, ETag={part['ETag']}")
        
        # Complete multipart upload
        try:
            response = s3.complete_multipart_upload(
                Bucket=BUCKET_NAME,
                Key=upload_info['key'],
                UploadId=upload_id,
                MultipartUpload={
                    'Parts': parts
                }
            )
            logger.info(f"S3 complete_multipart_upload response: {response}")
        except ClientError as s3_error:
            logger.error(f"S3 ClientError during completion: {s3_error}")
            raise s3_error
        except Exception as s3_error:
            logger.error(f"S3 Error during completion: {s3_error}")
            raise s3_error
        
        # Get the full video URL
        video_url = f"https://{BUCKET_NAME}.s3-{REGION}.amazonaws.com/{upload_info['key']}"
        
        # Clean up the upload from memory and cache
        course_id = upload_info['course_id']
        lecture_id = upload_info['lecture_id']
        
        # Remove from cache
        remove_upload_from_cache(upload_id)
        
        # Remove from memory
        if upload_id in active_uploads:
            del active_uploads[upload_id]
        
        # Invalidate cache for this course
        invalidate_cache_pattern(f"lectures:id:{lecture_id}:*")
        invalidate_cache_pattern(f"courses:id:{course_id}:*")
        
        logger.info(f"Upload {upload_id} completed successfully for course {course_id}, lecture {lecture_id}")
        
        return JSONResponse({
            'message': 'Upload completed successfully',
            'video_url': video_url,
            'course_id': course_id,
            'lecture_id': lecture_id,
            'key': upload_info['key']
        })
        
    except Exception as e:
        logger.error(f"Error completing upload {upload_id}: {str(e)}")
        
        # Try to abort the upload
        try:
            s3.abort_multipart_upload(
                Bucket=BUCKET_NAME,
                Key=upload_info['key'],
                UploadId=upload_id
            )
        except Exception as abort_error:
            logger.error(f"Error aborting failed upload {upload_id}: {str(abort_error)}")
        
        # Clean up
        if upload_id in active_uploads:
            del active_uploads[upload_id]
            
        raise HTTPException(status_code=500, detail=f"Failed to complete upload: {str(e)}")

@router.post("/upload/abort-upload")
async def abort_upload(
    request: Request,
    upload_id: str = Form(...),
    auth_token: Optional[str] = None
):
    # Get user info from token
    user_info = get_user_info_from_token(request, auth_token)
    instructor_id = user_info['user_id']
    
    # Verify upload exists and belongs to this instructor
    upload_info = get_upload_info(upload_id)
    if not upload_info:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    if upload_info['instructor_id'] != instructor_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this upload")
    
    try:
        # Abort multipart upload
        s3.abort_multipart_upload(
            Bucket=BUCKET_NAME,
            Key=upload_info['key'],
            UploadId=upload_id
        )
        
        # Clean up from cache and memory
        course_id = upload_info['course_id']
        lecture_id = upload_info['lecture_id']
        
        remove_upload_from_cache(upload_id)
        if upload_id in active_uploads:
            del active_uploads[upload_id]
        
        logger.info(f"Upload {upload_id} aborted for course {course_id}, lecture {lecture_id}")
        
        return JSONResponse({
            'message': 'Upload aborted successfully',
            'course_id': course_id,
            'lecture_id': lecture_id
        })
        
    except Exception as e:
        logger.error(f"Error aborting upload {upload_id}: {str(e)}")
        
        # Clean up anyway
        if upload_id in active_uploads:
            del active_uploads[upload_id]
            
        raise HTTPException(status_code=500, detail=f"Failed to abort upload: {str(e)}")

@router.get("/upload/status/{upload_id}")
async def get_upload_status(
    request: Request,
    upload_id: str,
    auth_token: Optional[str] = None
):
    # Get user info from token
    user_info = get_user_info_from_token(request, auth_token)
    instructor_id = user_info['user_id']
    
    # Verify upload exists and belongs to this instructor
    upload_info = get_upload_info(upload_id)
    if not upload_info:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    if upload_info['instructor_id'] != instructor_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this upload")
    
    # Calculate progress
    progress = int((upload_info['parts_received'] / upload_info['parts_expected']) * 100)
    
    return JSONResponse({
        'upload_id': upload_id,
        'status': upload_info['status'],
        'course_id': upload_info['course_id'],
        'lecture_id': upload_info['lecture_id'],
        'parts_received': upload_info['parts_received'],
        'parts_expected': upload_info['parts_expected'],
        'progress': f"{progress}%",
        'progress_value': progress,
        'created_at': upload_info['created_at'].isoformat(),
        'expires_at': upload_info['expires_at'].isoformat()
    })

@router.get("/upload/active-uploads")
async def list_active_uploads(
    request: Request,
    auth_token: Optional[str] = None
):
    # Get user info from token
    user_info = get_user_info_from_token(request, auth_token)
    instructor_id = user_info['user_id']
    
    # Filter uploads for this instructor from in-memory storage
    # Note: This only shows uploads that are currently in memory
    # For complete persistence, you'd need to also query cache patterns
    instructor_uploads = {}
    for upload_id, info in active_uploads.items():
        if info['instructor_id'] == instructor_id:
            # Don't include sensitive data
            instructor_uploads[upload_id] = {
                'course_id': info['course_id'],
                'lecture_id': info['lecture_id'],
                'status': info['status'],
                'progress': f"{int((info['parts_received'] / info['parts_expected']) * 100)}%",
                'created_at': info['created_at'].isoformat(),
                'expires_at': info['expires_at'].isoformat()
            }
    
    return JSONResponse({
        'active_uploads': instructor_uploads,
        'count': len(instructor_uploads)
    })

@router.post("/upload/cleanup")
async def cleanup_uploads(
    request: Request,
    auth_token: Optional[str] = None
):
    # Get user info from token (but don't restrict to instructors for cleanup)
    user_info = get_user_info_from_token(request, auth_token)
    
    now = datetime.now()
    expired_uploads = []
    
    # Clean up from memory and also check cache for other expired uploads
    for upload_id in list(active_uploads.keys()):
        upload_info = get_upload_info(upload_id)
        if upload_info and upload_info['expires_at'] < now:
            try:
                # Abort the upload in S3
                s3.abort_multipart_upload(
                    Bucket=BUCKET_NAME,
                    Key=upload_info['key'],
                    UploadId=upload_id
                )
            except Exception as e:
                logger.error(f"Error aborting expired upload {upload_id}: {str(e)}")
            
            # Remove from cache and memory
            remove_upload_from_cache(upload_id)
            if upload_id in active_uploads:
                del active_uploads[upload_id]
            expired_uploads.append(upload_id)
    
    return JSONResponse({
        'cleaned_uploads': expired_uploads,
        'count': len(expired_uploads)
    })

# Periodically clean up expired uploads
async def background_cleanup():
    """Periodically clean up expired uploads"""
    while True:
        now = datetime.now()
        # Create a copy of the keys to avoid dictionary size change during iteration
        upload_ids = list(active_uploads.keys())
        
        for upload_id in upload_ids:
            upload_info = get_upload_info(upload_id)
            if upload_info and upload_info['expires_at'] < now:
                try:
                    # Abort the upload in S3
                    s3.abort_multipart_upload(
                        Bucket=BUCKET_NAME,
                        Key=upload_info['key'],
                        UploadId=upload_id
                    )
                    logger.info(f"Automatically cleaned up expired upload {upload_id}")
                except Exception as e:
                    logger.error(f"Error cleaning up expired upload {upload_id}: {str(e)}")
                
                # Remove from cache and memory
                remove_upload_from_cache(upload_id)
                if upload_id in active_uploads:
                    del active_uploads[upload_id]
        
        # Wait for 1 hour before next cleanup
        await asyncio.sleep(3600)

# Background cleanup task storage
cleanup_task = None

# Function to start background cleanup task
def start_cleanup_task():
    """Start the background cleanup task"""
    global cleanup_task
    if cleanup_task is None or cleanup_task.done():
        cleanup_task = asyncio.create_task(background_cleanup())
        logger.info("Background cleanup task started")
    return cleanup_task

@router.post("/courses/{course_id}/lectures/{lecture_id}/upload-video")
async def upload_video_standard(
    request: Request,
    course_id: int,
    lecture_id: int,
    video: UploadFile = File(...),
    auth_token: Optional[str] = None
):
    # Get user info from token
    user_info = get_user_info_from_token(request, auth_token)
    instructor_id = user_info['user_id']
    
    # Verify this instructor owns this course and lecture exists (with retry for newly created lectures)
    max_retries = 3
    retry_delay = 0.5  # 500ms delay between retries
    
    for attempt in range(max_retries):
        conn = connect_db()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT CourseID FROM Courses WHERE CourseID = %s AND InstructorID = %s",
                    (course_id, instructor_id)
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=403, detail="Not authorized to modify this course")
                
                # Verify lecture belongs to this course (with retry for newly created lectures)
                cursor.execute(
                    "SELECT LectureID FROM Lectures WHERE LectureID = %s AND CourseID = %s",
                    (lecture_id, course_id)
                )
                lecture_result = cursor.fetchone()
                
                if lecture_result:
                    # Lecture found, break out of retry loop
                    break
                elif attempt < max_retries - 1:
                    # Lecture not found, but we have more retries
                    logger.info(f"Lecture {lecture_id} not found on attempt {attempt + 1}, retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                    retry_delay *= 1.5  # Exponential backoff
                else:
                    # Final attempt failed
                    raise HTTPException(status_code=404, detail="Lecture not found or doesn't belong to this course")
        finally:
            conn.close()
        
        # If we reached here and haven't broken out, we need to retry
        if attempt < max_retries - 1:
            continue
        else:
            break

    try:
        # File validation
        if not video.content_type or not video.content_type.startswith('video/'):
            raise HTTPException(status_code=400, detail="Invalid file type. Please upload a video file")
        
        # Check file size (limit to 100MB for standard upload)
        video.file.seek(0, 2)  # Seek to end
        file_size = video.file.tell()
        video.file.seek(0)  # Reset to beginning
        
        if file_size > 100 * 1024 * 1024:  # 100MB
            raise HTTPException(status_code=400, detail="File too large for standard upload. Use chunked upload for files over 100MB")
        
        # Generate S3 key for the video
        key = get_lecture_video_key(course_id, lecture_id)
        
        logger.info(f"Starting standard upload for course {course_id}, lecture {lecture_id}, size: {file_size}")
        
        # Upload to S3
        s3.upload_fileobj(
            video.file,
            BUCKET_NAME,
            key,
            ExtraArgs={
                'ContentType': video.content_type,
                'ACL': 'public-read',
                'ContentDisposition': 'inline'
            }
        )
        
        # Generate the video URL
        video_url = f"https://{BUCKET_NAME}.s3-{REGION}.amazonaws.com/{key}"
        
        # Invalidate cache for this lecture and course
        invalidate_cache_pattern(f"lectures:id:{lecture_id}:*")
        invalidate_cache_pattern(f"courses:id:{course_id}:*")
        
        logger.info(f"Standard upload completed successfully for course {course_id}, lecture {lecture_id}")
        
        return JSONResponse({
            'message': 'Video uploaded successfully',
            'video_url': video_url,
            'course_id': course_id,
            'lecture_id': lecture_id,
            'key': key,
            'file_size': file_size
        })
        
    except Exception as e:
        logger.error(f"Error in standard upload for course {course_id}, lecture {lecture_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload video: {str(e)}")

# Backend-Proxied Chunked Upload Endpoints (to avoid CORS issues)

@router.post("/upload/proxy/init-upload")
async def init_proxy_upload(
    request: Request,
    course_id: int = Form(...),
    lecture_id: int = Form(...),
    file_size: int = Form(...),
    file_type: str = Form(...),
    parts: int = Form(...),
    auth_token: Optional[str] = None
):
    """Initialize a backend-proxied chunked upload"""
    # Get user info from token
    user_info = get_user_info_from_token(request, auth_token)
    instructor_id = user_info['user_id']
    
    # Validate course and lecture ownership (similar to existing init_upload)
    max_retries = 3
    retry_delay = 1.0  # Start with 1 second
    
    for attempt in range(max_retries):
        try:
            conn = connect_db()
            cursor = conn.cursor()
            
            # Check if lecture exists and belongs to instructor
            cursor.execute("""
                SELECT l.LectureID, c.InstructorID 
                FROM Lectures l 
                JOIN Courses c ON l.CourseID = c.CourseID 
                WHERE l.LectureID = %s AND l.CourseID = %s
            """, (lecture_id, course_id))
            
            result = cursor.fetchone()
            if result and result[1] == instructor_id:
                break
            else:
                if attempt == max_retries - 1:
                    conn.close()
                    raise HTTPException(status_code=404, detail="Lecture not found or doesn't belong to this course")
                else:
                    conn.close()
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 1.5
                    continue
                    
        except Exception as e:
            if attempt < max_retries - 1:
                if conn:
                    conn.close()
                await asyncio.sleep(retry_delay)
                retry_delay *= 1.5
                continue
            else:
                if conn:
                    conn.close()
                raise HTTPException(status_code=404, detail="Lecture not found or doesn't belong to this course")
        finally:
            if conn:
                conn.close()
        
        break
    
    # Generate S3 key for the video
    key = get_lecture_video_key(course_id, lecture_id)
    
    logger.info(f"Initializing backend-proxied upload for course {course_id}, lecture {lecture_id}, size: {file_size}, parts: {parts}")
    
    try:
        # Create multipart upload
        multipart_upload = s3.create_multipart_upload(
            Bucket=BUCKET_NAME,
            Key=key,
            ContentType=file_type,
            ACL='public-read',
            ContentDisposition='inline'
        )
        
        upload_id = multipart_upload['UploadId']
        logger.info(f"Backend-proxied multipart upload created with ID: {upload_id}")
        
        # Store upload info in both memory and cache (no presigned URLs needed)
        expires_at = datetime.now() + timedelta(hours=24)
        upload_info = {
            'course_id': course_id,
            'lecture_id': lecture_id,
            'instructor_id': instructor_id,
            'key': key,
            'file_size': file_size,
            'file_type': file_type,
            'parts_expected': parts,
            'parts_received': 0,
            'parts': [],
            'created_at': datetime.now(),
            'expires_at': expires_at,
            'upload_type': 'proxy'  # Mark as backend-proxied
        }
        
        active_uploads[upload_id] = upload_info
        save_upload_to_cache(upload_id, upload_info)
        
        logger.info(f"Backend-proxied upload {upload_id} initialized successfully")
        
        return JSONResponse({
            'upload_id': upload_id,
            'parts_expected': parts,
            'message': 'Backend-proxied upload initialized successfully'
        })
        
    except Exception as e:
        logger.error(f"Error initializing backend-proxied upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize upload: {str(e)}")


@router.post("/upload/proxy/upload-part")
async def upload_part_proxy(
    request: Request,
    upload_id: str = Form(...),
    part_number: int = Form(...),
    chunk: UploadFile = File(...),
    auth_token: Optional[str] = None
):
    """Upload a single part through backend proxy"""
    # Get user info from token
    user_info = get_user_info_from_token(request, auth_token)
    instructor_id = user_info['user_id']
    
    # Verify upload exists and belongs to this instructor
    upload_info = get_upload_info(upload_id)
    if not upload_info:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    if upload_info['instructor_id'] != instructor_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this upload")
    
    # Check if upload is still valid
    if upload_info['expires_at'] < datetime.now():
        raise HTTPException(status_code=400, detail="Upload expired")
    
    # Verify this is a backend-proxied upload
    if upload_info.get('upload_type') != 'proxy':
        raise HTTPException(status_code=400, detail="This upload is not configured for backend proxy")
    
    try:
        # Read the chunk data
        chunk_data = await chunk.read()
        
        logger.info(f"Uploading part {part_number} for upload {upload_id} via backend proxy (size: {len(chunk_data)} bytes)")
        
        # Upload the part directly to S3 via backend
        response = s3.upload_part(
            Bucket=BUCKET_NAME,
            Key=upload_info['key'],
            PartNumber=part_number,
            UploadId=upload_id,
            Body=chunk_data
        )
        
        etag = response['ETag']
        logger.info(f"Part {part_number} uploaded successfully via backend proxy, ETag: {etag}")
        
        # Add part info
        part_info = {
            'ETag': etag,
            'PartNumber': part_number
        }
        upload_info['parts'].append(part_info)
        upload_info['parts_received'] += 1
        
        # Save part to cache for persistence
        save_upload_part_to_cache(upload_id, part_number, etag)
        
        # Update the upload info in cache
        save_upload_to_cache(upload_id, upload_info)
        
        logger.info(f"Backend-proxied upload {upload_id}: Part {part_number} received. Progress: {upload_info['parts_received']}/{upload_info['parts_expected']}")
        
        return JSONResponse({
            'upload_id': upload_id,
            'part_number': part_number,
            'etag': etag,
            'parts_received': upload_info['parts_received'],
            'parts_expected': upload_info['parts_expected'],
            'progress': f"{int((upload_info['parts_received'] / upload_info['parts_expected']) * 100)}%"
        })
        
    except Exception as e:
        logger.error(f"Error uploading part {part_number} via backend proxy for upload {upload_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload part: {str(e)}")


@router.post("/upload/proxy/complete-upload")
async def complete_proxy_upload(
    request: Request,
    upload_id: str = Form(...),
    auth_token: Optional[str] = None
):
    """Complete a backend-proxied chunked upload"""
    # Get user info from token
    user_info = get_user_info_from_token(request, auth_token)
    instructor_id = user_info['user_id']
    
    # Verify upload exists and belongs to this instructor
    upload_info = get_upload_info(upload_id)
    if not upload_info:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    if upload_info['instructor_id'] != instructor_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this upload")
    
    # Check if upload is still valid
    if upload_info['expires_at'] < datetime.now():
        # Try to abort the upload
        try:
            s3.abort_multipart_upload(
                Bucket=BUCKET_NAME,
                Key=upload_info['key'],
                UploadId=upload_id
            )
        except Exception as e:
            logger.error(f"Error aborting expired backend-proxied upload {upload_id}: {str(e)}")
        
        if upload_id in active_uploads:
            del active_uploads[upload_id]
        raise HTTPException(status_code=400, detail="Upload expired")
    
    # Verify this is a backend-proxied upload
    if upload_info.get('upload_type') != 'proxy':
        raise HTTPException(status_code=400, detail="This upload is not configured for backend proxy")
    
    # Verify all parts are received
    if upload_info['parts_received'] != upload_info['parts_expected']:
        raise HTTPException(status_code=400, detail=f"Not all parts received. Expected {upload_info['parts_expected']}, got {upload_info['parts_received']}")
    
    try:
        # Sort parts by part number
        parts = sorted(upload_info['parts'], key=lambda x: x['PartNumber'])
        
        logger.info(f"Completing backend-proxied upload {upload_id} with {len(parts)} parts")
        
        # Complete multipart upload
        response = s3.complete_multipart_upload(
            Bucket=BUCKET_NAME,
            Key=upload_info['key'],
            UploadId=upload_id,
            MultipartUpload={
                'Parts': parts
            }
        )
        
        # Get the full video URL
        video_url = f"https://{BUCKET_NAME}.s3-{REGION}.amazonaws.com/{upload_info['key']}"
        
        # Clean up the upload from memory and cache
        course_id = upload_info['course_id']
        lecture_id = upload_info['lecture_id']
        
        # Remove from cache
        remove_upload_from_cache(upload_id)
        
        # Remove from memory
        if upload_id in active_uploads:
            del active_uploads[upload_id]
        
        # Invalidate cache for this course
        invalidate_cache_pattern(f"lectures:id:{lecture_id}:*")
        invalidate_cache_pattern(f"courses:id:{course_id}:*")
        
        logger.info(f"Backend-proxied upload {upload_id} completed successfully for course {course_id}, lecture {lecture_id}")
        
        return JSONResponse({
            'message': 'Backend-proxied upload completed successfully',
            'video_url': video_url,
            'course_id': course_id,
            'lecture_id': lecture_id,
            'key': upload_info['key']
        })
        
    except Exception as e:
        logger.error(f"Error completing backend-proxied upload {upload_id}: {str(e)}")
        
        # Try to abort the upload
        try:
            s3.abort_multipart_upload(
                Bucket=BUCKET_NAME,
                Key=upload_info['key'],
                UploadId=upload_id
            )
        except Exception as abort_error:
            logger.error(f"Error aborting failed backend-proxied upload {upload_id}: {str(abort_error)}")
        
        # Clean up
        if upload_id in active_uploads:
            del active_uploads[upload_id]
            
        raise HTTPException(status_code=500, detail=f"Failed to complete upload: {str(e)}")
