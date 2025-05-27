import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { images } from '../utils/images';
import '../styles/CourseCard.css';

const CourseCard = ({ course }) => {
  const { currentUser } = useAuth();
  
  // Determine the URL based on user role
  const getCourseUrl = () => {
    if (currentUser.role === 'Instructor') {
      return `/manage-course/${course.id}`;
    } else {
      return `/course/${course.id}`;
    }
  };

  return (
    <div className="browse-course-card">
      <div className="browse-course-image">
        <img 
          src={course.image_url || images.logoCourse} 
          alt={course.name} 
          loading="lazy"
        />
        {course.rating && parseFloat(course.rating) >= 4.5 && (
          <div className="browse-course-badge">Popular</div>
        )}
      </div>
      <div className="browse-course-content">
        <h3 className="browse-course-title">{course.name}</h3>
        <p className="browse-course-instructor">by {course.instructor}</p>
        <p className="browse-course-description">{course.description}</p>
        <div className="browse-course-meta">
          <span className="browse-course-duration">{course.duration || 'Self-paced'}</span>
          <span className="browse-course-rating">★ {course.rating || 'N/A'}</span>
        </div>
        <div className="browse-course-progress-container">
          <div 
            className="browse-course-progress-bar" 
            style={{ width: `${course.progress}%` }}
            aria-valuenow={course.progress}
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
          />
        </div>
        <Link to={getCourseUrl()} className="browse-course-button">
          <span>View Course</span>
        </Link>
      </div>
    </div>
  );
};

export default CourseCard;
