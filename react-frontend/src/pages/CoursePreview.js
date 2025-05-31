import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { fetchCoursePreviewData, enrollInCourse } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import { images } from '../utils/images';  // Update this import
import { formatDuration } from '../utils/duration';
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
        <div className="error-state">
          <i className="fas fa-exclamation-triangle"></i>
          <h3 className="error-message">{error || 'Course not found'}</h3>
          <p className="error-description">
            {error ? 'Please try refreshing the page or check your connection.' : 'The course you are looking for does not exist or has been removed.'}
          </p>
        </div>
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
      {/* Hero Section with Background Image */}
      <div 
        className="course-hero-background"
        style={{
          backgroundImage: `url(${course.image_url || images.logoCourse})`
        }}
      >
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="hero-main">
            <div className="hero-info">
              <h1 className="hero-title">{course.name}</h1>
              <p className="hero-instructor">by {course.instructor}</p>
              
              {/* Course Description */}
              <p className="hero-description">{course.description}</p>
              
              {/* Enrollment Action */}
              <div className="hero-action">
                {isEnrolled ? (
                  <button 
                    className="hero-action-btn enrolled"
                    onClick={() => navigate(`/lecture/${lectures[0]?.id}`, {
                      state: { 
                        courseName: course.name,
                        courseId: course.id
                      }
                    })}
                  >
                    <i className="fas fa-play"></i>
                    Continue Learning
                  </button>
                ) : (
                  <button 
                    className="hero-action-btn"
                    onClick={handleEnroll}
                    disabled={enrolling}
                  >
                    <i className={enrolling ? "fas fa-spinner fa-spin" : "fas fa-plus"}></i>
                    {enrolling ? 'Enrolling...' : 'Enroll Now'}
                  </button>
                )}
                   {/* Enrollment Count */}
              <div className="enrollment-count">
                <i className="fas fa-users"></i>
                <span>{course.enrolled || 0} students enrolled</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Hero Bottom Section with Metadata */}
        <div className="hero-bottom">
          {/* Course Metadata Placeholder */}
          <div className="course-metadata">
            <div className="metadata-item">
              <span className="metadata-value">{lectures.length}</span>
              <span className="metadata-label">lectures</span>
            </div>
            <div className="metadata-separator">|</div>
            <div className="metadata-item">
              <i className="fas fa-star metadata-icon"></i>
              <span className="metadata-value">{course.rating ? parseFloat(course.rating).toFixed(1) : '0.0'}</span>
            </div>
            <div className="metadata-separator">|</div>
            <div className="metadata-item">
              <span className="metadata-value">{course.difficulty || 'Beginner'}</span>
            </div>
            <div className="metadata-separator">|</div>
            <div className="metadata-item">
              <i className="fas fa-clock metadata-icon"></i>
              <span className="metadata-value">{formatDuration(course.duration)}</span>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Skills you will gain Section */}
      {course.skills && course.skills.length > 0 && (
        <div className="skills-section">
          <div className="skills-container">
            <div className="section-header">
              <h2 className="section-title">
                <i className="section-icon fas fa-lightbulb"></i>
                Skills you will gain
              </h2>
            </div>
            <div className="skills-grid">
              {course.skills.map((skill, index) => (
                <div key={index} className="skill-chip">
                  <i className="fas fa-check-circle skill-icon"></i>
                  <span className="skill-name">{skill}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Course Outline Section */}
      <div className="course-outline">
        <div className="outline-container">
          <div className="section-header">
            <h2 className="section-title">
              <i className="section-icon fas fa-play-circle"></i>
              Course Content
            </h2>
            <div className="content-stats">
              <span className="stat-item">
                <i className="fas fa-video"></i>
                {lectures.length} lectures
              </span>
              <span className="stat-item">
                <i className="fas fa-clock"></i>
                {formatDuration(course.duration)}
              </span>
            </div>
          </div>

          {lectures.length === 0 ? (
            <div className="empty-content">
              <h3>No lectures available yet</h3>
              <p>This course is still being prepared. Check back soon!</p>
            </div>
          ) : (
            <div className="lectures-grid">
              {lectures.map((lecture, index) => (
                <div key={lecture.id} className="lecture-card">
                  {/* Header row with order and title */}
                  <div className="lecture-header-row">
                    <div className="lecture-title-section">
                      <div className="lecture-order">
                        <span>{String(index + 1).padStart(2, '0')}</span>
                      </div>
                      <h3 className="lecture-title">{lecture.title}</h3>
                    </div>
                  </div>
                  
                  {/* Description */}
                  <p className="lecture-description">{lecture.description}</p>
                  
                  {/* Optional badges */}
                  <div className="lecture-badges">
                    {lecture.quiz && (
                      <span className="lecture-badge quiz">
                        <i className="fas fa-question-circle"></i>
                        Quiz
                      </span>
                    )}
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
