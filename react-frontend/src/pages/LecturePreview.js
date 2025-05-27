import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { fetchLectureDetails, submitQuizAnswers } from '../services/api';
import { useAuth } from '../services/AuthContext';
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
  const [lecture, setLecture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    const loadLectureData = async () => {
      try {
        setLoading(true);
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
        setLoading(false);
      }
    };

    if (id) {
      loadLectureData();
    }
  }, [id]);
  
  if (loading) {
    return (
      <div className="lecture-preview-container">
        <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
        <div className="loading">Loading lecture...</div>
      </div>
    );
  }
  
  if (error || !lecture) {
    return (
      <div className="lecture-preview-container">
        <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
        <div className="error-container">
          <div className="error">{error || 'Lecture not found'}</div>
          <button className="back-button" onClick={() => navigate('/courses')}>
            Back to Courses
          </button>
        </div>
      </div>
    );
  }
  
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
            <Link 
              to={currentUser?.role === 'Instructor' 
                ? `/manage-course/${lecture.courseId}` 
                : `/course/${lecture.courseId}`} 
              className="course-nav-title"
            >
              <i className="fas fa-chevron-left"></i>
              <span>{lecture.courseName || 'Course Home'}</span>
            </Link>
          </div>

          <nav className="lecture-nav">

            <ul className="lecture-nav-list">
              {lecture.courseLectures?.map((l, index) => (
                <li
                  key={l.id}
                  className={`lecture-nav-item ${parseInt(l.id) === parseInt(lecture.id) ? 'active' : ''}`}
                  onClick={() => navigate(`/lecture/${l.id}`)}
                >
                  <span className="lecture-index">{index + 1}</span>
                  <span className="lecture-nav-title">{l.title}</span>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className={`lecture-main ${!isSidebarOpen ? 'sidebar-closed' : ''}`}>
          <div className="lecture-content-wrapper">
            <div className="lecture-header">
              <h1>{lecture.title}</h1>
              <div className="lecture-quick-actions">
                <Link 
                  to={`/edumate?lectureId=${lecture.id}`} 
                  className="quick-action-btn ai-btn" 
                  title="Ask Edumate"
                >
                  <i className="fas fa-robot"></i>
                </Link>
                {lecture.quiz && (
                  <Link 
                    to={`/quiz/${lecture.id}`} 
                    className="quick-action-btn quiz-btn" 
                    title="Take Quiz"
                  >
                    <i className="fas fa-tasks"></i>
                  </Link>
                )}
              </div>
            </div>

            <div className="content-columns">
              <div className="video-section">
                <div className="video-container">
                  {lecture.videoUrl ? (
                    <video 
                      controls 
                      preload="metadata"
                      controlsList="nodownload"
                      playsInline
                    >
                      <source src={lecture.videoUrl} type="video/mp4" />
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
                    {lecture.content ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]} 
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                      >
                        {lecture.content}
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
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LecturePreview;
