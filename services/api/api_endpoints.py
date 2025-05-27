from fastapi import APIRouter, Depends, HTTPException, Request, Cookie, UploadFile, File, Form
from typing import List, Optional, Dict
from pydantic import BaseModel
from services.api.db.token_utils import decode_token
from dotenv import load_dotenv
import os
import pymysql
import pandas as pd
import boto3
import json
from botocore.exceptions import ClientError
from datetime import datetime
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables
load_dotenv()
MYSQL_USER = os.getenv("MYSQL_USER")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD")
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_DB = os.getenv("MYSQL_DB")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))

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
    prefix="/api",
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
            port=MYSQL_PORT
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

# Get all courses
@router.get("/courses", response_model=List[Course])
async def get_courses(request: Request, auth_token: str = Cookie(None)):
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
        
        conn = connect_db()
        courses = []
        
        try:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                query = """
                SELECT 
                    c.CourseID as id, 
                    c.CourseName as name, 
                    CONCAT(i.InstructorName, ' (', i.AccountName, ')') as instructor,
                    c.Descriptions as description
                FROM Courses c
                JOIN Instructors i ON c.InstructorID = i.InstructorID
                """
                cursor.execute(query)
                courses = cursor.fetchall()
                
                # Get ratings for each course
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
        finally:
            conn.close()
            
        return courses
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get course details
@router.get("/courses/{course_id}", response_model=Course)
async def get_course_details(request: Request, course_id: int, auth_token: str = Cookie(None)):
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
        
        conn = connect_db()
        course = None
        
        try:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                # First check if course exists
                query = """
                SELECT 
                    c.CourseID as id, 
                    c.CourseName as name, 
                    CONCAT(i.InstructorName, ' (', i.AccountName, ')') as instructor,
                    c.Descriptions as description
                FROM Courses c
                JOIN Instructors i ON c.InstructorID = i.InstructorID
                WHERE c.CourseID = %s
                """
                cursor.execute(query, (course_id,))
                course = cursor.fetchone()
                
                if not course:
                    raise HTTPException(status_code=404, detail=f"Course with ID {course_id} not found")
                
                # Get ratings and enrollment count in one query
                cursor.execute("""
                SELECT 
                    COUNT(*) as enrolled,
                    COALESCE(AVG(Rating), 0) as avg_rating,
                    COUNT(CASE WHEN Rating IS NOT NULL THEN 1 END) as rating_count
                FROM Enrollments 
                WHERE CourseID = %s
                """, (course_id,))
                
                stats = cursor.fetchone()
                if stats:
                    course['enrolled'] = stats['enrolled']
                    course['rating'] = float(stats['avg_rating']) if stats['rating_count'] > 0 else None
                else:
                    course['enrolled'] = 0
                    course['rating'] = None
                
        finally:
            conn.close()
            
        return course
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
        
        conn = connect_db()
        try:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
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
            conn.close()
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_lecture_details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get instructor's courses
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
        try:
            user_data = decode_token(auth_token)
            username = user_data['username']
            role = user_data['role']
            
            # Verify user is an instructor
            if role != "Instructor":
                raise HTTPException(status_code=403, detail="Only instructors can access this endpoint")
            
            # Connect to database
            conn = connect_db()
            
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                # Get instructor ID
                cursor.execute("""
                    SELECT InstructorID 
                    FROM Instructors 
                    WHERE AccountName = %s
                """, (username,))
                
                instructor = cursor.fetchone()
                if not instructor:
                    raise HTTPException(status_code=404, detail="Instructor not found")
                
                instructor_id = instructor['InstructorID']
                
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
                
                cursor.execute(query, (instructor_id,))
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
                
        except Exception as e:
            print(f"Database error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching instructor courses: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

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
            
            # Log debugging information
            print(f"POST /instructor/courses - User: {username}, Role: {role}")
            print(f"Course data: {course_data}")
            
            # Verify user is an instructor
            if role != "Instructor":
                raise HTTPException(status_code=403, detail="Only instructors can create courses")
            
            # Connect to database
            conn = connect_db()
            
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                # Get instructor ID
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

# Get enrolled courses for the current user
@router.get("/user/courses", response_model=List[Course])
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
            
            # Connect to database
            conn = connect_db()
            
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
                
        except Exception as e:
            print(f"Token/user verification error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token or user not found")
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching user profile: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching user profile: {str(e)}")
    finally:
        if 'conn' in locals():
            conn.close()

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
@router.get("/user/dashboard")
async def get_user_dashboard(
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
            username = user_data.get('username')
            role = user_data.get('role')
            
            if not username or not role:
                raise HTTPException(status_code=401, detail="Invalid token data")
            
            # Verify user is an instructor
            if role != "Instructor":
                raise HTTPException(status_code=403, detail="Only instructors can access this endpoint")
            
            # Connect to database
            conn = connect_db()
            
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                # Get instructor ID
                try:
                    cursor.execute("""
                        SELECT InstructorID 
                        FROM Instructors 
                        WHERE AccountName = %s
                    """, (username,))
                    
                    instructor = cursor.fetchone()
                    if not instructor:
                        raise HTTPException(status_code=404, detail="Instructor not found")
                    
                    instructor_id = instructor['InstructorID']
                except Exception as e:
                    print(f"Error getting instructor ID: {str(e)}")
                    raise HTTPException(status_code=500, detail="Error retrieving instructor information")
                
                try:
                    # Get total courses
                    cursor.execute("""
                        SELECT COUNT(*) as total_courses
                        FROM Courses
                        WHERE InstructorID = %s
                    """, (instructor_id,))
                    total_courses = cursor.fetchone()['total_courses']
                    
                    # Get total students and stats
                    cursor.execute("""
                        SELECT 
                            COUNT(DISTINCT e.LearnerID) as total_students,
                            COALESCE(AVG(e.Rating), 0) as average_rating,
                            COUNT(*) as total_enrollments,
                            SUM(CASE WHEN e.Percentage = 100 THEN 1 ELSE 0 END) as completed_enrollments
                        FROM Courses c
                        LEFT JOIN Enrollments e ON c.CourseID = e.CourseID
                        WHERE c.InstructorID = %s
                    """, (instructor_id,))
                    
                    stats = cursor.fetchone()
                    if not stats:
                        stats = {
                            'total_students': 0,
                            'average_rating': 0,
                            'total_enrollments': 0,
                            'completed_enrollments': 0
                        }
                    
                    completion_rate = round((stats['completed_enrollments'] / stats['total_enrollments'] * 100)
                                         if stats['total_enrollments'] > 0 else 0, 1)
                    
                    # Get student growth
                    cursor.execute("""
                        SELECT 
                            DATE_FORMAT(EnrollmentDate, '%%Y-%%m') as month,
                            COUNT(DISTINCT LearnerID) as students
                        FROM Courses c
                        JOIN Enrollments e ON c.CourseID = e.CourseID
                        WHERE c.InstructorID = %s
                        AND EnrollmentDate >= DATE_SUB(CURRENT_DATE, INTERVAL 2 MONTH)
                        GROUP BY DATE_FORMAT(EnrollmentDate, '%%Y-%%m')
                        ORDER BY month DESC
                        LIMIT 2
                    """, (instructor_id,))
                    
                    growth_data = cursor.fetchall()
                    
                    current_month = growth_data[0]['students'] if growth_data else 0
                    prev_month = growth_data[1]['students'] if len(growth_data) > 1 else 0
                    student_growth = round(((current_month - prev_month) / prev_month * 100)
                                        if prev_month > 0 else 0, 1)
                    
                    # Get courses
                    cursor.execute("""
                        SELECT 
                            c.CourseID as id,
                            c.CourseName as name,
                            c.Descriptions as description,
                            c.AverageRating as rating,
                            COUNT(DISTINCT e.LearnerID) as enrollments,
                            AVG(e.Percentage) as completionRate
                        FROM Courses c
                        LEFT JOIN Enrollments e ON c.CourseID = e.CourseID
                        WHERE c.InstructorID = %s
                        GROUP BY c.CourseID, c.CourseName, c.Descriptions, c.AverageRating
                        ORDER BY c.CreatedAt DESC
                    """, (instructor_id,))
                    
                    courses = cursor.fetchall() or []
                    
                    # Get enrollment trends
                    cursor.execute("""
                        SELECT 
                            DATE_FORMAT(e.EnrollmentDate, '%%Y-%%m-%%d') as date,
                            COUNT(*) as value
                        FROM Courses c
                        JOIN Enrollments e ON c.CourseID = e.CourseID
                        WHERE c.InstructorID = %s
                        AND e.EnrollmentDate >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
                        GROUP BY DATE_FORMAT(e.EnrollmentDate, '%%Y-%%m-%%d')
                        ORDER BY date
                    """, (instructor_id,))
                    
                    enrollment_trends = cursor.fetchall() or []
                    
                    # Get rating trends
                    cursor.execute("""
                        SELECT 
                            DATE_FORMAT(e.EnrollmentDate, '%%Y-%%m-%%d') as date,
                            AVG(e.Rating) as value
                        FROM Courses c
                        JOIN Enrollments e ON c.CourseID = e.CourseID
                        WHERE c.InstructorID = %s
                        AND e.EnrollmentDate >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
                        AND e.Rating IS NOT NULL
                        GROUP BY DATE_FORMAT(e.EnrollmentDate, '%%Y-%%m-%%d')
                        ORDER BY date
                    """, (instructor_id,))
                    
                    rating_trends = cursor.fetchall() or []
                    
                    # Format the data
                    formatted_courses = [
                        {
                            'id': course['id'],
                            'name': course['name'],
                            'description': course['description'] or "",
                            'enrollments': course['enrollments'] or 0,
                            'rating': round(float(course['rating']), 1) if course['rating'] else 0.0,
                            'completionRate': round(float(course['completionRate']), 1) if course['completionRate'] else 0.0
                        } for course in courses
                    ]
                    
                    formatted_enrollment_trends = [
                        {
                            'date': trend['date'],
                            'value': int(trend['value'])
                        } for trend in enrollment_trends
                    ]
                    
                    formatted_rating_trends = [
                        {
                            'date': trend['date'],
                            'value': round(float(trend['value']), 1)
                        } for trend in rating_trends if trend['value'] is not None
                    ]
                    
                    dashboard_data = {
                        "metrics": {
                            "totalCourses": total_courses,
                            "totalStudents": stats['total_students'],
                            "averageRating": round(float(stats['average_rating']), 1),
                            "completionRate": completion_rate,
                            "studentGrowth": student_growth
                        },
                        "courses": formatted_courses,
                        "enrollmentTrends": formatted_enrollment_trends,
                        "ratingTrends": formatted_rating_trends,
                        "courseEnrollments": [
                            {
                                "courseName": course['name'],
                                "enrollments": course['enrollments'] or 0
                            } for course in courses
                        ]
                    }
                    
                    return dashboard_data
                    
                except Exception as e:
                    print(f"Error processing dashboard data: {str(e)}")
                    raise HTTPException(status_code=500, detail="Error processing dashboard data")
                
        except HTTPException as he:
            raise he
        except Exception as e:
            print(f"Database error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching instructor dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
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
        except Exception as e:
            print(f"Token decode error: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")

        conn = connect_db()
        try:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute("""
                    SELECT Score, State, Date
                    FROM LectureResults
                    WHERE LearnerID = %s AND LectureID = %s
                    ORDER BY Date DESC
                    LIMIT 1
                """, (user_data["id"], lecture_id))
                
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
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_quiz_results: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Test endpoints for debugging route registration
@router.get("/instructor/courses/test")
async def test_instructor_courses_get():
    return {"message": "GET /instructor/courses/test works"}

@router.post("/instructor/courses/test")
async def test_instructor_courses_post():
    return {"message": "POST /instructor/courses/test works"}

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
            
            # Verify user is an instructor
            if role != "Instructor":
                raise HTTPException(status_code=403, detail="Only instructors can access this endpoint")
            
            # Connect to database
            conn = connect_db()
            
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                # Get instructor ID
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
                # Get instructor ID
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
                conn.commit()
                
                # Get the newly created lecture ID
                lecture_id = cursor.lastrowid
                
                # Upload video if provided
                if video:
                    # Check file size (100MB limit)
                    video_content = await video.read()
                    if len(video_content) > 100 * 1024 * 1024:  # 100MB in bytes
                        raise HTTPException(status_code=400, detail="Video file size must be less than 100MB")
                    
                    # Check file type
                    if not video.content_type.startswith('video/'):
                        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a video file")
                    
                    # Upload to S3
                    media_path = f"videos/cid{course_id}/lid{lecture_id}/vid_lecture.mp4"
                    s3.put_object(
                        Bucket="tlhmaterials",
                        Key=media_path,
                        Body=video_content,
                        ContentType=video.content_type,
                        ACL="public-read",
                        ContentDisposition="inline"
                    )
                
                # Create quiz if provided
                if quiz:
                    quiz_data = json.loads(quiz)
                    if quiz_data and quiz_data.get('questions'):
                        # Insert quiz
                        cursor.execute("""
                            INSERT INTO Quizzes (LectureID, Title, Description) 
                            VALUES (%s, %s, %s)
                        """, (lecture_id, f"Quiz for {title}", description))
                        conn.commit()
                        
                        quiz_id = cursor.lastrowid
                        
                        # Insert questions and options
                        for question in quiz_data['questions']:
                            cursor.execute("""
                                INSERT INTO Questions (QuizID, QuestionText) 
                                VALUES (%s, %s)
                            """, (quiz_id, question['question']))
                            conn.commit()
                            
                            question_id = cursor.lastrowid
                            
                            # Insert options
                            for i, option in enumerate(question['options']):
                                cursor.execute("""
                                    INSERT INTO Options (QuestionID, OptionText, IsCorrect)
                                    VALUES (%s, %s, %s)
                                """, (question_id, option, i == question['correctAnswer']))
                            conn.commit()
                
                return {
                    "id": lecture_id,
                    "title": title,
                    "message": "Lecture created successfully"
                }
                
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
