import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { fetchLectureDetails, submitQuizAnswers } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import EdumateChat from '../components/EdumateChat';
import Header from '../components/Header';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // Import KaTeX CSS
import '../styles/LecturePreview.css';

const LecturePreview = () => {
  const { id } = useParams();
  const location = useLocation();
  const [lecture, setLecture] = useState(null);
  const [error, setError] = useState('');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState(null);
  const [isRightTabsExpanded, setRightTabsExpanded] = useState(false);
  const [isChatActive, setChatActive] = useState(false);
  const chatRef = useRef(null);
  const { currentUser, logout } = useAuth();
  const { startLoading, stopLoading, isLoading } = useLoading();
  const navigate = useNavigate();
  
  // Handle tab interactions
  const handleTabClick = (tabName) => {
    if (activeTab === tabName && isRightTabsExpanded) {
      // Close if clicking the same active tab
      setActiveTab(null);
      setRightTabsExpanded(false);
      setChatActive(false);
    } else {
      // Open or switch tab
      setActiveTab(tabName);
      setRightTabsExpanded(true);
      // Reset chat state when switching tabs
      if (tabName !== 'chatbot') {
        setChatActive(false);
      }
    }
  };

  const closeRightTabs = () => {
    setActiveTab(null);
    setRightTabsExpanded(false);
    setChatActive(false);
  };

  const startChat = () => {
    setChatActive(true);
  };

  // Handle sidebar toggle with blur effect
  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen);
    // Close right tabs when opening sidebar to prevent conflicts
    if (!isSidebarOpen && isRightTabsExpanded) {
      setActiveTab(null);
      setRightTabsExpanded(false);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (event, action, ...args) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action(...args);
    }
  };

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
        {/* Left Sidebar - Course Navigation */}
        <aside className={`course-sidebar ${!isSidebarOpen ? 'closed' : ''}`}>
          <button 
            className="sidebar-toggle" 
            onClick={toggleSidebar} 
            onKeyDown={(e) => handleKeyDown(e, toggleSidebar)}
            aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            aria-expanded={isSidebarOpen}
          >
            <i className={`fas fa-${isSidebarOpen ? 'chevron-left' : 'chevron-right'}`}></i>
          </button>
          
          <div className="course-nav-header">
            {lecture ? (
              <Link 
                to={currentUser?.role === 'Instructor' 
                  ? `/manage-course/${displayLecture.courseId}` 
                  : `/course/${displayLecture.courseId}`} 
                className="course-nav-title"
              >
                <i className="fas fa-arrow-left"></i>
                <span>{displayLecture.courseName}</span>
              </Link>
            ) : (
              <button onClick={() => navigate('/courses')} className="course-nav-title">
                <i className="fas fa-arrow-left"></i>
                <span>{displayLecture.courseName}</span>
              </button>
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
                  onKeyDown={(e) => handleKeyDown(e, () => navigate(`/lecture/${l.id}`, {
                    state: { 
                      courseName: displayLecture.courseName,
                      courseId: displayLecture.courseId
                    }
                  }))}
                  tabIndex={0}
                  role="button"
                  aria-label={`Go to lecture ${index + 1}: ${l.title}`}
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
        <main className={`lecture-main ${!isSidebarOpen ? 'sidebar-closed' : ''} ${isRightTabsExpanded ? 'right-tabs-expanded' : ''}`}>
          <div className="lecture-main-wrapper">
            <div className="lecture-content-wrapper">
              {/* Header with centered title only */}
              <div className="lecture-header">
                <h1>{displayLecture.title}</h1>
              </div>

              {/* Main Layout with Video and Right Tabs */}
              <div className="content-layout">
              {/* Central Video and Content Section */}
              <div className="video-content-section">
                {!lecture ? (
                  <div className="no-lecture-container">
                    <div className="no-lecture-box">
                      <i className="fas fa-graduation-cap"></i>
                      <h2>No lectures available</h2>
                      <button 
                        onClick={() => navigate('/courses')} 
                        className="browse-courses-btn"
                      >
                        Browse Courses
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Video Container */}
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
                  </>
                )}
              </div>

              {/* Mobile Horizontal Tabs (Dashboard-style) - Only shown on mobile */}
              <div className="mobile-tabs-container">
                <div className="mobile-tabs-header">
                  {lecture && (
                    <button 
                      className={`mobile-tab ${activeTab === 'chatbot' ? 'active' : ''}`}
                      onClick={() => handleTabClick('chatbot')}
                      onKeyDown={(e) => handleKeyDown(e, handleTabClick, 'chatbot')}
                      title="Ask Edumate"
                      aria-label="Ask Edumate"
                      aria-pressed={activeTab === 'chatbot'}
                    >
                      <i className="fas fa-robot"></i>
                      <span>Edumate</span>
                    </button>
                  )}
                  {lecture && displayLecture.content && (
                    <button 
                      className={`mobile-tab ${activeTab === 'content' ? 'active' : ''}`}
                      onClick={() => handleTabClick('content')}
                      onKeyDown={(e) => handleKeyDown(e, handleTabClick, 'content')}
                      title="Lecture Notes"
                      aria-label="Lecture Notes"
                      aria-pressed={activeTab === 'content'}
                    >
                      <i className="fas fa-file-text"></i>
                      <span>Notes</span>
                    </button>
                  )}
                  {lecture && displayLecture.quiz && (
                    <button 
                      className={`mobile-tab ${activeTab === 'quiz' ? 'active' : ''}`}
                      onClick={() => handleTabClick('quiz')}
                      onKeyDown={(e) => handleKeyDown(e, handleTabClick, 'quiz')}
                      title="Take Quiz"
                      aria-label="Take Quiz"
                      aria-pressed={activeTab === 'quiz'}
                    >
                      <i className="fas fa-tasks"></i>
                      <span>Quiz</span>
                    </button>
                  )}
                </div>

                {activeTab && (
                  <div className="mobile-tab-content">
                    {activeTab === 'content' && (
                      <div className="content-tab">
                        {displayLecture.content ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]} 
                            rehypePlugins={[rehypeRaw, rehypeKatex]}
                            className="lecture-content"
                          >
                            {displayLecture.content}
                          </ReactMarkdown>
                        ) : (
                          <div className="empty-content">
                            <i className="fas fa-file-alt"></i>
                            <p>No notes available for this lecture.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'chatbot' && (
                      <div className="chatbot-tab">
                        {!isChatActive ? (
                          <div className="chatbot-placeholder">
                            <i className="fas fa-robot"></i>
                            <h4>Ask Edumate</h4>
                            <p>Get instant help with your questions about this lecture</p>
                            <button 
                              onClick={startChat}
                              className="chat-action-btn"
                            >
                              Start Conversation
                            </button>
                          </div>
                        ) : (
                          <div className="embedded-chat-container">
                            <EdumateChat 
                                ref={chatRef}
                              lectureId={displayLecture.id} 
                              isEmbedded={true}
                              className="lecture-chat"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'quiz' && (
                      <div className="quiz-tab">
                        {displayLecture.quiz ? (
                          <div className="quiz-placeholder">
                            <i className="fas fa-tasks"></i>
                            <h4>Quiz Available</h4>
                            <p>Test your knowledge of this lecture</p>
                            <Link 
                              to={`/quiz/${displayLecture.id}`}
                              className="quiz-action-btn"
                            >
                              Start Quiz
                            </Link>
                          </div>
                        ) : (
                          <div className="quiz-placeholder">
                            <i className="fas fa-tasks"></i>
                            <h4>Quiz</h4>
                            <p>Test your knowledge of this lecture</p>
                            <button className="quiz-action-btn" disabled>
                              No Quiz Available
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Side Expandable Tabs */}
              <div className={`right-tabs-container ${isRightTabsExpanded ? 'expanded' : ''}`}>
                <div className="tabs-toggle-area">
                  {lecture && (
                    <button 
                      className={`tab-toggle ${activeTab === 'chatbot' ? 'active' : ''}`}
                      onClick={() => handleTabClick('chatbot')}
                      onKeyDown={(e) => handleKeyDown(e, handleTabClick, 'chatbot')}
                      title="Ask Edumate"
                      aria-label="Ask Edumate"
                      aria-pressed={activeTab === 'chatbot'}
                    >
                      <i className="fas fa-robot"></i>
                    </button>
                  )}
                  {lecture && displayLecture.content && (
                    <button 
                      className={`tab-toggle ${activeTab === 'content' ? 'active' : ''}`}
                      onClick={() => handleTabClick('content')}
                      onKeyDown={(e) => handleKeyDown(e, handleTabClick, 'content')}
                      title="Lecture Notes"
                      aria-label="Lecture Notes"
                      aria-pressed={activeTab === 'content'}
                    >
                      <i className="fas fa-file-text"></i>
                    </button>
                  )}
                  {lecture && displayLecture.quiz && (
                    <button 
                      className={`tab-toggle ${activeTab === 'quiz' ? 'active' : ''}`}
                      onClick={() => handleTabClick('quiz')}
                      onKeyDown={(e) => handleKeyDown(e, handleTabClick, 'quiz')}
                      title="Take Quiz"
                      aria-label="Take Quiz"
                      aria-pressed={activeTab === 'quiz'}
                    >
                      <i className="fas fa-tasks"></i>
                    </button>
                  )}
                </div>

                <div className="tabs-content">
                  <div className="tab-content-header">
                    <h3>
                      {activeTab === 'content' && 'Lecture Notes'}
                      {activeTab === 'chatbot' && 'Ask Edumate'}
                      {activeTab === 'quiz' && 'Quiz'}
                    </h3>
                    <div className="tab-header-buttons">
                      {activeTab === 'chatbot' && isChatActive && (
                        <button 
                          className="clear-chat-btn" 
                          onClick={() => {
                            // Use the ref to call the clearChat method
                            if (chatRef.current) {
                              chatRef.current.clearChat();
                            }
                          }}
                          title="Clear Chat"
                          aria-label="Clear Chat"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="tab-content-body">
                    {activeTab === 'content' && (
                      <div className="content-tab">
                        {displayLecture.content ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]} 
                            rehypePlugins={[rehypeRaw, rehypeKatex]}
                            className="lecture-content"
                          >
                            {displayLecture.content}
                          </ReactMarkdown>
                        ) : (
                          <div className="empty-content">
                            <i className="fas fa-file-alt"></i>
                            <p>No notes available for this lecture.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'chatbot' && (
                      <div className="chatbot-tab">
                        {!isChatActive ? (
                          <div className="chatbot-placeholder">
                            <i className="fas fa-robot"></i>
                            <h4>Ask Edumate</h4>
                            <p>Get instant help with your questions about this lecture</p>
                            <button 
                              onClick={startChat}
                              className="chat-action-btn"
                            >
                              Start Conversation
                            </button>
                          </div>
                        ) : (
                          <div className="embedded-chat-container">
                            <EdumateChat 
                              ref={chatRef}
                              lectureId={displayLecture.id} 
                              isEmbedded={true}
                              className="lecture-chat"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'quiz' && (
                      <div className="quiz-tab">
                        {displayLecture.quiz ? (
                          <div className="quiz-placeholder">
                            <i className="fas fa-tasks"></i>
                            <h4>Quiz Available</h4>
                            <p>Test your knowledge of this lecture</p>
                            <Link 
                              to={`/quiz/${displayLecture.id}`}
                              className="quiz-action-btn"
                            >
                              Start Quiz
                            </Link>
                          </div>
                        ) : (
                          <div className="quiz-placeholder">
                            <i className="fas fa-tasks"></i>
                            <h4>Quiz</h4>
                            <p>Test your knowledge of this lecture</p>
                            <button className="quiz-action-btn" disabled>
                              No Quiz Available
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
