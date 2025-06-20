import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import { fetchCourseEnrollments } from '../services/api';
import config from '../config';
import { images } from '../utils/images';
import '../styles/ManageCourse.css';

// Helper function to generate learner initials
const generateInitials = (name) => {
  if (!name) return 'U';
  const words = name.split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return words[0][0].toUpperCase();
};

// Helper function to render star rating
const renderStars = (rating) => {
  const stars = [];
  const validRating = Math.max(0, Math.min(5, rating || 0));
  
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <i 
        key={i}
        className={`fas fa-star ${i <= validRating ? 'filled' : ''}`}
      ></i>
    );
  }
  return stars;
};

const ManageCourse = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  const [course, setCourse] = useState(null); 
  const [lectures, setLectures] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [enrollmentData, setEnrollmentData] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('learners');
  const tableContainerRef = useRef(null);

  // Handle scroll events for the learners table
  const handleTableScroll = (e) => {
    const container = e.target;
    if (container.scrollTop > 0) {
      container.classList.add('scrolled');
    } else {
      container.classList.remove('scrolled');
    }
  };

  useEffect(() => {
    // Redirect if not an instructor
    if (currentUser && currentUser.role !== 'Instructor') {
      navigate('/');
      return;
    }

    const loadCourseDetails = async () => {
      try {
        startLoading('Loading course details...');
        
        // Fetch course details
        const courseResponse = await fetch(`${config.API_URL}/api/instructor/courses/${courseId}`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });
        
        if (!courseResponse.ok) {
          throw new Error('Failed to load course details');
        }

        const courseData = await courseResponse.json();
        setCourse(courseData);

        // Fetch lectures for this course
        const lecturesResponse = await fetch(`${config.API_URL}/api/courses/${courseId}/lectures`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });

        if (!lecturesResponse.ok) {
          throw new Error('Failed to load lecture details');
        }

        const lecturesData = await lecturesResponse.json();
        setLectures(lecturesData);

        // Fetch enrollment data for this course
        try {
          const enrollmentData = await fetchCourseEnrollments(courseId);
          setEnrollmentData(enrollmentData);
          setEnrollments(enrollmentData.enrollments || []);
        } catch (enrollmentErr) {
          console.error('Failed to load enrollment data:', enrollmentErr);
          // Don't throw error here, just log it - course details are more important
          setEnrollments([]);
          setEnrollmentData(null);
        }
      } catch (err) {
        setError('Failed to load course details. Please try again later.');
        console.error('Error:', err);
      } finally {
        stopLoading();
      }
    };

    loadCourseDetails();
  }, [courseId, currentUser, navigate, startLoading, stopLoading]);

  if (error || !course) {
    return (
      <div className="manage-course-container">
        <div className="error">{error || 'Course not found'}</div>
      </div>
    );
  }

  return (
    <div className="instructor-course-container">
      {/* Hero Section with Course Background - 1/3 screen height */}
      <div 
        className="instructor-hero-background"
        style={{
          backgroundImage: `url(${course.image_url || images.logoCourse})`
        }}
      >
        <div className="instructor-hero-overlay"></div>
        <div className="instructor-hero-content">
          <div className="instructor-hero-main">
            <div className="instructor-hero-info">
              {/* Breadcrumb */}
              <div className="instructor-course-breadcrumb">
                <Link to="/courses" className="instructor-breadcrumb-link">
                  <i className="fas fa-arrow-left"></i>
                  <span>Back to Courses</span>
                </Link>
              </div>
              
              <h1 className="instructor-hero-title">{course.name}</h1>
              <p className="hero-instructor">by {course.instructor}</p>
              
              {/* Course Description */}
              <p className="instructor-hero-description">{course.description}</p>
              
              {/* Quick Actions */}
              <div className="instructor-hero-action">
                {lectures.length > 0 ? (
                  <Link 
                    to={`/lecture/${lectures[0].id}`}
                    state={{ 
                      courseName: course.name,
                      courseId: course.id
                    }}
                    className="instructor-hero-action-btn outline"
                  >
                    <i className="fas fa-eye"></i>
                    Preview Course
                  </Link>
                ) : (
                  <button 
                    className="instructor-hero-action-btn outline disabled"
                    disabled
                    title="No lectures available"
                  >
                    <i className="fas fa-eye"></i>
                    Preview Course
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="instructor-course-content">
        
        {/* Course Analytics - Inspired by Dashboard Statistics */}
        <div className="instructor-analytics-section">
          <h2 className="instructor-analytics-title">Course Analytics Overview</h2>
          
          <div className="analytics-metrics-grid">
            <div className="analytics-metric-card">
              <h3>Students Enrolled</h3>
              <div className="analytics-metric-value">{enrollmentData?.total_enrollments || course.enrolled || 0}</div>
            </div>
            
            <div className="analytics-metric-card">
              <h3>Total Lectures</h3>
              <div className="analytics-metric-value">{lectures.length}</div>
            </div>
            
            <div className="analytics-metric-card">
              <h3>Average Rating</h3>
              <div className="analytics-metric-value">{course.rating ? course.rating.toFixed(1) : 'N/A'}</div>
            </div>
            
            <div className="analytics-metric-card">
              <h3>Completion Rate</h3>
              <div className="analytics-metric-value">{enrollmentData?.completion_rate ? `${enrollmentData.completion_rate}%` : 'N/A'}</div>
            </div>
          </div>
        </div>

        {/* Tabbed Interface - Learners and Course Content */}
        <div className="instructor-tabs-container">
          <div className="instructor-tabs">
            <button 
              className={`instructor-tab ${activeTab === 'learners' ? 'active' : ''}`}
              onClick={() => setActiveTab('learners')}
            >
              Learners
            </button>
            <button 
              className={`instructor-tab ${activeTab === 'content' ? 'active' : ''}`}
              onClick={() => setActiveTab('content')}
            >
              Course Content
            </button>
          </div>

          <div className="instructor-tab-content">
            {activeTab === 'learners' && (
              <div className="learners-tab">
                <div className="learners-header">
                  <h3>Enrolled Students</h3>
                  <p>{enrollmentData?.total_enrollments || 0} students currently enrolled</p>
                </div>
                
                <div className="learners-table-container" ref={tableContainerRef} onScroll={handleTableScroll}>
                  <table className="learners-table">
                    <thead>
                      <tr>
                        <th>Learner Name</th>
                        <th>Enrollment Date</th>
                        <th>Progress</th>
                        <th>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.length === 0 ? (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                            No students enrolled yet
                          </td>
                        </tr>
                      ) : (
                        enrollments.map((enrollment) => (
                          <tr key={enrollment.learner_id}>
                            <td>
                              <div className="learner-info">
                                <div className="learner-avatar">
                                  {generateInitials(enrollment.learner_name)}
                                </div>
                                <span>{enrollment.learner_name}</span>
                              </div>
                            </td>
                            <td>{enrollment.enrollment_date}</td>
                            <td>
                              <div className="progress-cell">
                                <div className="progress-bar-container">
                                  <div 
                                    className="progress-bar" 
                                    style={{width: `${enrollment.progress}%`}}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="rating-cell">
                                <div className="stars">
                                  {renderStars(enrollment.rating)}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'content' && (
              <div className="content-tab">
                <div className="section-header">
                  <h2 className="section-title">
                    <i className="section-icon fas fa-play-circle"></i>
                    Course Content
                  </h2>
                  <button 
                    className="add-lecture-button"
                    onClick={() => navigate(`/add-lecture/${courseId}`)}
                  >
                    <i className="fas fa-plus"></i>
                    <span>Add New Lecture</span>
                  </button>
                </div>
                
                {lectures.length === 0 ? (
                  <div className="empty-content">
                    <h3>No lectures available yet</h3>
                    <p>Start building your course by adding your first lecture</p>
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
                        <p className="lecture-description">
                          {lecture.description || 'No description provided'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageCourse;
