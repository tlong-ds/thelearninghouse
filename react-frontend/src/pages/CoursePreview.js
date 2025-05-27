import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { fetchCourseDetails, fetchLectures, enrollInCourse, fetchEnrolledCourses } from '../services/api';
import { useAuth } from '../services/AuthContext';
import Header from '../components/Header';
import '../styles/CoursePreview.css';

const CoursePreview = () => {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    const loadCourseData = async () => {
      try {
        const courseData = await fetchCourseDetails(id);
        const lecturesData = await fetchLectures(id);
        
        // Check if the user is enrolled in this course
        const enrolledCourses = await fetchEnrolledCourses();
        const enrolled = enrolledCourses.some(course => course.id === parseInt(id));
        
        setCourse(courseData);
        setLectures(lecturesData);
        setIsEnrolled(enrolled);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch course data:', err);
        setError('Failed to load course. Please try again later.');
        setLoading(false);
      }
    };
    
    loadCourseData();
  }, [id]);
  
  if (loading) {
    return (
      <div className="course-preview-container">
        <Header username={currentUser.username} role={currentUser.role} onLogout={logout} />
        <div className="loading">Loading course...</div>
      </div>
    );
  }
  
  if (error || !course) {
    return (
      <div className="course-preview-container">
        <Header username={currentUser.username} role={currentUser.role} onLogout={logout} />
        <div className="error">{error || 'Course not found'}</div>
      </div>
    );
  }
  
  const handleEnroll = async () => {
    try {
      setEnrolling(true);
      await enrollInCourse(id);
      setIsEnrolled(true);
      setEnrolling(false);
    } catch (err) {
      console.error('Failed to enroll in course:', err);
      setError('Failed to enroll in course. Please try again later.');
      setEnrolling(false);
    }
  };
  
  return (
    <div className="course-preview-container">
      <Header username={currentUser.username} role={currentUser.role} onLogout={logout} />
      
      <div className="course-preview-content">
        <div className="course-header">
          <div className="course-info">
            <h1>{course.name}</h1>
            <p className="course-instructor">by {course.instructor}</p>
            <p className="course-description">{course.description}</p>
            
            <div className="course-meta">
              <span className="course-duration">{course.duration || 'Self-paced'}</span>
              <span className="course-rating">★ {course.rating || 'N/A'}</span>
              <span className="course-enrolled">{course.enrolled || 0} enrolled</span>
            </div>
          </div>
          
          <div className="course-image-container">
            <div className="course-image">
              <img 
                src={course.image_url || '/assets/logo_course.webp'} 
                alt={course.name} 
              />
            </div>
            
            {isEnrolled ? (
              <button 
                className="view-lectures-button"
                onClick={() => navigate(`/lecture/${lectures[0]?.id}`)}
              >
                View Lectures
              </button>
            ) : (
              <button 
                className="enroll-button"
                onClick={handleEnroll}
                disabled={enrolling}
              >
                {enrolling ? 'Enrolling...' : 'Enroll Now'}
              </button>
            )}
          </div>
        </div>
        
        <div className="course-lectures">
          <h2>Course Content</h2>
          
          {lectures.length === 0 ? (
            <p>No lectures available for this course yet.</p>
          ) : isEnrolled ? (
            <div className="lectures-list">
              {lectures.map((lecture, index) => (
                <div key={lecture.id} className="lecture-item">
                  <span className="lecture-number">{index + 1}</span>
                  <div className="lecture-details">
                    <h3>{lecture.title}</h3>
                    <p>{lecture.description}</p>
                  </div>
                  <Link to={`/lecture/${lecture.id}`} className="lecture-button">
                    View
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="lectures-list locked">
              {lectures.map((lecture, index) => (
                <div key={lecture.id} className="lecture-item">
                  <span className="lecture-number">{index + 1}</span>
                  <div className="lecture-details">
                    <h3>{lecture.title}</h3>
                    <p>{lecture.description}</p>
                  </div>
                  <div className="lecture-locked">
                    <i className="fas fa-lock"></i> Enroll to access
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoursePreview;
