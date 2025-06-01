from fastapi import APIRouter, Depends, HTTPException, Request, Cookie, UploadFile, File, Form
from typing import List, Optional, Dict, Any, Callable
from pydantic import BaseModel, Field
from services.api.db.token_utils import decode_token
from dotenv import load_dotenv
import os
import pymysql
import pandas as pd
import boto3
import json
import threading
import asyncio
from botocore.exceptions import ClientError
from datetime import datetime
from fastapi.middleware.cors import CORSMiddleware
from services.utils.cache_utils import cache_data, cache_with_fallback, clear_cache
from services.config.valkey_config import get_redis_client
from services.utils.api_cache import get_cached_data, invalidate_cache, invalidate_cache_pattern

# Get Valkey client
redis_client = get_redis_client()

# Load environment variables
load_dotenv()
MYSQL_USER = os.getenv("MYSQL_USER")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD")
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_DB = os.getenv("MYSQL_DB")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
SSL = {
    "ca": os.path.join(os.path.dirname(__file__), "ca.pem")
}

# AWS Configuration
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
REGION = os.getenv("REGION_NAME", "ap-southeast-1")

# Initialize S3 client
s3 = boto3.client('s3',
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=REGION
)

router = APIRouter(
    tags=["courses"],
    responses={404: {"description": "Not found"}},
)

# Simple test endpoint to verify routing
@router.post("/test")
async def test_post():
    return {"message": "POST test endpoint works"}

def connect_db():
    try:
        print(f"Connecting to database {MYSQL_DB} on {MYSQL_HOST}:{MYSQL_PORT}")
        connection = pymysql.connect(
            host=MYSQL_HOST,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DB,
            port=MYSQL_PORT,
            ssl=False
        )
        print("Database connection successful")
        return connection
    except Exception as e:
        print(f"Database connection error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")

# Models
class Course(BaseModel):
    id: int
    name: str
    instructor: str
    description: Optional[str]
    rating: Optional[float] = None
    enrolled: Optional[int] = 0

class QuestionOption(BaseModel):
    text: str
    isCorrect: bool = False

class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correctAnswer: int

class Quiz(BaseModel):
    title: str
    description: Optional[str] = None
    questions: Dict[str, QuizQuestion]

class LectureListItem(BaseModel):
    id: int
    title: str
    courseId: int
    description: Optional[str] = None

class Lecture(BaseModel):
    id: int
    courseId: int
    title: str
    description: Optional[str] = None
    content: Optional[str] = None
    videoUrl: Optional[str] = None
    quiz: Optional[Quiz] = None
    
class LectureDetails(Lecture):
    courseName: Optional[str] = None
    courseDescription: Optional[str] = None
    courseLectures: Optional[List[LectureListItem]] = None

# Add the missing CourseDetails model
class CourseDetails(BaseModel):
    id: int
    name: str
    description: Optional[str]
    duration: Optional[str]
    skills: Optional[List[str]] = []
    difficulty: Optional[str]
    instructor: str
    instructor_id: Optional[int]
    enrolled: Optional[int] = 0
    rating: Optional[float] = None
    is_enrolled: Optional[bool] = False

# Optimized /courses endpoint
@router.get("/courses", response_model=List[Course])
async def get_courses(request: Request, auth_token: str = Cookie(None)):
    try:
        # Authentication (keep existing code)
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
        
        # Better cache key with shorter TTL for faster updates
        cache_key = "courses:public:v2"
        
        # Optimized database fetch function
        async def fetch_courses_from_db():
            conn = connect_db()
            try:
                with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                    # Single optimized query with JOINs instead of N+1 queries
                    query = """
                    SELECT 
                        c.CourseID as id, 
                        c.CourseName as name, 
                        CONCAT(i.InstructorName, ' (', i.AccountName, ')') as instructor,
                        c.Descriptions as description,
                        COALESCE(enrollment_stats.enrolled, 0) as enrolled,
                        COALESCE(rating_stats.avg_rating, NULL) as rating
                    FROM Courses c
                    JOIN Instructors i ON c.InstructorID = i.InstructorID
                    LEFT JOIN (
                        SELECT 
                            CourseID, 
                            COUNT(*) as enrolled
                        FROM Enrollments 
                        GROUP BY CourseID
                    ) enrollment_stats ON c.CourseID = enrollment_stats.CourseID
                    LEFT JOIN (
                        SELECT 
                            CourseID, 
                            AVG(Rating) as avg_rating
                        FROM Enrollments 
                        WHERE Rating IS NOT NULL 
                        GROUP BY CourseID
                    ) rating_stats ON c.CourseID = rating_stats.CourseID
                    ORDER BY c.CourseID DESC
                    LIMIT 50
                    """
                    
                    cursor.execute(query)
                    courses = cursor.fetchall()
                    
                    # Format the data efficiently
                    formatted_courses = []
                    for course in courses:
                        formatted_courses.append({
                            'id': course['id'],
                            'name': course['name'],
                            'instructor': course['instructor'],
                            'description': course['description'],
                            'enrolled': course['enrolled'],
                            'rating': float(course['rating']) if course['rating'] else None
                        })
                    
                    return formatted_courses
            finally:
                conn.close()
        
        # Use optimized caching with compression and shorter TTL
        return await get_cached_data(
            cache_key, 
            fetch_courses_from_db, 
            ttl=900,  # 15 minutes instead of 1 hour for faster updates
            use_compression=True  # Enable compression for faster transfer
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get course details
# Optimize the course details endpoint with caching
@router.get("/courses/{course_id}", response_model=CourseDetails)
async def get_course_details(course_id: int, request: Request, auth_token: str = Cookie(None)):
    try:
        # Authentication
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
        
        if not auth_token:
            raise HTTPException(status_code=401, detail="No authentication token provided")
        
        try:
            user_data = decode_token(auth_token)
            user_id = user_data.get('user_id')
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Cache key for course details
        cache_key = f"course:details:{course_id}:user:{user_id}"
        
        # Optimized database fetch function
        async def fetch_course_details_from_db():
            conn = connect_db()
            try:
                with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                    # Single query with all course info, enrollment status, and user's enrollment
                    query = """
                    SELECT 
                        c.CourseID as id,
                        c.CourseName as name,
                        c.Descriptions as description,
                        c.EstimatedDuration as duration,
                        c.Skills as skills,
                        c.Difficulty as difficulty,
                        CONCAT(i.InstructorName, ' (', i.AccountName, ')') as instructor,
                        i.InstructorID as instructor_id,
                        COALESCE(enrollment_stats.enrolled, 0) as enrolled,
                        COALESCE(rating_stats.avg_rating, NULL) as rating,
                        CASE WHEN user_enrollment.LearnerID IS NOT NULL THEN TRUE ELSE FALSE END as is_enrolled
                    FROM Courses c
                    JOIN Instructors i ON c.InstructorID = i.InstructorID
                    LEFT JOIN (
                        SELECT CourseID, COUNT(*) as enrolled
                        FROM Enrollments 
                        GROUP BY CourseID
                    ) enrollment_stats ON c.CourseID = enrollment_stats.CourseID
                    LEFT JOIN (
                        SELECT CourseID, AVG(Rating) as avg_rating
                        FROM Enrollments 
                        WHERE Rating IS NOT NULL 
                        GROUP BY CourseID
                    ) rating_stats ON c.CourseID = rating_stats.CourseID
                    LEFT JOIN (
                        SELECT CourseID, LearnerID
                        FROM Enrollments e2
                        JOIN Learners l ON e2.LearnerID = l.LearnerID
                        WHERE l.LearnerID = %s
                    ) user_enrollment ON c.CourseID = user_enrollment.CourseID
                    WHERE c.CourseID = %s
                    """
                    
                    cursor.execute(query, (user_id, course_id))
                    course = cursor.fetchone()
                    
                    if not course:
                        raise HTTPException(status_code=404, detail="Course not found")
                    
                    # Format skills if it's JSON
                    skills = []
                    if course['skills']:
                        try:
                            skills = json.loads(course['skills'])
                        except:
                            skills = []
                    
                    return {
                        'id': course['id'],
                        'name': course['name'],
                        'description': course['description'],
                        'duration': course['duration'],
                        'skills': skills,
                        'difficulty': course['difficulty'],
                        'instructor': course['instructor'],
                        'instructor_id': course['instructor_id'],
                        'enrolled': course['enrolled'],
                        'rating': float(course['rating']) if course['rating'] else None,
                        'is_enrolled': course['is_enrolled']
                    }
            finally:
                conn.close()
        
        # Use caching with 30 minutes TTL
        return await get_cached_data(
            cache_key,
            fetch_course_details_from_db,
            ttl=1800,  # 30 minutes
            use_compression=True
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_course_details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get lectures for a course
@router.get("/courses/{course_id}/lectures", response_model=List[Lecture])
async def get_course_lectures(request: Request, course_id: int, auth_token: str = Cookie(None)):
    try:
        # Try to get token from Authorization header if cookie is not present
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
        
        # Create cache key using course ID and user ID
        cache_key = f"courses:id:{course_id}:lectures:user:{user_data.get('user_id', 'anonymous')}"
        
        # Define database fetch function
        async def fetch_lectures_from_db():
            conn = connect_db()
            lectures = []
            
            try:
                with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                    # First verify the course exists
                    cursor.execute("SELECT CourseID FROM Courses WHERE CourseID = %s", (course_id,))
                    if not cursor.fetchone():
                        raise HTTPException(status_code=404, detail="Course not found")

                    query = """
                    SELECT 
                        LectureID as id, 
                        CourseID as courseId,
                        Title as title, 
                        Description as description
                    FROM Lectures
                    WHERE CourseID = %s
                    ORDER BY LectureID
                    """
                    cursor.execute(query, (course_id,))
                    lectures = cursor.fetchall()
                    
                    # Ensure all fields match the Lecture model
                    for lecture in lectures:
                        # Ensure the fields exist and have appropriate null values if missing
                        if lecture.get('description') is None:
                            lecture['description'] = None
            finally:
                conn.close()
                
            return lectures
            
        # Use cached data helper
        return await get_cached_data(cache_key, fetch_lectures_from_db, ttl=3600)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_course_lectures: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get lecture details
@router.get("/lectures/{lecture_id}", response_model=LectureDetails)
async def get_lecture_details(request: Request, lecture_id: int, auth_token: str = Cookie(None)):
    try:
        # Try to get token from Authorization header if cookie is not present
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
        
        if not auth_token:
            raise HTTPException(status_code=401, detail="No authentication token provided")
            
        # Verify user is authenticated
        try:
            user_data = decode_token(auth_token)
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Create cache key using lecture ID and user ID
        cache_key = f"lectures:id:{lecture_id}:user:{user_data.get('user_id', 'anonymous')}"
        
        # Define database fetch function
        async def fetch_lecture_from_db():
            conn = connect_db()
            cursor = None
            try:
                cursor = conn.cursor(pymysql.cursors.DictCursor)
                # Get lecture details with course data
                query = """
                SELECT 
                    l.LectureID as id,
                    l.CourseID as courseId,
                    l.Title as title,
                    l.Description as description,
                    l.Content as content,
                    c.CourseName as courseName,
                    c.CourseID,
                    c.Descriptions as courseDescription
                FROM Lectures l
                JOIN Courses c ON l.CourseID = c.CourseID
                WHERE l.LectureID = %s
                """
                cursor.execute(query, (lecture_id,))
                lecture = cursor.fetchone()
                
                if not lecture:
                    raise HTTPException(status_code=404, detail="Lecture not found")
            
                # Get course lectures
                cursor.execute("""
                SELECT 
                    LectureID as id,
                    CourseID as courseId,
                    Title as title,
                    Description as description
                FROM Lectures
                WHERE CourseID = %s
                ORDER BY LectureID
                """, (lecture['courseId'],))
                
                course_lectures = cursor.fetchall()
                if not course_lectures:
                    course_lectures = []

                response_data = {
                    "id": lecture['id'],
                    "courseId": lecture['courseId'],
                    "title": lecture['title'],
                    "description": lecture['description'],
                    "content": lecture['content'],
                    "courseName": lecture['courseName'],
                    "courseDescription": lecture['courseDescription'],
                    "courseLectures": course_lectures,
                    "videoUrl": None,
                    "quiz": None  # Initialize quiz as None
                }

                # Get video URL if exists
                video_path = f"videos/cid{lecture['courseId']}/lid{lecture['id']}/vid_lecture.mp4"
                try:
                    s3.head_object(Bucket="tlhmaterials", Key=video_path)
                    response_data['videoUrl'] = f"https://tlhmaterials.s3-{REGION}.amazonaws.com/{video_path}"
                except:
                    pass  # Keep videoUrl as None if no video exists

                # Get quiz if exists - fixing this part
                cursor.execute("""
                SELECT q.QuizID, q.Title, q.Description
                FROM Quizzes q
                WHERE q.LectureID = %s
                """, (lecture_id,))
                
                quiz_data = cursor.fetchone()
                if quiz_data:
                    quiz = {
                        "id": quiz_data['QuizID'],
                        "title": quiz_data['Title'],
                        "description": quiz_data['Description'],
                        "questions": {}
                    }
                    
                    # Get quiz questions
                    cursor.execute("""
                    SELECT 
                        q.QuestionID, 
                        q.QuestionText,
                        o.OptionID,
                        o.OptionText,
                        o.IsCorrect
                    FROM Questions q
                    JOIN Options o ON q.QuestionID = o.QuestionID
                    WHERE q.QuizID = %s
                    ORDER BY q.QuestionID, o.OptionID
                    """, (quiz_data['QuizID'],))
                    
                    questions_data = cursor.fetchall()
                    current_question_id = None
                    current_options = []
                    correct_option_index = 0
                    
                    for row in questions_data:
                        if current_question_id != row['QuestionID']:
                            # Save previous question data
                            if current_question_id is not None:
                                quiz['questions'][str(current_question_id)] = {
                                    'question': question_text,
                                    'options': current_options,
                                    'correctAnswer': correct_option_index
                                }
                            
                            # Start new question
                            current_question_id = row['QuestionID']
                            question_text = row['QuestionText']
                            current_options = []
                            correct_option_index = 0
                        
                        current_options.append(row['OptionText'])
                        if row['IsCorrect']:
                            correct_option_index = len(current_options) - 1
                    
                    # Save the last question
                    if current_question_id is not None:
                        quiz['questions'][str(current_question_id)] = {
                            'question': question_text,
                            'options': current_options,
                            'correctAnswer': correct_option_index
                        }
                    
                    response_data['quiz'] = quiz
                
                return response_data
            finally:
                if cursor:
                    cursor.close()
                if conn:
                    conn.close()
        
        # Use the caching mechanism to get the data
        return await get_cached_data(
            cache_key,
            fetch_lecture_from_db,
            ttl=3600,  # Cache for 1 hour
            use_compression=True  # Enable compression for large response
        )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_lecture_details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get instructor's courses with proper caching
@router.get("/instructor/courses", response_model=List[Course])
async def get_instructor_courses(
    request: Request,
    auth_token: str = Cookie(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        # Verify token and get user data
        user_data = decode_token(auth_token)
        username = user_data['username']
        role = user_data['role']
        instructor_id = user_data.get('user_id')
        
        # Verify user is an instructor
        if role != "Instructor":
            raise HTTPException(status_code=403, detail="Only instructors can access this endpoint")
        
        # Create a cache key for instructor courses
        cache_key = f"instructor:courses:{instructor_id or username}"
        
        # Define database fetch function
        async def fetch_instructor_courses_from_db():
            conn = connect_db()
            try:
                with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                    # Get instructor ID from token or fallback to database lookup
                    current_instructor_id = instructor_id
                    if not current_instructor_id:
                        # Fallback for old tokens without user_id
                        cursor.execute("""
                            SELECT InstructorID 
                            FROM Instructors 
                            WHERE AccountName = %s
                        """, (username,))
                        
                        instructor = cursor.fetchone()
                        if not instructor:
                            raise HTTPException(status_code=404, detail="Instructor not found")
                        
                        current_instructor_id = instructor['InstructorID']
                    
                    # Get courses by this instructor
                    query = """
                        SELECT 
                            c.CourseID as id, 
                            c.CourseName as name, 
                            CONCAT(i.InstructorName, ' (', i.AccountName, ')') as instructor,
                            c.Descriptions as description,
                            (SELECT COUNT(*) FROM Enrollments WHERE CourseID = c.CourseID) as enrolled,
                            COALESCE(
                                (SELECT AVG(Rating) 
                                 FROM Enrollments 
                                 WHERE CourseID = c.CourseID AND Rating IS NOT NULL),
                                0
                            ) as rating
                        FROM Courses c
                        JOIN Instructors i ON c.InstructorID = i.InstructorID
                        WHERE c.InstructorID = %s
                        ORDER BY c.CourseID DESC
                    """
                    
                    cursor.execute(query, (current_instructor_id,))
                    courses = cursor.fetchall()
                    
                    # Format the courses data
                    formatted_courses = []
                    for course in courses:
                        formatted_course = {
                            'id': course['id'],
                            'name': course['name'],
                            'instructor': course['instructor'],
                            'description': course['description'],
                            'enrolled': course['enrolled'],
                            'rating': float(course['rating']) if course['rating'] else None
                        }
                        formatted_courses.append(formatted_course)
                    
                    return formatted_courses
            finally:
                conn.close()
        
        # Use the caching mechanism to get the data
        return await get_cached_data(
            cache_key,
            fetch_instructor_courses_from_db,
            ttl=1800,  # Cache for 30 minutes
            use_compression=True  # Enable compression for large response
        )
            
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching instructor courses: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Create a new course
class CourseCreate(BaseModel):
    name: str
    description: str
    skills: List[str]
    difficulty: str
    duration: Optional[int] = None

@router.post("/instructor/courses", response_model=Course)
async def create_course(
    course_data: CourseCreate,
    request: Request,
    auth_token: str = Cookie(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        # Verify token and get user data
        try:
            user_data = decode_token(auth_token)
            username = user_data['username']
            role = user_data['role']
            instructor_id = user_data.get('user_id')
            
            # Log debugging information
            print(f"POST /instructor/courses - User: {username}, Role: {role}, InstructorID: {instructor_id}")
            print(f"Course data: {course_data}")
            
            # Verify user is an instructor
            if role != "Instructor":
                raise HTTPException(status_code=403, detail="Only instructors can create courses")
            
            # Connect to database
            conn = connect_db()
            
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                # Get instructor ID from token or fallback to database lookup
                if not instructor_id:
                    # Fallback for old tokens without user_id
                    cursor.execute("""
                        SELECT InstructorID 
                        FROM Instructors 
                        WHERE AccountName = %s
                    """, (username,))
                    
                    instructor = cursor.fetchone()
                    if not instructor:
                        raise HTTPException(status_code=404, detail="Instructor not found")
                    
                    instructor_id = instructor['InstructorID']
                
                # Insert new course
                cursor.execute("""
                    INSERT INTO Courses 
                    (CourseName, Descriptions, Skills, Difficulty, EstimatedDuration, InstructorID) 
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    course_data.name, 
                    course_data.description, 
                    json.dumps(course_data.skills), 
                    course_data.difficulty, 
                    course_data.duration or "Self-paced", 
                    instructor_id
                ))
                
                # Get the created course ID
                course_id = cursor.lastrowid
                conn.commit()
                
                # Return the created course
                cursor.execute("""
                    SELECT 
                        c.CourseID as id, 
                        c.CourseName as name, 
                        CONCAT(i.InstructorName, ' (', i.AccountName, ')') as instructor,
                        c.Descriptions as description,
                        0 as enrolled,
                        NULL as rating
                    FROM Courses c
                    JOIN Instructors i ON c.InstructorID = i.InstructorID
                    WHERE c.CourseID = %s
                """, (course_id,))
                
                new_course = cursor.fetchone()
                if not new_course:
                    raise HTTPException(status_code=500, detail="Course was created but couldn't be retrieved")
                
                # Invalidate Valkey cache for all courses and instructor-specific cache
                pattern_all = "courses:all"
                pattern_instructor = f"instructor:courses:{instructor_id or username}"
                pattern_course_details = f"courses:id"  # Invalidate specific course details too
                print(f"Invalidating cache patterns: {pattern_all}, {pattern_instructor}, and {pattern_course_details}")
                invalidate_cache_pattern(pattern_all)
                invalidate_cache_pattern(pattern_course_details)
                invalidate_cache([pattern_instructor])
                
                return new_course
                
        except Exception as e:
            if 'conn' in locals():
                conn.rollback()
            print(f"Database error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error creating course: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

# Enroll in a course
@router.post("/courses/{course_id}/enroll")
async def enroll_in_course(
    course_id: int,
    request: Request,
    auth_token: str = Cookie(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        # Verify token and get user data
        try:
            user_data = decode_token(auth_token)
            learner_id = user_data.get('user_id')
            
            if not learner_id:
                # Fallback for old tokens without user_id - do database lookup
                conn = connect_db()
                with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                    cursor.execute("""
                        SELECT LearnerID 
                        FROM Learners 
                        WHERE AccountName = %s
                    """, (user_data['username'],))
                    learner = cursor.fetchone()
                    if not learner:
                        raise HTTPException(status_code=404, detail="Learner not found")
                    learner_id = learner['LearnerID']
            else:
                # Use user_id from token
                conn = connect_db()
        except Exception as e:
            print(f"Token/user verification error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token or user not found")

        # Check if the course exists
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("""
                SELECT CourseID 
                FROM Courses 
                WHERE CourseID = %s
            """, (course_id,))
            course = cursor.fetchone()
            if not course:
                raise HTTPException(status_code=404, detail="Course not found")
            
            # Check if already enrolled
            cursor.execute("""
                SELECT EnrollmentID 
                FROM Enrollments 
                WHERE LearnerID = %s AND CourseID = %s
            """, (learner_id, course_id))
            existing_enrollment = cursor.fetchone()
            if existing_enrollment:
                return {"message": "Already enrolled in this course"}
            
            # Get the actual column names from the Enrollments table
            cursor.execute("DESCRIBE Enrollments")
            columns = cursor.fetchall()
            column_names = [col['Field'] for col in columns]
            print(f"Available columns in Enrollments table: {column_names}")
            
            # Enroll the learner in the course with the correct date column
            try:
                # Try different common column names for the enrollment date
                enroll_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                cursor.execute(
                    "CALL sp_EnrollLearner(%s, %s, %s)",
                    (learner_id, course_id, enroll_date)
                )
                
                conn.commit()
                
                # Invalidate Valkey cache for this course and user-specific data
                redis_client = get_redis_client()
                # Clear specific course cache for all users
                pattern_course = f"courses:id:{course_id}:*"
                # Clear course preview cache for all users (this is the missing piece!)
                pattern_preview = f"course:preview:{course_id}:*"
                # Clear user-specific enrolled courses cache
                pattern_user_courses = f"learner:courses:{learner_id}"
                print(f"Invalidating cache patterns: {pattern_course}, {pattern_preview}, and {pattern_user_courses}")
                invalidate_cache_pattern(pattern_course)
                invalidate_cache_pattern(pattern_preview)
                invalidate_cache([pattern_user_courses])
                
                return {"message": "Successfully enrolled in the course"}
            except Exception as e:
                conn.rollback()
                print(f"Error enrolling in course: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to enroll in course: {str(e)}")
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error enrolling in course: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error enrolling in course: {str(e)}")
    finally:
        if 'conn' in locals():
            conn.close()

# Get enrolled courses for the current learner
@router.get("/learner/courses", response_model=List[Course])
async def get_enrolled_courses(
    request: Request,
    auth_token: str = Cookie(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        # Verify token and get user data
        try:
            user_data = decode_token(auth_token)
            learner_id = user_data.get('user_id')
            
            if not learner_id:
                # Fallback for old tokens without user_id - do database lookup
                conn = connect_db()
                with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                    cursor.execute("""
                        SELECT LearnerID 
                        FROM Learners 
                        WHERE AccountName = %s
                    """, (user_data['username'],))
                    learner = cursor.fetchone()
                    if not learner:
                        raise HTTPException(status_code=404, detail="Learner not found")
                    learner_id = learner['LearnerID']
            else:
                # Use user_id from token
                conn = connect_db()
        except Exception as e:
            print(f"Token/user verification error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token or user not found")

        # Get enrolled courses
        courses = []
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            query = """
                SELECT 
                    c.CourseID as id, 
                    c.CourseName as name, 
                    CONCAT(i.InstructorName, ' (', i.AccountName, ')') as instructor,
                    c.Descriptions as description
                FROM Courses c
                JOIN Instructors i ON c.InstructorID = i.InstructorID
                JOIN Enrollments e ON c.CourseID = e.CourseID
                WHERE e.LearnerID = %s
            """
            cursor.execute(query, (learner_id,))
            courses = cursor.fetchall()
            
            # Get ratings and enrollment count for each course
            for course in courses:
                cursor.execute("""
                    SELECT AVG(Rating) as avg_rating, COUNT(*) as count
                    FROM Enrollments
                    WHERE CourseID = %s AND Rating IS NOT NULL
                """, (course['id'],))
                
                rating_data = cursor.fetchone()
                if rating_data and rating_data['avg_rating']:
                    course['rating'] = float(rating_data['avg_rating'])
                else:
                    course['rating'] = None
                    
                # Get enrollment count
                cursor.execute("""
                    SELECT COUNT(*) as enrolled
                    FROM Enrollments
                    WHERE CourseID = %s
                """, (course['id'],))
                
                enrolled_data = cursor.fetchone()
                if enrolled_data:
                    course['enrolled'] = enrolled_data['enrolled']
                else:
                    course['enrolled'] = 0
        
        return courses
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching enrolled courses: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching enrolled courses: {str(e)}")
    finally:
        if 'conn' in locals():
            conn.close()

# Get user profile
@router.get("/user/profile")
async def get_user_profile(
    request: Request,
    auth_token: str = Cookie(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        # Verify token and get user data
        try:
            user_data = decode_token(auth_token)
            username = user_data['username']
            role = user_data['role']
            
            # Create a unique cache key for this user's profile
            cache_key = f"user:profile:{username}:{role}"
            
            # Define the database fetch function
            async def fetch_profile_from_db():
                # Connect to database
                conn = connect_db()
                try:
                    # Get user information based on role
                    with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                        if role == "Learner":
                            cursor.execute("""
                                SELECT 
                                    LearnerName as name,
                                    Email as email,
                                    PhoneNumber as phoneNumber
                                FROM Learners
                                WHERE AccountName = %s
                            """, (username,))
                            user_info = cursor.fetchone()
                            
                            if not user_info:
                                raise HTTPException(status_code=404, detail="Learner not found")
                                
                        elif role == "Instructor":
                            cursor.execute("""
                                SELECT 
                                    InstructorName as name,
                                    Email as email,
                                    Expertise as expertise
                                FROM Instructors
                                WHERE AccountName = %s
                            """, (username,))
                            user_info = cursor.fetchone()
                            
                            if not user_info:
                                raise HTTPException(status_code=404, detail="Instructor not found")
                        else:
                            raise HTTPException(status_code=403, detail="Invalid user role")
                        
                        # Add role and username to the response
                        user_info['role'] = role
                        user_info['username'] = username
                        
                        return user_info
                finally:
                    if 'conn' in locals():
                        conn.close()
                
            # Use the cached data helper to implement the Valkey caching pattern
            return await get_cached_data(cache_key, fetch_profile_from_db, ttl=1800)  # 30 minutes TTL
                
        except Exception as e:
            print(f"Token/user verification error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token or user not found")
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching user profile: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching user profile: {str(e)}")
    finally:
        pass  # Connection is closed in the fetch function

# Update user profile
@router.put("/user/profile")
async def update_user_profile(
    request: Request,
    auth_token: str = Cookie(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        # Verify token and get user data
        try:
            user_data = decode_token(auth_token)
            username = user_data['username']
            role = user_data['role']
            
            # Get request body
            profile_data = await request.json()
            
            # Connect to database
            conn = connect_db()
            
            # Update user information based on role
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                if role == "Learner":
                    # Prepare update fields
                    update_fields = []
                    params = []
                    
                    if 'name' in profile_data:
                        update_fields.append("LearnerName = %s")
                        params.append(profile_data['name'])
                    
                    if 'email' in profile_data:
                        update_fields.append("Email = %s")
                        params.append(profile_data['email'])
                    
                    if 'phoneNumber' in profile_data:
                        update_fields.append("PhoneNumber = %s")
                        params.append(profile_data['phoneNumber'])
                    
                    if not update_fields:
                        return {"message": "No fields to update"}
                    
                    # Add username to params
                    params.append(username)
                    
                    # Construct and execute SQL
                    sql = f"""
                        UPDATE Learners
                        SET {', '.join(update_fields)}
                        WHERE AccountName = %s
                    """
                    cursor.execute(sql, params)
                    
                elif role == "Instructor":
                    # Prepare update fields
                    update_fields = []
                    params = []
                    
                    if 'name' in profile_data:
                        update_fields.append("InstructorName = %s")
                        params.append(profile_data['name'])
                    
                    if 'email' in profile_data:
                        update_fields.append("Email = %s")
                        params.append(profile_data['email'])
                    
                    if 'expertise' in profile_data:
                        update_fields.append("Expertise = %s")
                        params.append(profile_data['expertise'])
                    
                    if not update_fields:
                        return {"message": "No fields to update"}
                    
                    # Add username to params
                    params.append(username)
                    
                    # Construct and execute SQL
                    sql = f"""
                        UPDATE Instructors
                        SET {', '.join(update_fields)}
                        WHERE AccountName = %s
                    """
                    cursor.execute(sql, params)
                    
                else:
                    raise HTTPException(status_code=403, detail="Invalid user role")
                
                conn.commit()
                return {"message": "Profile updated successfully"}
                
        except Exception as e:
            print(f"Token/user verification error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token or user not found")
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error updating user profile: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating user profile: {str(e)}")
    finally:
        if 'conn' in locals():
            conn.close()

# Get dashboard data for the current user
@router.get("/learner/dashboard")
async def get_learner_dashboard(
    request: Request,
    auth_token: str = Cookie(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        # Verify token and get user data
        try:
            user_data = decode_token(auth_token)
            
            # Get LearnerID from Learners table using the username
            conn = connect_db()
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute("""
                    SELECT LearnerID, LearnerName 
                    FROM Learners 
                    WHERE AccountName = %s
                """, (user_data['username'],))
                learner = cursor.fetchone()
                if not learner:
                    raise HTTPException(status_code=404, detail="Learner not found")
                learner_id = learner['LearnerID']
                learner_name = learner['LearnerName']
        except Exception as e:
            print(f"Token/user verification error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token or user not found")

        # Calculate dashboard metrics
        dashboard_data = {
            "learnerName": learner_name,
            "enrolled": 0,
            "completed": 0,
            "completionRate": "0%",
            "lecturesPassed": 0,
            "statistics": {
                "lecturesPassed": [],
                "averageScores": []
            },
            "enrolledCourses": []
        }
        
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            # Get enrollment count
            cursor.execute("SELECT COUNT(*) as count FROM Enrollments WHERE LearnerID = %s", (learner_id,))
            enrolled_data = cursor.fetchone()
            dashboard_data["enrolled"] = enrolled_data['count'] if enrolled_data else 0
            
            # Get completed courses count
            cursor.execute(
                "SELECT COUNT(*) as count FROM Enrollments WHERE LearnerID = %s AND Percentage = 100",
                (learner_id,)
            )
            completed_data = cursor.fetchone()
            completed = completed_data['count'] if completed_data else 0
            dashboard_data["completed"] = completed
            
            # Calculate completion rate
            if dashboard_data["enrolled"] > 0:
                rate = (completed / dashboard_data["enrolled"]) * 100
                dashboard_data["completionRate"] = f"{rate:.1f}%"
            
            # Get passed lectures count
            cursor.execute(
                "SELECT COUNT(*) as count FROM LectureResults WHERE LearnerID = %s AND State = 'passed'",
                (learner_id,)
            )
            passed_data = cursor.fetchone()
            dashboard_data["lecturesPassed"] = passed_data['count'] if passed_data else 0
            
            # Get statistics data - passed lectures over time
            # Fix the learner dashboard query around line 1270
            cursor.execute("""
                SELECT Date, Score, 
                        DATE_FORMAT(Date, '%%Y-%%m-%%d') as formatted_date
                FROM LectureResults
                WHERE LearnerID = %s AND State = 'passed'
                ORDER BY Date
            """, (learner_id,))
            
            stats_data = cursor.fetchall()
            date_groups = {}
            score_groups = {}
            
            for row in stats_data:
                date_str = row['formatted_date']
                if date_str not in date_groups:
                    date_groups[date_str] = 0
                date_groups[date_str] += 1
                
                if date_str not in score_groups:
                    score_groups[date_str] = {"total": 0, "count": 0}
                score_groups[date_str]["total"] += row['Score']
                score_groups[date_str]["count"] += 1
            
            # Format the statistics data
            for date_str in date_groups:
                dashboard_data["statistics"]["lecturesPassed"].append({
                    "date": date_str,
                    "count": date_groups[date_str]
                })
                
                avg_score = score_groups[date_str]["total"] / score_groups[date_str]["count"]
                dashboard_data["statistics"]["averageScores"].append({
                    "date": date_str,
                    "score": round(avg_score, 2)
                })
            
            # Get enrolled courses with percentage
            cursor.execute("""
                SELECT
                    c.CourseID as id, 
                    c.CourseName as name, 
                    CONCAT(i.InstructorName, ' (', i.AccountName, ')') as instructor,
                    c.Descriptions as description,
                    e.Percentage as percentage
                FROM Courses c
                JOIN Instructors i ON c.InstructorID = i.InstructorID
                JOIN Enrollments e ON c.CourseID = e.CourseID
                WHERE e.LearnerID = %s
            """, (learner_id,))
            
            courses = cursor.fetchall()
            dashboard_data["enrolledCourses"] = courses
            
        return dashboard_data
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching dashboard data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard data: {str(e)}")
    finally:
        if 'conn' in locals():
            conn.close()

# Get dashboard data for instructor
@router.get("/instructor/dashboard")
async def get_instructor_dashboard(
    request: Request,
    course_id: Optional[int] = None,
    auth_token: str = Cookie(None)
):
    conn = None
    try:
        # 1) Auth token via cookie or header
        if not auth_token:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                auth_token = auth_header.split(" ", 1)[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")

        # 2) Decode and verify
        user_data = decode_token(auth_token)
        username = user_data.get("username")
        role = user_data.get("role")
        instructor_id = user_data.get("user_id")
        if role != "Instructor":
            raise HTTPException(status_code=403, detail="Only instructors can access this endpoint")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        # 3) DB connection
        conn = connect_db()
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:

            # Fallback for old tokens without user_id
            if not instructor_id:
                cursor.execute(
                    "SELECT InstructorID FROM Instructors WHERE AccountName = %s",
                    (username,)
                )
                row = cursor.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Instructor not found")
                instructor_id = row["InstructorID"]

            # --- General metrics ---
            cursor.execute("""
                SELECT COUNT(*) AS total_courses
                FROM Courses
                WHERE InstructorID = %s
            """, (instructor_id,))
            total_courses = cursor.fetchone()["total_courses"]

            cursor.execute("""
                SELECT
                    COUNT(DISTINCT e.LearnerID) AS total_students,
                    COALESCE(AVG(e.Rating), 0) AS average_rating,
                    COUNT(*) AS total_enrollments,
                    SUM(CASE WHEN e.Percentage = 100 THEN 1 ELSE 0 END) AS completed_enrollments
                FROM Courses c
                LEFT JOIN Enrollments e ON c.CourseID = e.CourseID
                WHERE c.InstructorID = %s
            """, (instructor_id,))
            stats = cursor.fetchone() or {}

            completion_rate = (
                round(
                    stats.get("completed_enrollments", 0)
                    / stats.get("total_enrollments", 1)
                    * 100,
                    1
                )
                if stats.get("total_enrollments") else 0.0
            )

            # --- Student growth (last 2 months) ---
            cursor.execute("""
                SELECT
                    DATE_FORMAT(EnrollmentDate, '%%Y-%%m') AS month,
                    COUNT(DISTINCT LearnerID) AS students
                FROM Courses c
                JOIN Enrollments e ON c.CourseID = e.CourseID
                WHERE c.InstructorID = %s
                  AND EnrollmentDate >= DATE_SUB(CURRENT_DATE, INTERVAL 2 MONTH)
                GROUP BY month
                ORDER BY month DESC
                LIMIT 2
            """, (instructor_id,))
            growth = cursor.fetchall()
            current = growth[0]["students"] if len(growth) > 0 else 0
            previous = growth[1]["students"] if len(growth) > 1 else 0
            student_growth = (
                round((current - previous) / previous * 100, 1)
                if previous else 0.0
            )

            # --- Course list summary ---
            cursor.execute("""
                SELECT
                    c.CourseID   AS id,
                    c.CourseName AS name,
                    c.Descriptions     AS description,
                    c.AverageRating    AS rating,
                    COUNT(DISTINCT e.LearnerID) AS enrollments,
                    AVG(e.Percentage)  AS completionRate
                FROM Courses c
                LEFT JOIN Enrollments e ON c.CourseID = e.CourseID
                WHERE c.InstructorID = %s
                GROUP BY c.CourseID
                ORDER BY c.CreatedAt DESC
            """, (instructor_id,))
            raw_courses = cursor.fetchall()
            formatted_courses = [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "description": c["description"] or "",
                    "enrollments": c["enrollments"] or 0,
                    "rating": round(float(c["rating"]), 1) if c["rating"] else 0.0,
                    "completionRate": round(float(c["completionRate"]), 1) if c["completionRate"] else 0.0
                }
                for c in raw_courses
            ]

            # --- Enrollment trends (last 30 days) ---
            cursor.execute("""
                SELECT
                    DATE_FORMAT(e.EnrollmentDate, '%%Y-%%m-%%d') AS date,
                    COUNT(*)                              AS value
                FROM Courses c
                JOIN Enrollments e ON c.CourseID = e.CourseID
                WHERE c.InstructorID = %s
                  AND e.EnrollmentDate >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
                GROUP BY date
                ORDER BY date
            """, (instructor_id,))
            enroll_trends = cursor.fetchall()

            # --- Rating trends (last 30 days) ---
            cursor.execute("""
                SELECT
                    DATE_FORMAT(e.EnrollmentDate, '%%Y-%%m-%%d') AS date,
                    AVG(e.Rating)                         AS value
                FROM Courses c
                JOIN Enrollments e ON c.CourseID = e.CourseID
                WHERE c.InstructorID = %s
                  AND e.Rating IS NOT NULL
                  AND e.EnrollmentDate >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
                GROUP BY date
                ORDER BY date
            """, (instructor_id,))
            rating_trends = cursor.fetchall()

            # --- Build base payload ---
            dashboard_data = {
                "metrics": {
                    "totalCourses": total_courses,
                    "totalStudents": stats.get("total_students", 0),
                    "averageRating": round(stats.get("average_rating", 0), 1),
                    "completionRate": completion_rate,
                    "studentGrowth": student_growth
                },
                "courses": formatted_courses,
                "enrollmentTrends": [
                    {"date": r["date"], "value": r["value"]} for r in enroll_trends
                ],
                "ratingTrends": [
                    {"date": r["date"], "value": round(r["value"], 1)}
                    for r in rating_trends if r["value"] is not None
                ],
                "courseEnrollments": [
                    {"courseName": c["name"], "enrollments": c["enrollments"]}
                    for c in formatted_courses
                ],
                "courseAnalytics": {}
            }

            # --- Detailed courseAnalytics if course_id given ---
            if course_id:
                # Ownership check
                cursor.execute("""
                    SELECT CourseID, CourseName
                    FROM Courses
                    WHERE CourseID = %s AND InstructorID = %s
                """, (course_id, instructor_id))
                course_row = cursor.fetchone()
                if not course_row:
                    raise HTTPException(status_code=404, detail="Course not found or not owned")
                course_name = course_row["CourseName"]

                # Basic course metrics
                cursor.execute("""
                    SELECT
                        COUNT(DISTINCT e.LearnerID) AS total_enrollments,
                        COALESCE(AVG(e.Rating), 0)   AS average_rating,
                        SUM(CASE WHEN e.Percentage = 100 THEN 1 ELSE 0 END) AS completed_enrollments,
                        COUNT(*) AS all_with_progress
                    FROM Enrollments e
                    WHERE e.CourseID = %s
                """, (course_id,))
                cm = cursor.fetchone() or {}
                total_enr = cm.get("total_enrollments", 0)
                total_with = cm.get("all_with_progress", 0)
                comp_rate = (
                    round(cm.get("completed_enrollments", 0) / total_with * 100, 1)
                    if total_with else 0.0
                )

                # Enroll/Ratings trends (60 days)
                cursor.execute("""
                    SELECT
                        DATE_FORMAT(EnrollmentDate, '%%Y-%%m-%%d') AS date,
                        COUNT(*)                               AS value
                    FROM Enrollments
                    WHERE CourseID = %s
                      AND EnrollmentDate >= DATE_SUB(CURRENT_DATE, INTERVAL 60 DAY)
                    GROUP BY date
                    ORDER BY date
                """, (course_id,))
                ce_trends = cursor.fetchall()

                cursor.execute("""
                    SELECT
                        DATE_FORMAT(EnrollmentDate, '%%Y-%%m-%%d') AS date,
                        AVG(Rating)                          AS value
                    FROM Enrollments
                    WHERE CourseID = %s
                      AND Rating IS NOT NULL
                      AND EnrollmentDate >= DATE_SUB(CURRENT_DATE, INTERVAL 60 DAY)
                    GROUP BY date
                    ORDER BY date
                """, (course_id,))
                cr_trends = cursor.fetchall()

                # Completion via LectureResults (30 days)
                cursor.execute("""
                    SELECT
                        DATE_FORMAT(lr.Date, '%%Y-%%m-%%d') AS date,
                        COUNT(DISTINCT CASE WHEN e.Percentage = 100 THEN e.LearnerID END) AS completed,
                        COUNT(DISTINCT lr.LearnerID)                           AS total
                    FROM LectureResults lr
                    JOIN Enrollments e
                      ON lr.LearnerID = e.LearnerID AND lr.CourseID = e.CourseID
                    WHERE lr.CourseID = %s
                      AND lr.Date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
                    GROUP BY date
                    ORDER BY date
                """, (course_id,))
                comp_rows = cursor.fetchall()
                completion_trends = [
                    {
                        "date": r["date"],
                        "value": round(r["completed"] / r["total"] * 100, 1) if r["total"] else 0.0
                    }
                    for r in comp_rows
                ]

                # Lecture-level analytics
                cursor.execute("""
                    SELECT
                        l.LectureID                           AS lectureId,
                        l.Title                               AS lecture_title,
                        COUNT(DISTINCT lr.LearnerID)         AS total_attempts,
                        SUM(lr.State = 'passed')             AS passed_count,
                        COALESCE(AVG(lr.Score), 0)           AS average_score
                    FROM Lectures l
                    LEFT JOIN LectureResults lr
                      ON l.LectureID = lr.LectureID
                    WHERE l.CourseID = %s
                    GROUP BY l.LectureID, l.Title
                    ORDER BY l.LectureID
                """, (course_id,))
                lects = cursor.fetchall()
                lecture_analytics = [
                    {
                        "lectureId": l["lectureId"],
                        "title": l["lecture_title"],
                        "totalAttempts": l["total_attempts"],
                        "passedCount": l["passed_count"],
                        "passRate": round(l["passed_count"] / l["total_attempts"] * 100, 1)
                            if l["total_attempts"] else 0.0,
                        "averageScore": round(float(l["average_score"]), 1)
                    }
                    for l in lects
                ]

                # Student progress distribution
                cursor.execute("""
                    SELECT
                        CASE
                          WHEN Percentage = 0 THEN 'Not Started'
                          WHEN Percentage < 25 THEN '0-25%%'
                          WHEN Percentage < 50 THEN '25-50%%'
                          WHEN Percentage < 75 THEN '50-75%%'
                          WHEN Percentage < 100 THEN '75-99%%'
                          ELSE 'Completed'
                        END AS progress_range,
                        COUNT(*) AS student_count
                    FROM Enrollments
                    WHERE CourseID = %s
                    GROUP BY progress_range
                    ORDER BY
                      FIELD(progress_range,
                            'Not Started','0-25%%','25-50%%',
                            '50-75%%','75-99%%','Completed')
                """, (course_id,))
                pd = cursor.fetchall()
                progress = [
                    {"range": p["progress_range"], "count": p["student_count"]}
                    for p in pd
                ]

                dashboard_data["courseAnalytics"] = {
                    "courseId": course_id,
                    "courseName": course_name,
                    "totalEnrollments": total_enr,
                    "averageRating": round(float(cm.get("average_rating", 0)), 1),
                    "completionRate": comp_rate,
                    "enrollmentTrends": [
                        {"date": r["date"], "value": int(r["value"])}
                        for r in ce_trends
                    ],
                    "ratingTrends": [
                        {"date": r["date"], "value": round(float(r["value"]), 1)}
                        for r in cr_trends if r["value"] is not None
                    ],
                    "completionTrends": completion_trends,
                    "lectureAnalytics": lecture_analytics,
                    "studentProgress": progress
                }

            # 4) Return final payload
            return dashboard_data

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] get_instructor_dashboard: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        if conn:
            conn.close()


# Quiz submission model
class QuizSubmission(BaseModel):
    answers: dict[int, str]  # questionId -> selected answer text

@router.post("/lectures/{lecture_id}/quiz/submit")
async def submit_quiz_answers(
    lecture_id: int,
    submission: QuizSubmission,
    request: Request,
    auth_token: str = Cookie(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")

        # Verify token and get user data
        try:
            user_data = decode_token(auth_token)
            # Get LearnerID from Learners table using the username
            conn = connect_db()
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute("""
                    SELECT LearnerID 
                    FROM Learners 
                    WHERE AccountName = %s
                """, (user_data['username'],))
                learner = cursor.fetchone()
                if not learner:
                    raise HTTPException(status_code=404, detail="Learner not found")
                learner_id = learner['LearnerID']
        except Exception as e:
            print(f"Token/user verification error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token or user not found")

        try:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                # First verify the quiz exists for this lecture
                cursor.execute("""
                    SELECT QuizID 
                    FROM Quizzes 
                    WHERE LectureID = %s
                """, (lecture_id,))
                quiz = cursor.fetchone()
                if not quiz:
                    raise HTTPException(status_code=404, detail="Quiz not found for this lecture")

                quiz_id = quiz['QuizID']

                # Get correct answers for validation
                cursor.execute("""
                    SELECT q.QuestionID, o.OptionText
                    FROM Questions q
                    JOIN Options o ON q.QuestionID = o.QuestionID
                    WHERE q.QuizID = %s AND o.IsCorrect = 1
                """, (quiz_id,))
                
                correct_answers = {row['QuestionID']: row['OptionText'] for row in cursor.fetchall()}
                
                # Calculate score
                total_questions = len(correct_answers)
                if total_questions == 0:
                    raise HTTPException(status_code=500, detail="No questions found for this quiz")

                correct_count = sum(
                    1 for q_id, answer in submission.answers.items()
                    if str(q_id) in map(str, correct_answers.keys()) and answer == correct_answers[int(q_id)]
                )
                
                score = (correct_count / total_questions) * 100

                # Get the CourseID for this lecture
                cursor.execute("""
                    SELECT CourseID
                    FROM Lectures
                    WHERE LectureID = %s
                """, (lecture_id,))
                lecture_data = cursor.fetchone()
                if not lecture_data:
                    raise HTTPException(status_code=404, detail="Lecture not found")
                
                course_id = lecture_data['CourseID']

                # Save or update the score using direct SQL instead of stored procedure
                try:
                    # Use stored procedure to update or insert the lecture result
                    cursor.execute(
                        "CALL sp_update_lecture_result(%s, %s, %s, %s)",
                        (learner_id, course_id, lecture_id, score)
                    )
                    
                    # Update course completion percentage
                    try:
                        # Get total lectures in the course
                        cursor.execute("""
                            SELECT COUNT(*) as total_lectures 
                            FROM Lectures 
                            WHERE CourseID = %s
                        """, (course_id,))
                        total_lectures = cursor.fetchone()['total_lectures']
                        
                        # Get passed lectures
                        cursor.execute("""
                            SELECT COUNT(*) as passed_lectures 
                            FROM LectureResults 
                            WHERE LearnerID = %s AND CourseID = %s AND State = 'passed'
                        """, (learner_id, course_id))
                        passed_lectures = cursor.fetchone()['passed_lectures']
                        
                        # Calculate percentage
                        if total_lectures > 0:
                            percentage_raw = (passed_lectures * 100.0) / total_lectures
                            
                            # Convert to percentage scale
                            if percentage_raw < 10:
                                percentage = 0
                            elif percentage_raw < 30:
                                percentage = 20
                            elif percentage_raw < 50:
                                percentage = 40
                            elif percentage_raw < 70:
                                percentage = 60
                            elif percentage_raw < 90:
                                percentage = 80
                            else:
                                percentage = 100
                                
                            # Update enrollment record
                            cursor.execute("""
                                UPDATE Enrollments
                                SET Percentage = %s
                                WHERE LearnerID = %s AND CourseID = %s
                            """, (percentage, learner_id, course_id))
                    except Exception as e:
                        print(f"Error updating course percentage: {str(e)}")
                        # Continue even if percentage update fails
                    
                    conn.commit()
                    print(f"Score updated successfully for learner {learner_id}, lecture {lecture_id}")
                except Exception as e:
                    print(f"Error saving quiz score: {str(e)}")
                    conn.rollback()
                    raise HTTPException(status_code=500, detail=f"Failed to save quiz score: {str(e)}")

                return {
                    "score": score,
                    "total_questions": total_questions,
                    "correct_answers": correct_count
                }

        finally:
            conn.close()

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error submitting quiz: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error submitting quiz: {str(e)}")

@router.get("/lectures/{lecture_id}/quiz/results")
async def get_quiz_results(
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
            user_id = user_data.get("id")
            
            # Create a cache key based on user ID and lecture ID
            cache_key = f"quiz:results:lecture:{lecture_id}:learner:{user_id}"
            
            # Define the database fetch function
            async def fetch_quiz_results_from_db():
                conn = connect_db()
                try:
                    with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                        cursor.execute("""
                            SELECT Score, State, Date
                            FROM LectureResults
                            WHERE LearnerID = %s AND LectureID = %s
                            ORDER BY Date DESC
                            LIMIT 1
                        """, (user_id, lecture_id))
                        
                        result = cursor.fetchone()
                        if not result:
                            return None
                            
                        return {
                            "score": float(result["Score"]),
                            "status": result["State"],
                            "date": result["Date"].isoformat()
                        }
                finally:
                    conn.close()
            
            # Use the caching mechanism to get the data
            # Short TTL since quiz results may change frequently
            return await get_cached_data(
                cache_key,
                fetch_quiz_results_from_db,
                ttl=300  # Cache for 5 minutes
            )
                
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_quiz_results: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Get instructor course details
@router.get("/instructor/courses/{course_id}", response_model=Course)
async def get_instructor_course_details(
    request: Request,
    course_id: int,
    auth_token: str = Cookie(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        # Verify token and get user data
        try:
            user_data = decode_token(auth_token)
            username = user_data['username']
            role = user_data['role']
            instructor_id = user_data.get('user_id')
            
            # Verify user is an instructor
            if role != "Instructor":
                raise HTTPException(status_code=403, detail="Only instructors can access this endpoint")
            
            # Connect to database
            conn = connect_db()
            
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                # Get instructor ID from token or fallback to database lookup
                if not instructor_id:
                    # Fallback for old tokens without user_id
                    cursor.execute("""
                        SELECT InstructorID 
                        FROM Instructors 
                        WHERE AccountName = %s
                    """, (username,))
                    
                    instructor = cursor.fetchone()
                    if not instructor:
                        raise HTTPException(status_code=404, detail="Instructor not found")
                    
                    instructor_id = instructor['InstructorID']
                
                # Get course details, ensuring it belongs to this instructor
                query = """
                    SELECT 
                        c.CourseID as id, 
                        c.CourseName as name, 
                        CONCAT(i.InstructorName, ' (', i.AccountName, ')') as instructor,
                        c.Descriptions as description,
                        (SELECT COUNT(*) FROM Enrollments WHERE CourseID = c.CourseID) as enrolled,
                        COALESCE(
                            (SELECT AVG(Rating) 
                             FROM Enrollments 
                             WHERE CourseID = c.CourseID AND Rating IS NOT NULL),
                            0
                        ) as rating,
                        c.Skills as skills,
                        c.Difficulty as difficulty,
                        c.EstimatedDuration as duration
                    FROM Courses c
                    JOIN Instructors i ON c.InstructorID = i.InstructorID
                    WHERE c.CourseID = %s AND c.InstructorID = %s
                """
                
                cursor.execute(query, (course_id, instructor_id))
                course = cursor.fetchone()
                
                if not course:
                    raise HTTPException(status_code=404, detail=f"Course with ID {course_id} not found or not owned by this instructor")
                
                # Format the course data
                if course['rating']:
                    course['rating'] = float(course['rating'])
                
                # Convert skills from JSON string if needed
                if isinstance(course.get('skills'), str):
                    try:
                        course['skills'] = json.loads(course['skills'])
                    except:
                        course['skills'] = []
                
                return course
                
        except Exception as e:
            print(f"Database error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching instructor course details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()



# CreateLecture model and create_lecture endpoint to handle lecture creation with video upload and quiz
class CreateLecture(BaseModel):
    title: str
    description: str
    content: str
    quiz: Optional[dict] = None

@router.post("/courses/{course_id}/lectures")
async def create_lecture(
    request: Request,
    course_id: int,
    auth_token: str = Cookie(None),
    title: str = Form(...),
    description: str = Form(...),
    content: str = Form(...),
    video: Optional[UploadFile] = File(None),
    quiz: Optional[str] = Form(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        # Verify token and get user data
        try:
            user_data = decode_token(auth_token)
            username = user_data['username']
            role = user_data['role']
            
            # Verify user is an instructor
            if role != "Instructor":
                raise HTTPException(status_code=403, detail="Only instructors can access this endpoint")
            
            # Connect to database
            conn = connect_db()
            cursor = conn.cursor(pymysql.cursors.DictCursor)
            
            try:
                # Get instructor ID from token or fallback to database lookup
                instructor_id = user_data.get('user_id')
                if not instructor_id:
                    # Fallback for old tokens without user_id
                    cursor.execute("""
                        SELECT InstructorID 
                        FROM Instructors 
                        WHERE AccountName = %s
                    """, (username,))
                    
                    instructor = cursor.fetchone()
                    if not instructor:
                        raise HTTPException(status_code=404, detail="Instructor not found")
                    
                    instructor_id = instructor['InstructorID']
                
                # Verify this instructor owns this course
                cursor.execute("""
                    SELECT CourseID 
                    FROM Courses 
                    WHERE CourseID = %s AND InstructorID = %s
                """, (course_id, instructor_id))
                

                
                if not cursor.fetchone():
                    raise HTTPException(status_code=403, detail="Not authorized to modify this course")
                
                # Create the lecture
                cursor.execute("""
                    INSERT INTO Lectures (CourseID, Title, Description, Content) 
                    VALUES (%s, %s, %s, %s)
                """, (course_id, title, description, content))
                
                # Get the newly created lecture ID
                lecture_id = cursor.lastrowid
                
                # Process quiz data first (faster database operations)
                quiz_id = None
                if quiz:
                    quiz_data = json.loads(quiz)
                    if quiz_data and quiz_data.get('questions'):
                        # Insert quiz
                        cursor.execute("""
                            INSERT INTO Quizzes (LectureID, Title, Description) 
                            VALUES (%s, %s, %s)
                        """, (lecture_id, f"Quiz for {title}", description))
                        
                        quiz_id = cursor.lastrowid
                        
                        # Batch insert questions and options for better performance
                        questions_to_insert = []
                        options_to_insert = []
                        
                        for question in quiz_data['questions']:
                            # Insert question first to get the ID
                            cursor.execute("""
                                INSERT INTO Questions (QuizID, QuestionText) 
                                VALUES (%s, %s)
                            """, (quiz_id, question['question']))
                            
                            question_id = cursor.lastrowid
                            
                            # Prepare batch options for this question
                            for i, option in enumerate(question['options']):
                                options_to_insert.append((
                                    question_id, 
                                    option, 
                                    i == question['correctAnswer']
                                ))
                        
                        # Batch insert all options at once
                        if options_to_insert:
                            cursor.executemany("""
                                INSERT INTO Options (QuestionID, OptionText, IsCorrect)
                                VALUES (%s, %s, %s)
                            """, options_to_insert)
                
                # Commit all database changes at once
                conn.commit()
                
                # Prepare response
                response = {
                    "id": lecture_id,
                    "title": title,
                    "message": "Lecture created successfully"
                }
                
                # Note: Video upload is now handled separately through upload_endpoints.py
                # This separates concerns and allows for better error handling and chunked uploads
                if video:
                    response["note"] = "Lecture created successfully. Please use the dedicated upload endpoints for video upload."
                
                
                # Invalidate cache patterns in background (non-blocking)
                def background_cache_invalidation():
                    try:
                        # Clear course-specific caches
                        invalidate_cache_pattern(f"courses:id:{course_id}:*")
                        invalidate_cache_pattern(f"instructor:courses:*")
                        # Clear lecture cache if it exists
                        invalidate_cache_pattern(f"lectures:id:*")
                        print(f"Cache invalidation completed for course {course_id}")
                    except Exception as cache_error:
                        print(f"Background cache invalidation failed: {str(cache_error)}")
                
                # Start background cache invalidation
                cache_thread = threading.Thread(target=background_cache_invalidation)
                cache_thread.daemon = True
                cache_thread.start()
                
                return response
                
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error in create_lecture: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to create lecture: {str(e)}")
            
        except Exception as e:
            print(f"Token/user verification error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token or user not found")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in create_lecture: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

# Optimized preview endpoint for CoursePreview.js - combines course + lectures
@router.get("/courses/{course_id}/preview")
async def get_course_preview_data(course_id: int, request: Request, auth_token: str = Cookie(None)):
    try:
        # Authentication
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
        
        if not auth_token:
            raise HTTPException(status_code=401, detail="No authentication token provided")
        
        try:
            user_data = decode_token(auth_token)
            user_id = user_data.get('user_id')
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Cache key for combined preview data
        cache_key = f"course:preview:{course_id}:user:{user_id}"
        
        # Fetch all data in one optimized query
        async def fetch_preview_data_from_db():
            conn = connect_db()
            try:
                with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                    # Get course details with enrollment status
                    course_query = """
                    SELECT 
                        c.CourseID as id,
                        c.CourseName as name,
                        c.Descriptions as description,
                        c.EstimatedDuration as duration,
                        c.Skills as skills,
                        c.Difficulty as difficulty,
                        CONCAT(i.InstructorName, ' (', i.AccountName, ')') as instructor,
                        i.InstructorID as instructor_id,
                        COALESCE(enrollment_stats.enrolled, 0) as enrolled,
                        COALESCE(rating_stats.avg_rating, NULL) as rating,
                        CASE WHEN user_enrollment.LearnerID IS NOT NULL THEN TRUE ELSE FALSE END as is_enrolled,
                        user_enrollment.Rating as user_rating
                    FROM Courses c
                    JOIN Instructors i ON c.InstructorID = i.InstructorID
                    LEFT JOIN (
                        SELECT CourseID, COUNT(*) as enrolled
                        FROM Enrollments GROUP BY CourseID
                    ) enrollment_stats ON c.CourseID = enrollment_stats.CourseID
                    LEFT JOIN (
                        SELECT CourseID, AVG(Rating) as avg_rating
                        FROM Enrollments WHERE Rating IS NOT NULL GROUP BY CourseID
                    ) rating_stats ON c.CourseID = rating_stats.CourseID
                    LEFT JOIN (
                        SELECT e2.CourseID, e2.LearnerID, e2.Rating
                        FROM Enrollments e2
                        JOIN Learners l ON e2.LearnerID = l.LearnerID
                        WHERE l.LearnerID = %s
                    ) user_enrollment ON c.CourseID = user_enrollment.CourseID
                    WHERE c.CourseID = %s
                    """
                    
                    cursor.execute(course_query, (user_id, course_id))
                    course = cursor.fetchone()
                    
                    if not course:
                        raise HTTPException(status_code=404, detail="Course not found")
                    
                    # Get lectures for this course
                    lectures_query = """
                    SELECT 
                        LectureID as id,
                        Title as title,
                        Description as description
                    FROM Lectures
                    WHERE CourseID = %s
                    ORDER BY LectureID ASC
                    """
                    
                    cursor.execute(lectures_query, (course_id,))
                    lectures = cursor.fetchall()
                    
                    # Format skills if it's JSON
                    skills = []
                    if course['skills']:
                        try:
                            skills = json.loads(course['skills'])
                        except:
                            skills = []
                    
                    # Format the response
                    return {
                        'course': {
                            'id': course['id'],
                            'name': course['name'],
                            'description': course['description'],
                            'duration': course['duration'],
                            'skills': skills,
                            'difficulty': course['difficulty'],
                            'instructor': course['instructor'],
                            'instructor_id': course['instructor_id'],
                            'enrolled': course['enrolled'],
                            'rating': float(course['rating']) if course['rating'] else None,
                            'is_enrolled': course['is_enrolled'],
                            'user_rating': int(course['user_rating']) if course['user_rating'] else None
                        },
                        'lectures': [
                            {
                                'id': lecture['id'],
                                'title': lecture['title'],
                                'description': lecture['description']
                            }
                            for lecture in lectures
                        ]
                    }
            finally:
                conn.close()
        
        # Use caching with shorter TTL since it includes user-specific data
        return await get_cached_data(
            cache_key,
            fetch_preview_data_from_db,
            ttl=900,  # 15 minutes for user-specific data
            use_compression=True
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_course_preview_data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Debug endpoint for instructor to list their courses - no caching, direct DB access
@router.get("/instructor/debug/my-courses")
async def debug_my_courses(
    request: Request,
    auth_token: str = Cookie(None)
):
    try:
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        user_data = decode_token(auth_token)
        username = user_data['username']
        role = user_data['role']
        instructor_id = user_data.get('user_id')
        
        if role != "Instructor":
            raise HTTPException(status_code=403, detail="Only instructors can access this endpoint")
        
        conn = connect_db()
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            if not instructor_id:
                cursor.execute("""
                    SELECT InstructorID 
                    FROM Instructors 
                    WHERE AccountName = %s
                """, (username,))
                
                instructor = cursor.fetchone()
                if not instructor:
                    raise HTTPException(status_code=404, detail="Instructor not found")
                
                instructor_id = instructor['InstructorID']
            
            cursor.execute("""
                SELECT CourseID, CourseName, InstructorID
                FROM Courses 
                WHERE InstructorID = %s
                ORDER BY CourseID
            """, (instructor_id,))
            
            courses = cursor.fetchall()
            
            return {
                "instructor_id": instructor_id,
                "username": username,
                "courses": courses,
                "course_count": len(courses)
            }
            
    except Exception as e:
        print(f"Debug error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

# Get enrolled learners for a specific course (instructor only)
@router.get("/instructor/courses/{course_id}/enrollments")
async def get_course_enrollments(
    course_id: int,
    request: Request,
    auth_token: str = Cookie(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        # Verify token and get user data
        user_data = decode_token(auth_token)
        username = user_data['username']
        role = user_data['role']
        instructor_id = user_data.get('user_id')
        
        # Verify user is an instructor
        if role != "Instructor":
            raise HTTPException(status_code=403, detail="Only instructors can access this endpoint")
        
        conn = connect_db()
        
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            # Get instructor ID if not in token
            if not instructor_id:
                cursor.execute("""
                    SELECT InstructorID 
                    FROM Instructors 
                    WHERE AccountName = %s
                """, (username,))
                
                instructor = cursor.fetchone()
                if not instructor:
                    raise HTTPException(status_code=404, detail="Instructor not found")
                
                instructor_id = instructor['InstructorID']
            
            # Verify the course belongs to this instructor
            cursor.execute("""
                SELECT CourseID, CourseName
                FROM Courses 
                WHERE CourseID = %s AND InstructorID = %s
            """, (course_id, instructor_id))
            
            course = cursor.fetchone()
            if not course:
                raise HTTPException(status_code=404, detail="Course not found or you don't have permission to access it")
            
            # Get enrolled learners with their enrollment details
            cursor.execute("""
                SELECT 
                    l.LearnerID,
                    l.LearnerName,
                    l.Email,
                    e.EnrollmentDate,
                    COALESCE(e.Percentage, 0) as progress,
                    COALESCE(e.Rating, 0) as rating
                FROM Enrollments e
                JOIN Learners l ON e.LearnerID = l.LearnerID
                WHERE e.CourseID = %s
                ORDER BY e.EnrollmentDate DESC
            """, (course_id,))
            
            enrollments = cursor.fetchall()
            
            # Calculate completion rate
            total_enrollments = len(enrollments)
            completed_enrollments = sum(1 for e in enrollments if e['progress'] == 100)
            completion_rate = (completed_enrollments / total_enrollments * 100) if total_enrollments > 0 else 0
            
            # Format the data for the frontend
            formatted_enrollments = []
            for enrollment in enrollments:
                formatted_enrollments.append({
                    'learner_id': enrollment['LearnerID'],
                    'learner_name': enrollment['LearnerName'],
                    'email': enrollment['Email'],
                    'enrollment_date': enrollment['EnrollmentDate'].strftime('%b %d, %Y') if enrollment['EnrollmentDate'] else 'N/A',
                    'progress': enrollment['progress'],
                    'rating': enrollment['rating']
                })
            
            return {
                'course_id': course_id,
                'course_name': course['CourseName'],
                'total_enrollments': total_enrollments,
                'completion_rate': round(completion_rate, 1),
                'enrollments': formatted_enrollments
            }
            
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching course enrollments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching course enrollments: {str(e)}")
    finally:
        if 'conn' in locals():
            conn.close()

# Rating submission model
class RatingSubmission(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Rating value between 1 and 5")

# Submit rating for a course
@router.put("/courses/{course_id}/rating")
async def submit_course_rating(
    course_id: int,
    rating_data: RatingSubmission,
    request: Request,
    auth_token: str = Cookie(None)
):
    try:
        # Get token from header if not in cookie
        if not auth_token:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                auth_token = auth_header.split(' ')[1]
            else:
                raise HTTPException(status_code=401, detail="No authentication token provided")
        
        # Verify token and get user data
        try:
            user_data = decode_token(auth_token)
            learner_id = user_data.get('user_id')
            
            if not learner_id:
                # Fallback for old tokens without user_id - do database lookup
                conn = connect_db()
                with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                    cursor.execute("""
                        SELECT LearnerID 
                        FROM Learners 
                        WHERE AccountName = %s
                    """, (user_data['username'],))
                    learner = cursor.fetchone()
                    if not learner:
                        raise HTTPException(status_code=404, detail="Learner not found")
                    learner_id = learner['LearnerID']
            else:
                # Use user_id from token
                conn = connect_db()
        except Exception as e:
            print(f"Token/user verification error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token or user not found")

        # Check if the course exists and user is enrolled
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("""
                SELECT e.EnrollmentID 
                FROM Enrollments e
                JOIN Courses c ON e.CourseID = c.CourseID
                WHERE e.CourseID = %s AND e.LearnerID = %s
            """, (course_id, learner_id))
            enrollment = cursor.fetchone()
            if not enrollment:
                raise HTTPException(status_code=404, detail="Course not found or you are not enrolled")
            
            # Update the rating in the Enrollments table
            try:
                cursor.execute("""
                    UPDATE Enrollments
                    SET Rating = %s
                    WHERE CourseID = %s AND LearnerID = %s
                """, (rating_data.rating, course_id, learner_id))
                
                conn.commit()
                
                # Invalidate cache for course rating data
                redis_client = get_redis_client()
                pattern_course = f"courses:id:{course_id}:*"
                pattern_preview = f"course:preview:{course_id}:*"
                print(f"Invalidating cache patterns: {pattern_course}, {pattern_preview}")
                invalidate_cache_pattern(pattern_course)
                invalidate_cache_pattern(pattern_preview)
                
                return {"message": "Rating submitted successfully", "rating": rating_data.rating}
            except Exception as e:
                conn.rollback()
                print(f"Error updating rating: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to submit rating: {str(e)}")
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error submitting rating: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error submitting rating: {str(e)}")
    finally:
        if 'conn' in locals():
            conn.close()