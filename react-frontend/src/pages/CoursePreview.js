import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { fetchCoursePreviewData, enrollInCourse } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import { images } from '../utils/images';  // Update this import
import { formatDuration } from '../utils/duration';
import Header from '../components/Header';
import '../styles/CoursePreview.css';

const CoursePreview = () => {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [error, setError] = useState('');
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  
  const { currentUser, logout } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  const navigate = useNavigate();
  
  useEffect(() => {
    const loadCourseData = async () => {
      try {
        startLoading('Loading course details...');
        
        // Use the new optimized preview endpoint that combines course + lectures data
        const previewData = await fetchCoursePreviewData(id);
        
        setCourse(previewData.course);
        setLectures(previewData.lectures);
        setIsEnrolled(previewData.course.is_enrolled);
      } catch (err) {
        console.error('Failed to fetch course data:', err);
        setError('Failed to load course. Please try again later.');
      } finally {
        stopLoading();
      }
    };
    
    loadCourseData();
  }, [id, startLoading, stopLoading]);
  
  
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
      
      // Optionally refresh the data to get updated enrollment count
      try {
        const previewData = await fetchCoursePreviewData(id);
        setCourse(previewData.course);
      } catch (refreshError) {
        console.warn('Failed to refresh course data after enrollment:', refreshError);
        // Continue anyway since enrollment was successful
      }
      
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
              <span className="course-duration">⏱️ {formatDuration(course.duration)}</span>
              <span className="course-rating">★ {course.rating ? parseFloat(course.rating).toFixed(1) : '0.0'}</span>
              <span className="course-enrolled">{course.enrolled || 0} enrolled</span>
            </div>
          </div>
          
          <div className="course-image-container">
            <div className="course-image">
              <img 
                src={course.image_url || images.logoCourse} 
                alt={course.name} 
              />
            </div>
            
            {isEnrolled ? (
              <button 
                className="view-lectures-button"
                onClick={() => navigate(`/lecture/${lectures[0]?.id}`, {
                  state: { 
                    courseName: course.name,
                    courseId: course.id
                  }
                })}
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
                  <Link 
                    to={`/lecture/${lecture.id}`} 
                    className="lecture-button"
                    state={{ 
                      courseName: course.name,
                      courseId: course.id
                    }}
                  >
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
