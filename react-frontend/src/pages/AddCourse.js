import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCourse } from '../services/api';
import { useAuth } from '../services/AuthContext';
import '../styles/AddCourse.css';

// Skills data from skills.csv
const skillsOptions = [
  "Computer Science",
  "Fundamentals",
  "Advanced Techniques",
  "Mathematics",
  "Data Science",
  "Economics",
  "Finance",
  "Marketing",
  "Graphic Design",
  "English Language",
  "Project Management",
  "Web Development",
  "Artificial Intelligence",
  "Cryptography",
  "Network Security",
  "Business Analysis",
  "Human Resources",
  "Digital Marketing",
  "Entrepreneurship",
  "Public Speaking"
];

const AddCourse = () => {
  const [courseData, setCourseData] = useState({
    name: '',
    description: '',
    duration: '',
    difficulty: 'Beginner',
    skills: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef(null);
  const inputRef = useRef(null);
  
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCourseData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Update suggestions when skill input changes
  useEffect(() => {
    if (skillInput.trim()) {
      const filtered = skillsOptions.filter(
        skill => 
          !courseData.skills.includes(skill) && 
          skill.toLowerCase().includes(skillInput.toLowerCase())
      );
      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [skillInput, courseData.skills]);
  
  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current && 
        !suggestionsRef.current.contains(event.target) &&
        inputRef.current && 
        !inputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  // Check if user is an instructor after all hooks are defined
  useEffect(() => {
    if (currentUser && currentUser.role !== 'Instructor') {
      navigate('/');
    }
  }, [currentUser, navigate]);
  
  const handleAddSkill = (skill) => {
    if (skill.trim() && !courseData.skills.includes(skill)) {
      setCourseData(prev => ({
        ...prev,
        skills: [...prev.skills, skill]
      }));
      setSkillInput('');
      setShowSuggestions(false);
    }
  };
  
  const handleRemoveSkill = (skillToRemove) => {
    setCourseData(prev => ({
      ...prev,
      skills: prev.skills.filter(skill => skill !== skillToRemove)
    }));
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault();
      handleAddSkill(skillInput.trim());
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // Make sure all required fields are filled
      if (!courseData.name || !courseData.description) {
        throw new Error('Name and description are required fields');
      }
      
      if (courseData.skills.length === 0) {
        throw new Error('Please select at least one skill for the course');
      }
      
      // Call the API to create a new course
      const result = await createCourse(courseData);
      setLoading(false);
      
      // Redirect to the courses page after successful creation
      navigate('/courses');
    } catch (err) {
      console.error('Failed to create course:', err);
      setError(err.message || 'Failed to create course. Please try again.');
      setLoading(false);
    }
  };
  
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };
  
  return (
    <div className="add-course-container">
      {currentUser && (
        <>
          <div className="add-course-content">
            <h1>Create New Course</h1>
            
            {error && <div className="error">{error}</div>}
            
            <div className="add-course-card">
              <form onSubmit={handleSubmit} className="add-course-form">
                <div className="form-group">
                  <label htmlFor="name">Course Name</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={courseData.name}
                    onChange={handleInputChange}
                    required
                    placeholder="Enter course name"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    name="description"
                    value={courseData.description}
                    onChange={handleInputChange}
                    required
                    placeholder="Enter course description"
                    rows="5"
                  />
                </div>
                
                <div className="form-group">
                  <label>Skills</label>
                  <div className="skills-input-container">
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="Type to add skills..."
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onFocus={() => skillInput.trim() && setShowSuggestions(true)}
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="skills-suggestions" ref={suggestionsRef}>
                        {suggestions.map(skill => (
                          <div 
                            key={skill} 
                            className="skill-suggestion"
                            onClick={() => handleAddSkill(skill)}
                          >
                            {skill}
                          </div>
                        ))}
                      </div>
                    )}
                    {showSuggestions && suggestions.length === 0 && skillInput.trim() && (
                      <div className="skills-suggestions" ref={suggestionsRef}>
                        <div 
                          className="skill-suggestion new-skill"
                          onClick={() => handleAddSkill(skillInput.trim())}
                        >
                          Add "{skillInput}" as a new skill
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="selected-skills-container">
                    {courseData.skills.length > 0 ? (
                      courseData.skills.map((skill) => (
                        <div key={skill} className="skill-tag">
                          <span>{skill}</span>
                          <button 
                            type="button" 
                            className="remove-skill-btn"
                            onClick={() => handleRemoveSkill(skill)}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="no-skills-message">
                        No skills selected. Start typing to add skills.
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="form-group">
                  <label htmlFor="difficulty">Difficulty</label>
                  <select
                    id="difficulty"
                    name="difficulty"
                    value={courseData.difficulty}
                    onChange={handleInputChange}
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="duration">Estimated Duration (in hours)</label>
                  <input
                    type="number"
                    id="duration"
                    name="duration"
                    value={courseData.duration}
                    onChange={handleInputChange}
                    placeholder="e.g., 10"
                    min="1"
                  />
                </div>
                
                <div className="form-actions">
                  <button 
                    type="button" 
                    className="btn secondary-btn"
                    onClick={() => navigate('/')}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn primary-btn"
                    disabled={loading}
                  >
                    {loading ? 'Creating...' : 'Create Course'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AddCourse;
