import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLoading } from '../services/LoadingContext';
import config from '../config';
import VideoUploader from '../utils/videoUploader';
import '../styles/AddLecture.css';

const AddLecture = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { startLoading, updateMessage, stopLoading } = useLoading();
  
  const [course, setCourse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [uploadId, setUploadId] = useState(null);
  const [processStage, setProcessStage] = useState(null);
  
  // Track stage progress for better UX in two-step workflow
  const updateStageProgress = (stage, status, percent) => {
    setProcessStage({ stage, status, percent });
    
    // Provide detailed stage messages
    let message = '';
    switch (stage) {
      case 'creating':
        if (status === 'processing') {
          message = percent < 30 ? 'Preparing lecture data...' : 'Saving lecture to database...';
        } else if (status === 'completed') {
          message = 'Lecture created successfully!';
        }
        break;
      case 'videoUpload':
        if (status === 'processing') {
          if (percent < 10) {
            message = 'Initializing video upload...';
          } else if (percent < 90) {
            message = `Uploading video... ${percent}%`;
          } else {
            message = 'Finalizing video upload...';
          }
        } else if (status === 'completed') {
          message = 'Video uploaded successfully!';
        } else if (status === 'failed') {
          message = 'Video upload failed';
        }
        break;
      case 'completed':
        message = 'All done!';
        break;
      case 'failed':
        message = 'Operation failed';
        break;
      default:
        message = 'Processing...';
    }
    
    // Update loading message if we have access to it
    if (typeof updateMessage === 'function') {
      updateMessage(message);
    }
  };
  
  const [lectureData, setLectureData] = useState({
    title: '',
    description: '',
    content: '',
    video: null,
    quiz: {
      questions: []
    }
  });

  // Fetch course data for form context
  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const response = await fetch(`${config.API_URL}/api/instructor/courses/${courseId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch course');
        }
        
        const data = await response.json();
        setCourse(data);
      } catch (err) {
        console.error('Error fetching course:', err);
        setError('Failed to load course information. Please try again.');
      }
    };
    
    fetchCourse();
  }, [courseId]);
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLectureData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file size (max 500MB with chunked upload support)
    if (file.size > 500 * 1024 * 1024) {
      setError('Video file size must be less than 500MB');
      return;
    }
    
    // Validate file type
    if (!file.type.startsWith('video/')) {
      setError('Please upload a valid video file');
      return;
    }
    
    setLectureData(prev => ({
      ...prev,
      video: file
    }));
    
    // Create preview URL
    const objectUrl = URL.createObjectURL(file);
    setVideoPreview(objectUrl);
    
    // Clear error if any
    setError(null);
    
    return () => URL.revokeObjectURL(objectUrl);
  };
  
  // Quiz handling functions
  const handleQuizAdd = () => {
    setLectureData(prev => ({
      ...prev,
      quiz: {
        ...prev.quiz,
        questions: [
          ...prev.quiz.questions,
          {
            question: '',
            options: ['', ''],
            correctAnswer: 0
          }
        ]
      }
    }));
  };
  
  const handleQuizQuestionChange = (index, field, value) => {
    const updatedQuestions = [...lectureData.quiz.questions];
    updatedQuestions[index] = {
      ...updatedQuestions[index],
      [field]: value
    };
    
    setLectureData(prev => ({
      ...prev,
      quiz: {
        ...prev.quiz,
        questions: updatedQuestions
      }
    }));
  };
  
  const handleQuizOptionChange = (qIndex, oIndex, value) => {
    const updatedQuestions = [...lectureData.quiz.questions];
    const options = [...updatedQuestions[qIndex].options];
    options[oIndex] = value;
    
    updatedQuestions[qIndex] = {
      ...updatedQuestions[qIndex],
      options
    };
    
    setLectureData(prev => ({
      ...prev,
      quiz: {
        ...prev.quiz,
        questions: updatedQuestions
      }
    }));
  };
  
  const handleQuizOptionAdd = (qIndex) => {
    const updatedQuestions = [...lectureData.quiz.questions];
    updatedQuestions[qIndex].options.push('');
    
    setLectureData(prev => ({
      ...prev,
      quiz: {
        ...prev.quiz,
        questions: updatedQuestions
      }
    }));
  };
  
  const handleQuizOptionRemove = (qIndex, oIndex) => {
    const updatedQuestions = [...lectureData.quiz.questions];
    updatedQuestions[qIndex].options.splice(oIndex, 1);
    
    // Update correctAnswer if needed
    if (updatedQuestions[qIndex].correctAnswer >= updatedQuestions[qIndex].options.length) {
      updatedQuestions[qIndex].correctAnswer = 0;
    }
    
    setLectureData(prev => ({
      ...prev,
      quiz: {
        ...prev.quiz,
        questions: updatedQuestions
      }
    }));
  };
  
  const handleQuizQuestionRemove = (qIndex) => {
    const updatedQuestions = [...lectureData.quiz.questions];
    updatedQuestions.splice(qIndex, 1);
    
    setLectureData(prev => ({
      ...prev,
      quiz: {
        ...prev.quiz,
        questions: updatedQuestions
      }
    }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form data
    if (!lectureData.title.trim() || !lectureData.description.trim() || !lectureData.content.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    
    // Validate quiz if present
    if (lectureData.quiz.questions.length > 0) {
      const invalidQuestions = lectureData.quiz.questions.filter(q => 
        !q.question.trim() || 
        q.options.some(o => !o.trim()) ||
        q.options.length < 2
      );
      
      if (invalidQuestions.length > 0) {
        setError('Please fill in all quiz questions and options');
        return;
      }
    }
    
    setIsLoading(true);
    setError(null);
    
    // Start loading screen with two-step workflow
    startLoading('Creating lecture...');
    setProcessStage({ stage: 'creating', status: 'processing', percent: 0 });
    
    try {
      // Step 1: Create lecture without video
      updateStageProgress('creating', 'processing', 10);
      updateMessage('Creating lecture in database...');
      
      const formData = new FormData();
      formData.append('title', lectureData.title);
      formData.append('description', lectureData.description);
      formData.append('content', lectureData.content);
      
      // Add quiz data if present (but no video)
      if (lectureData.quiz.questions.length > 0) {
        formData.append('quiz', JSON.stringify(lectureData.quiz));
      }

      updateStageProgress('creating', 'processing', 30);

      const response = await fetch(`${config.API_URL}/api/courses/${courseId}/lectures`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create lecture: ${response.status} ${errorText}`);
      }
      
      const lectureResponse = await response.json();
      const lectureId = lectureResponse.id;
      
      updateStageProgress('creating', 'completed', 50);
      updateMessage('Lecture created successfully!');
      
      // Step 2: Handle video upload separately if present
      if (lectureData.video) {
        updateStageProgress('videoUpload', 'processing', 0);
        updateMessage('Uploading video...');
        
        try {
          await VideoUploader.uploadVideo(
            lectureData.video,
            courseId,
            lectureId,
            (progress) => {
              // Map video upload progress to the remaining 50% of total progress
              const mappedProgress = 50 + (progress / 2); // 50% to 100%
              updateStageProgress('videoUpload', 'processing', progress);
              // Update overall loading message progress
              if (progress === 100) {
                updateMessage('Video upload completed!');
              } else {
                updateMessage(`Uploading video... ${progress}%`);
              }
            },
            (errorMsg) => {
              console.error('Video upload error:', errorMsg);
              updateStageProgress('videoUpload', 'failed', 100);
              setError(`Lecture created successfully, but video upload failed: ${errorMsg}. You can upload the video later.`);
              // Still proceed to completion since lecture was created
            },
            (result) => {
              updateStageProgress('videoUpload', 'completed', 100);
              updateMessage('Video uploaded successfully!');
              console.log('Video upload complete:', result);
            }
          );
        } catch (videoError) {
          console.error('Video upload error:', videoError);
          updateStageProgress('videoUpload', 'failed', 100);
          setError(`Lecture created successfully, but video upload failed: ${videoError.message}. You can upload the video later.`);
          // Still proceed to completion since lecture was created
        }
      }

      // All stages completed (even if video upload failed, lecture was created)
      setProcessStage({ stage: 'completed', status: 'completed', percent: 100 });
      updateMessage(
        lectureData.video && processStage?.stage !== 'failed' ? 
        'Lecture and video uploaded successfully!' : 
        'Lecture created successfully!'
      );
      
      // Navigate after a short delay to show completion
      setTimeout(() => {
        stopLoading();
        navigate(`/manage-course/${courseId}`);
      }, 1500);

    } catch (err) {
      console.error('Error creating lecture:', err);
      setError(`Failed to create lecture: ${err.message}`);
      setProcessStage({ stage: 'failed', status: 'failed', percent: 0 });
      stopLoading();
      setIsLoading(false);
    }
  };

  return (
    <div className="add-lecture-container">
      <div className="add-lecture-content">
        <div className="add-lecture-header">
          <h1>Add New Lecture</h1>
          {course && <p className="course-name">Course: {course.name}</p>}
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
                        <span>Maximum size: 500MB</span>
                        {lectureData.video && (
                          <span className="upload-note">Video will upload after lecture creation</span>
                        )}
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
                  />
                  <div className="video-info">
                    <span className="video-name">{lectureData.video.name}</span>
                    <span className="video-size">
                      {Math.round(lectureData.video.size / (1024 * 1024))}MB
                      {lectureData.video.size > 10 * 1024 * 1024 && (
                        <span className="upload-method"> (chunked upload)</span>
                      )}
                    </span>
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
                          onChange={(e) => handleQuizOptionChange(qIndex, oIndex, e.target.value)}
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
                      
                      {question.options.length > 2 && (
                        <button
                          type="button"
                          className="remove-option-button"
                          onClick={() => handleQuizOptionRemove(qIndex, oIndex)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  
                  <button
                    type="button"
                    className="add-option-button"
                    onClick={() => handleQuizOptionAdd(qIndex)}
                  >
                    Add Option
                  </button>
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
              disabled={isLoading}
            >
              {isLoading ? (
                processStage?.stage === 'creating' ? 'Creating Lecture...' :
                processStage?.stage === 'videoUpload' ? 'Uploading Video...' :
                'Processing...'
              ) : (
                lectureData.video ? 'Create Lecture & Upload Video' : 'Create Lecture'
              )}
            </button>
          </div>


        </form>
      </div>
    </div>
  );
};

export default AddLecture;