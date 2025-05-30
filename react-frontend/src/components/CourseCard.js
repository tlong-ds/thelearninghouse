import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { images } from '../utils/images';
import { formatDuration } from '../utils/duration';
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
    <Link to={getCourseUrl()} className="browse-course-card clickable-card">
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
          <span className="browse-course-duration">⏱️ {formatDuration(course.duration)}</span>
          <span className="browse-course-rating">★ {course.rating ? parseFloat(course.rating).toFixed(1) : '0.0'}</span>
        </div>
      </div>
    </Link>
  );
};

export default CourseCard;
