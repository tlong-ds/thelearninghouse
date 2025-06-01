from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
import boto3
import json
import os
import uuid
import logging
import asyncio
from typing import Dict, Optional, List
from pydantic import BaseModel
from io import BytesIO
from datetime import datetime, timedelta
from botocore.exceptions import ClientError
from services.api.db.token_utils import decode_token
from services.api.api_endpoints import connect_db
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

# In-memory storage for active multipart uploads
# Structure: {upload_id: {parts: [], course_id: str, lecture_id: str, upload_key: str, ...}}
active_uploads = {}

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

# Middleware to check instructor permissions
async def verify_instructor(request: Request, auth_token: Optional[str] = None):
    if not auth_token:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            auth_token = auth_header.split(' ')[1]
        else:
            raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        user_data = decode_token(auth_token)
        username = user_data.get('username')
        role = user_data.get('role')
        instructor_id = user_data.get('user_id')
        
        if role != "Instructor":
            raise HTTPException(status_code=403, detail="Only instructors can upload files")
        
        # Return instructor ID for use in the endpoints
        return instructor_id or username
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid authentication token")

# Helper to generate upload key for lecture video
def get_lecture_video_key(course_id: int, lecture_id: int):
    return f"videos/cid{course_id}/lid{lecture_id}/vid_lecture.mp4"

# 1. Initialize multipart upload
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
    # Verify instructor permissions
    instructor_id = await verify_instructor(request, auth_token)
    
    # Verify this instructor owns this course
    conn = connect_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT CourseID FROM Courses WHERE CourseID = %s AND InstructorID = %s",
                (course_id, instructor_id)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=403, detail="Not authorized to modify this course")
            
            # Verify lecture belongs to this course
            cursor.execute(
                "SELECT LectureID FROM Lectures WHERE LectureID = %s AND CourseID = %s",
                (lecture_id, course_id)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Lecture not found or doesn't belong to this course")
    finally:
        conn.close()
    
    # Generate S3 key for the video
    key = get_lecture_video_key(course_id, lecture_id)
    
    # Log upload initialization
    logger.info(f"Initializing upload for course {course_id}, lecture {lecture_id}, size: {file_size}, parts: {parts}")
    
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
        
        # Generate presigned URLs for each part
        presigned_urls = {}
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
        
        # Store upload info in memory
        expires_at = datetime.now() + timedelta(hours=24)
        active_uploads[upload_id] = {
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

# 2. Upload part status update
@router.post("/upload/upload-part")
async def upload_part_status(
    request: Request,
    upload_id: str = Form(...),
    part_number: int = Form(...),
    etag: str = Form(...),
    auth_token: Optional[str] = None
):
    # Verify instructor permissions
    instructor_id = await verify_instructor(request, auth_token)
    
    # Verify upload exists and belongs to this instructor
    if upload_id not in active_uploads:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    upload_info = active_uploads[upload_id]
    if upload_info['instructor_id'] != instructor_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this upload")
    
    # Check if upload is still valid
    if upload_info['expires_at'] < datetime.now():
        raise HTTPException(status_code=400, detail="Upload expired")
    
    # Add part info
    upload_info['parts'].append({
        'ETag': etag,
        'PartNumber': part_number
    })
    
    upload_info['parts_received'] += 1
    
    # Log progress
    logger.info(f"Upload {upload_id}: Part {part_number} received. Progress: {upload_info['parts_received']}/{upload_info['parts_expected']}")
    
    return JSONResponse({
        'upload_id': upload_id,
        'part_number': part_number,
        'parts_received': upload_info['parts_received'],
        'parts_expected': upload_info['parts_expected'],
        'progress': f"{int((upload_info['parts_received'] / upload_info['parts_expected']) * 100)}%"
    })

# 3. Complete multipart upload
@router.post("/upload/complete-upload")
async def complete_upload(
    request: Request,
    upload_id: str = Form(...),
    auth_token: Optional[str] = None
):
    # Verify instructor permissions
    instructor_id = await verify_instructor(request, auth_token)
    
    # Verify upload exists and belongs to this instructor
    if upload_id not in active_uploads:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    upload_info = active_uploads[upload_id]
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
        
        # Clean up the upload from memory
        course_id = upload_info['course_id']
        lecture_id = upload_info['lecture_id']
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

# 4. Abort multipart upload
@router.post("/upload/abort-upload")
async def abort_upload(
    request: Request,
    upload_id: str = Form(...),
    auth_token: Optional[str] = None
):
    # Verify instructor permissions
    instructor_id = await verify_instructor(request, auth_token)
    
    # Verify upload exists and belongs to this instructor
    if upload_id not in active_uploads:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    upload_info = active_uploads[upload_id]
    if upload_info['instructor_id'] != instructor_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this upload")
    
    try:
        # Abort multipart upload
        s3.abort_multipart_upload(
            Bucket=BUCKET_NAME,
            Key=upload_info['key'],
            UploadId=upload_id
        )
        
        # Clean up
        course_id = upload_info['course_id']
        lecture_id = upload_info['lecture_id']
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

# 5. Get upload status
@router.get("/upload/status/{upload_id}")
async def get_upload_status(
    request: Request,
    upload_id: str,
    auth_token: Optional[str] = None
):
    # Verify instructor permissions
    instructor_id = await verify_instructor(request, auth_token)
    
    # Verify upload exists and belongs to this instructor
    if upload_id not in active_uploads:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    upload_info = active_uploads[upload_id]
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

# 6. List active uploads
@router.get("/upload/active-uploads")
async def list_active_uploads(
    request: Request,
    auth_token: Optional[str] = None
):
    # Verify instructor permissions
    instructor_id = await verify_instructor(request, auth_token)
    
    # Filter uploads for this instructor
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

# Clean up expired uploads
@router.post("/upload/cleanup")
async def cleanup_uploads(
    request: Request,
    auth_token: Optional[str] = None
):
    # Verify instructor permissions
    instructor_id = await verify_instructor(request, auth_token)
    
    # Only allow system admin to perform cleanup
    if instructor_id != 1:  # Assuming instructor ID 1 is the admin
        raise HTTPException(status_code=403, detail="Only system admin can perform this operation")
    
    now = datetime.now()
    expired_uploads = []
    
    for upload_id, info in list(active_uploads.items()):
        if info['expires_at'] < now:
            try:
                # Abort the upload in S3
                s3.abort_multipart_upload(
                    Bucket=BUCKET_NAME,
                    Key=info['key'],
                    UploadId=upload_id
                )
            except Exception as e:
                logger.error(f"Error aborting expired upload {upload_id}: {str(e)}")
            
            # Remove from active uploads
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
        for upload_id, info in list(active_uploads.items()):
            if info['expires_at'] < now:
                try:
                    # Abort the upload in S3
                    s3.abort_multipart_upload(
                        Bucket=BUCKET_NAME,
                        Key=info['key'],
                        UploadId=upload_id
                    )
                    logger.info(f"Automatically cleaned up expired upload {upload_id}")
                except Exception as e:
                    logger.error(f"Error cleaning up expired upload {upload_id}: {str(e)}")
                
                # Remove from active uploads
                del active_uploads[upload_id]
        
        # Wait for 1 hour before next cleanup
        await asyncio.sleep(3600)

# Start the background cleanup task when the module is imported
@router.on_event("startup")
async def start_background_tasks():
    asyncio.create_task(background_cleanup())
