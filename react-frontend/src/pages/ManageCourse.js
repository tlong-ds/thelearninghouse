import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import Header from '../components/Header';
import config from '../config';
import { images } from '../utils/images';
import '../styles/ManageCourse.css';

const ManageCourse = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  const [course, setCourse] = useState(null); 
  const [lectures, setLectures] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    // Redirect if not an instructor
    if (currentUser && currentUser.role !== 'Instructor') {
      navigate('/courses');
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
        <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
        <div className="error">{error || 'Course not found'}</div>
      </div>
    );
  }

  return (
    <div className="manage-course-container">
      <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
      
      <div className="manage-course-content">
        <div className="course-header">
          <div className="course-info">
            <h1>{course.name}</h1>
            <p className="course-instructor">by {course.instructor}</p>
            <p className="course-description">{course.description}</p>
          </div>
          
          <div className="course-image-container">
            <div className="course-image">
              <img 
                src={course.image_url || images.logoCourse} 
                alt={course.name} 
              />
            </div>
            
            
          </div>
        </div>
        
        <div className="course-statistics">
          <h2>Course Statistics</h2>
          <div className="stats-container">
            <div className="stat-card">
              <div className="stat-value">{course.enrolled || 0}</div>
              <div className="stat-label">Students Enrolled</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{course.rating ? course.rating.toFixed(1) : 'N/A'}</div>
              <div className="stat-label">Average Rating</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{lectures.length}</div>
              <div className="stat-label">Lectures</div>
            </div>
          </div>
        </div>
        
        <div className="course-lectures">
          <div className="section-header">
            <h2>Course Content</h2>
            <button 
              className="add-lecture-button"
              onClick={() => navigate(`/add-lecture/${courseId}`)}
            >
              Add New Lecture
            </button>
          </div>
          
          {lectures.length === 0 ? (
            <p className="no-lectures">No lectures available for this course yet. Add your first lecture!</p>
          ) : (
            <div className="lectures-list">
              {lectures.map((lecture, index) => (
                <div key={lecture.id} className="lecture-item">
                  <span className="lecture-number">{index + 1}</span>
                  <div className="lecture-details">
                    <h3>{lecture.title}</h3>
                    <p>{lecture.description || 'No description provided'}</p>
                  </div>
                  <div className="lecture-actions">
                    <Link to={`/lecture/${lecture.id}`} className="lecture-view-button">
                      Preview
                    </Link>
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

export default ManageCourse;
