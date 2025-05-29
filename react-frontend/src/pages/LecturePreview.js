import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { fetchLectureDetails, submitQuizAnswers } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import Header from '../components/Header';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // Import KaTeX CSS
import '../styles/LecturePreview.css';

const QuizSection = ({ quiz, lectureId }) => {
  const [quizStarted, setQuizStarted] = useState(false);
  const [userAnswers, setUserAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  
  const handleStartQuiz = () => {
    setQuizStarted(true);
    setUserAnswers({});
    setQuizResult(null);
  };
  
  const handleSubmit = async () => {
    try {
      const response = await submitQuizAnswers(lectureId, userAnswers);
      setQuizResult(response);
    } catch (err) {
      console.error('Failed to submit quiz:', err);
    }
  };
  
  // Debug quiz display
  console.log('Quiz being rendered:', quiz);
  
  if (!quiz?.questions) {
    return (
      <div className="quiz-intro">
        <h2>{quiz?.title || 'Quiz'}</h2>
        {quiz?.description && <p className="quiz-description">{quiz.description}</p>}
        <button className="start-quiz-btn" onClick={handleStartQuiz}>
          Take Quiz (No Questions Available)
        </button>
      </div>
    );
  }

  if (!quizStarted) {
    return (
      <div className="quiz-intro">
        <h2>{quiz.title || 'Quiz'}</h2>
        {quiz.description && <p className="quiz-description">{quiz.description}</p>}
        <button className="start-quiz-btn" onClick={handleStartQuiz}>
          Take Quiz
        </button>
      </div>
    );
  }
  
  if (quizResult) {
    return (
      <div className="quiz-section">
        <h2>Quiz Results</h2>
        <div className="quiz-result">
          <p>Score: {quizResult.score}%</p>
          <p>Correct Answers: {quizResult.correct_answers} out of {quizResult.total_questions}</p>
        </div>
        <button className="retry-quiz-btn" onClick={handleStartQuiz}>
          Retake Quiz
        </button>
      </div>
    );
  }
  
  return (
    <div className="quiz-section">
      <h2>{quiz.title}</h2>
      {quiz.description && <p className="quiz-description">{quiz.description}</p>}
      
      <div className="questions">
        {Object.entries(quiz.questions).map(([questionId, questionData]) => (
          <div key={questionId} className="question">
            <h3>{questionData.question}</h3>
            <div className="options">
              {questionData.options.map((option, idx) => (
                <label key={idx} className="option">
                  <input
                    type="radio"
                    name={`question_${questionId}`}
                    value={option}
                    onChange={(e) => setUserAnswers({
                      ...userAnswers,
                      [questionId]: e.target.value
                    })}
                    checked={userAnswers[questionId] === option}
                  />
                  {option}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <button
        className="submit-quiz"
        onClick={handleSubmit}
        disabled={Object.keys(userAnswers).length !== Object.keys(quiz.questions).length}
      >
        Submit Quiz
      </button>
    </div>
  );
};

const LecturePreview = () => {
  const { id } = useParams();
  const location = useLocation();
  const [lecture, setLecture] = useState(null);
  const [error, setError] = useState('');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const { currentUser, logout } = useAuth();
  const { startLoading, stopLoading, isLoading } = useLoading();
  const navigate = useNavigate();
  
  // Extract course information from navigation state
  const courseFromState = location.state || {};
  const courseName = courseFromState.courseName || 'Course Home';
  const courseId = courseFromState.courseId || 'unknown';
  
  useEffect(() => {
    const loadLectureData = async () => {
      try {
        startLoading('Loading lecture...');
        setError('');
        
        // Check if id is a valid string and can be parsed to a number
        if (!id || typeof id !== 'string' || id === '[object Object]') {
          throw new Error('Invalid lecture ID format');
        }
        
        // Make sure id is a number
        const lectureId = parseInt(id);
        if (isNaN(lectureId)) {
          throw new Error('Invalid lecture ID');
        }
        
        const lectureData = await fetchLectureDetails(lectureId);
        setLecture(lectureData);
      } catch (err) {
        setError(err.message);
        console.error('Error loading lecture:', err);
      } finally {
        stopLoading();
      }
    };

    if (id) {
      loadLectureData();
    }
  }, [id, startLoading, stopLoading]);
  

  
  // Create default lecture structure when no lecture is available
  const defaultLecture = {
    id: id || 'unknown',
    title: 'No Lecture Available',
    courseName: courseName,
    courseId: courseId,
    content: null,
    videoUrl: null,
    quiz: null,
    courseLectures: []
  };

  // Use actual lecture data if available, otherwise use default
  const displayLecture = lecture || defaultLecture;
  
  return (
    <div className="lecture-preview-container">
      <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
      
      <div className="lecture-preview-layout">
        {/* Course Navigation Sidebar */}
        <aside className={`course-sidebar ${!isSidebarOpen ? 'closed' : ''}`}>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!isSidebarOpen)}>
            <i className={`fas fa-${isSidebarOpen ? 'times' : 'bars'}`}></i>
          </button>
          <div className="course-nav-header">
            {lecture ? (
              <Link 
                to={currentUser?.role === 'Instructor' 
                  ? `/manage-course/${displayLecture.courseId}` 
                  : `/course/${displayLecture.courseId}`} 
                className="course-nav-title"
              >
                <i className="fas fa-chevron-left"></i>
                <span>{displayLecture.courseName}</span>
              </Link>
            ) : (
              <div className="course-nav-title">
                <button onClick={() => navigate('/courses')} className="course-nav-title">
                  <i className="fas fa-chevron-left"></i>
                  <span>{displayLecture.courseName}</span>
                </button>
              </div>
            )}
          </div>

          <nav className="lecture-nav">
            <ul className="lecture-nav-list">
              {displayLecture.courseLectures?.map((l, index) => (
                <li
                  key={l.id}
                  className={`lecture-nav-item ${parseInt(l.id) === parseInt(displayLecture.id) ? 'active' : ''}`}
                  onClick={() => navigate(`/lecture/${l.id}`, {
                    state: { 
                      courseName: displayLecture.courseName,
                      courseId: displayLecture.courseId
                    }
                  })}
                >
                  <span className="lecture-index">{index + 1}</span>
                  <span className="lecture-nav-title">{l.title}</span>
                </li>
              ))}
              {(!displayLecture.courseLectures || displayLecture.courseLectures.length === 0) && (
                <li className="lecture-nav-item empty">
                  <span className="empty-message">No lectures available</span>
                </li>
              )}
            </ul>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className={`lecture-main ${!isSidebarOpen ? 'sidebar-closed' : ''}`}>
          <div className="lecture-content-wrapper">
            <div className="lecture-header">
              <h1>{displayLecture.title}</h1>
              <div className="lecture-quick-actions">
                {lecture && (
                  <Link 
                    to={`/edumate?lectureId=${displayLecture.id}`} 
                    className="quick-action-btn ai-btn" 
                    title="Ask Edumate"
                  >
                    <i className="fas fa-robot"></i>
                  </Link>
                )}
                {lecture && displayLecture.quiz && (
                  <Link 
                    to={`/quiz/${displayLecture.id}`} 
                    className="quick-action-btn quiz-btn" 
                    title="Take Quiz"
                  >
                    <i className="fas fa-tasks"></i>
                  </Link>
                )}
              </div>
            </div>

            <div className="content-columns">
              {!lecture ? (
                <div className="no-lecture-container" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '60vh',
                  textAlign: 'center',
                  padding: '2rem'
                }}>
                  <div className="no-lecture-box" style={{
                    backgroundColor: '#f8f9fa',
                    border: '2px solid #e9ecef',
                    borderRadius: '12px',
                    padding: '3rem 2rem',
                    maxWidth: '400px',
                    width: '100%'
                  }}>
                    <i className="fas fa-graduation-cap" style={{
                      fontSize: '3rem',
                      color: '#6c757d',
                      marginBottom: '1.5rem'
                    }}></i>
                    <h2 style={{
                      fontSize: '1.5rem',
                      color: '#495057',
                      marginBottom: '2rem',
                      fontWeight: '600'
                    }}>
                      No lectures available
                    </h2>
                    <button 
                      onClick={() => navigate('/courses')} 
                      style={{
                        padding: '0.75rem 2rem',
                        backgroundColor: '#3498db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: '500',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseOver={(e) => e.target.style.backgroundColor = '#2980b9'}
                      onMouseOut={(e) => e.target.style.backgroundColor = '#3498db'}
                    >
                      Browse Courses
                    </button>
                  </div>
                </div>
              ) : (
                <div className="video-section">
                  <div className="video-container">
                    {displayLecture.videoUrl ? (
                      <video 
                        controls 
                        preload="metadata"
                        controlsList="nodownload"
                        playsInline
                      >
                        <source src={displayLecture.videoUrl} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    ) : (
                      <div className="placeholder-video">
                        <i className="fas fa-video-slash"></i>
                        <p>No video available for this lecture</p>
                      </div>
                    )}
                  </div>
                  <div className="notes-section">
                    <div className="notes-content">
                      {displayLecture.content ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]} 
                          rehypePlugins={[rehypeRaw, rehypeKatex]}
                        >
                          {displayLecture.content}
                        </ReactMarkdown>
                      ) : (
                        <div className="empty-notes">
                          <i className="fas fa-file-alt"></i>
                          <p>No notes available for this lecture.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LecturePreview;
