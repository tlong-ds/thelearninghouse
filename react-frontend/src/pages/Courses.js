import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchCourses, fetchInstructorCourses } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import CourseCard from '../components/CourseCard';
import '../styles/Courses.css';

const Courses = () => {
  const [courses, setCourses] = useState([]);
  const [filteredCourses, setFilteredCourses] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('enrollments');
  const [sortOrder, setSortOrder] = useState('desc');
  
  const { currentUser, logout } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  const navigate = useNavigate();

  const sortCourses = (coursesToSort) => {
    if (!coursesToSort) return [];
    return [...coursesToSort].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'enrollments':
          comparison = (b.enrolled || 0) - (a.enrolled || 0);
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'rating':
          comparison = (b.rating || 0) - (a.rating || 0);
          break;
        case 'completion':
          comparison = (b.completionRate || 0) - (a.completionRate || 0);
          break;
        default:
          return 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };
  
  useEffect(() => {
    const loadCourses = async () => {
      startLoading('Loading courses...');
      setError('');
      try {
        let coursesData;
        
        if (currentUser?.role === 'Learner') {
          coursesData = await fetchCourses();
        } else {
          coursesData = await fetchInstructorCourses();
        }
        
        setCourses(coursesData);
        setFilteredCourses(coursesData);
        stopLoading();
      } catch (err) {
        console.error('Failed to fetch courses:', err);
        setError('Failed to load courses. Please try again later.');
        stopLoading();
      }
    };
    
    loadCourses();
  }, [currentUser.role, startLoading, stopLoading]);
  
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredCourses(sortCourses(courses));
    } else {
      const filtered = courses.filter(course => 
        course.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredCourses(sortCourses(filtered));
    }
  }, [searchTerm, courses, sortBy, sortOrder]);
  
  useEffect(() => {
    setFilteredCourses(prevCourses => sortCourses(prevCourses));
  }, [sortBy, sortOrder, courses]);
  
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };
  
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };
  
  const handleSortChange = (newSortBy) => {
    const newSortOrder = sortBy === newSortBy && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
  };
  
  if (error) {
    return (
      <div className="courses-container">
        <div className="error">{error}</div>
      </div>
    );
  }
  
  return (
    <div className="courses-container">
      
      <div className="courses-content">
        <div className="courses-header">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search for courses..."
              value={searchTerm}
              onChange={handleSearch}
            />
          </div>
          
          <div className="course-controls">
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="enrollments">Enrollments</option>
              <option value="name">Name</option>
              <option value="rating">Rating</option>
              <option value="completion">Completion</option>
            </select>
            <button 
              className="sort-order-btn"
              onClick={() => setSortOrder(order => order === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
        
        <h1>
          {currentUser.role === 'Learner' ? 'Available Courses' : 'Your Courses'}
        </h1>
        
        {currentUser.role === 'Instructor' && (
          <div className="add-course-btn">
            <Link to="/add-course" className="btn primary-btn">Add New Course</Link>
          </div>
        )}
        
        {filteredCourses.length === 0 ? (
          <div className="no-courses">
            {searchTerm ? 'No courses match your search.' : 'No courses available.'}
          </div>
        ) : (
          <div className="courses-grid">
            {filteredCourses.map(course => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Courses;
