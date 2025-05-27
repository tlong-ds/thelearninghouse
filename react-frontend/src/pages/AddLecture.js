import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import Header from '../components/Header';
import '../styles/AddLecture.css';

const AddLecture = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [course, setCourse] = useState(null);
  const [lectureData, setLectureData] = useState({
    title: '',
    description: '',
    content: '',
    video: null,
    attachments: [],
    quiz: {
      questions: []
    }
  });
  const [videoPreview, setVideoPreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    // Redirect if not an instructor
    if (currentUser && currentUser.role !== 'Instructor') {
      navigate('/courses');
      return;
    }

    // Fetch course details
    const fetchCourse = async () => {
      try {
        const response = await fetch(`http://localhost:8503/api/instructor/courses/${courseId}`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch course details');
        }

        const data = await response.json();
        setCourse(data);
      } catch (err) {
        setError('Failed to fetch course details');
        console.error('Error:', err);
      }
    };

    fetchCourse();
  }, [courseId, currentUser, navigate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLectureData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleQuizAdd = () => {
    setLectureData(prev => ({
      ...prev,
      quiz: {
        questions: [
          ...prev.quiz.questions,
          {
            question: '',
            options: ['', '', '', ''],
            correctAnswer: 0
          }
        ]
      }
    }));
  };

  const handleQuizQuestionChange = (index, field, value) => {
    setLectureData(prev => {
      const updatedQuestions = [...prev.quiz.questions];
      if (field === 'options') {
        updatedQuestions[index] = {
          ...updatedQuestions[index],
          options: value
        };
      } else if (field === 'correctAnswer') {
        updatedQuestions[index] = {
          ...updatedQuestions[index],
          correctAnswer: parseInt(value)
        };
      } else {
        updatedQuestions[index] = {
          ...updatedQuestions[index],
          [field]: value
        };
      }
      return {
        ...prev,
        quiz: {
          ...prev.quiz,
          questions: updatedQuestions
        }
      };
    });
  };

  const handleQuizQuestionRemove = (indexToRemove) => {
    setLectureData(prev => ({
      ...prev,
      quiz: {
        questions: prev.quiz.questions.filter((_, index) => index !== indexToRemove)
      }
    }));
  };

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 100 * 1024 * 1024) { // 100MB limit
        setError('Video file size must be less than 100MB');
        return;
      }
      if (!file.type.startsWith('video/')) {
        setError('Please upload a valid video file');
        return;
      }
      setLectureData(prev => ({ ...prev, video: file }));
      setVideoPreview(URL.createObjectURL(file));
      setError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Create FormData object to handle file upload
      const formData = new FormData();
      formData.append('title', lectureData.title);
      formData.append('description', lectureData.description);
      formData.append('content', lectureData.content);
      if (lectureData.video) {
        formData.append('video', lectureData.video);
      }
      formData.append('quiz', JSON.stringify(lectureData.quiz));

      const response = await fetch(`http://localhost:8503/api/courses/${courseId}/lectures`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        credentials: 'include',
        body: formData,
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      if (!response.ok) {
        throw new Error('Failed to create lecture');
      }

      navigate(`/manage-course/${courseId}`);
    } catch (err) {
      setError('Failed to create lecture. Please try again.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!course) {
    return (
      <div className="add-lecture-container">
        <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
        <div className="loading">Loading course details...</div>
      </div>
    );
  }

  return (
    <div className="add-lecture-container">
      <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
      
      <div className="add-lecture-content">
        <div className="add-lecture-header">
          <h1>Add New Lecture</h1>
          <p className="course-name">Course: {course.name}</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="add-lecture-form">
          <div className="form-group">
            <label htmlFor="title">Lecture Title</label>
            <input
              type="text"
              id="title"
              name="title"
              value={lectureData.title}
              onChange={handleInputChange}
              placeholder="Enter lecture title"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={lectureData.description}
              onChange={handleInputChange}
              placeholder="Enter lecture description"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="content">Content</label>
            <textarea
              id="content"
              name="content"
              value={lectureData.content}
              onChange={handleInputChange}
              placeholder="Enter lecture content (supports markdown)"
              className="content-textarea"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="video">Lecture Video</label>
            <div className="video-upload-section">
              <div className="video-upload-container">
                <input
                  type="file"
                  id="video"
                  name="video"
                  accept="video/*"
                  onChange={handleVideoChange}
                  className="video-input"
                />
                <label htmlFor="video" className="video-upload-label">
                  {!lectureData.video ? (
                    <div className="upload-placeholder">
                      <div className="upload-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="23 7 16 12 23 17 23 7"/>
                          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                        </svg>
                      </div>
                      <div className="upload-text">
                        <span className="primary-text">Drag & drop your video here</span>
                        <span className="secondary-text">or click to browse</span>
                      </div>
                      <div className="upload-info">
                        <span>Supports: MP4, WebM, MOV</span>
                        <span>Maximum size: 100MB</span>
                      </div>
                    </div>
                  ) : (
                    <div className="file-info">
                      <div className="file-preview">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <span className="file-name">{lectureData.video.name}</span>
                      </div>
                      <button
                        type="button"
                        className="remove-file"
                        onClick={(e) => {
                          e.preventDefault();
                          setLectureData(prev => ({ ...prev, video: null }));
                          setVideoPreview(null);
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </label>
              </div>

              {videoPreview && (
                <div className="video-preview-container">
                  <video 
                    controls 
                    src={videoPreview} 
                    className="preview-player"
                    poster={videoPreview}
                  />
                  <div className="video-info">
                    <span className="video-name">{lectureData.video.name}</span>
                    <span className="video-size">
                      {Math.round(lectureData.video.size / (1024 * 1024))}MB
                    </span>
                  </div>
                </div>
              )}

              {uploadProgress > 0 && loading && (
                <div className="upload-progress">
                  <div className="progress-details">
                    <span className="upload-status">Uploading video...</span>
                    <span className="progress-percentage">{uploadProgress}%</span>
                  </div>
                  <div className="progress-bar-container">
                    <div 
                      className="progress-bar" 
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="quiz-section">
            <div className="quiz-header">
              <h2>Quiz Questions</h2>
              <button 
                type="button" 
                onClick={handleQuizAdd}
                className="add-question-button"
              >
                Add Question
              </button>
            </div>

            {lectureData.quiz.questions.map((question, qIndex) => (
              <div key={qIndex} className="quiz-question">
                <div className="question-header">
                  <span className="question-number">Question {qIndex + 1}</span>
                  <button
                    type="button"
                    className="remove-question-button"
                    onClick={() => handleQuizQuestionRemove(qIndex)}
                  >
                    Remove
                  </button>
                </div>
                
                <input
                  type="text"
                  placeholder="Enter question"
                  value={question.question}
                  onChange={(e) => handleQuizQuestionChange(qIndex, 'question', e.target.value)}
                  className="question-input"
                />
                
                <div className="options-container">
                  {question.options.map((option, oIndex) => (
                    <div key={oIndex} className="option-group">
                      <div className="option-input">
                        <input
                          type="text"
                          placeholder={`Option ${oIndex + 1}`}
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...question.options];
                            newOptions[oIndex] = e.target.value;
                            handleQuizQuestionChange(qIndex, 'options', newOptions);
                          }}
                        />
                        <div className="correct-answer">
                          <input
                            type="radio"
                            name={`correct-${qIndex}`}
                            checked={question.correctAnswer === oIndex}
                            onChange={() => handleQuizQuestionChange(qIndex, 'correctAnswer', oIndex)}
                          />
                          <label>Correct Answer</label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              onClick={() => navigate(`/manage-course/${courseId}`)}
              className="secondary-btn"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="primary-btn"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Lecture'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddLecture;