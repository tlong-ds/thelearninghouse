import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { fetchLectureDetails } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import EdumateChat from '../components/EdumateChat';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import '../styles/LecturePreview.css';

const LecturePreview = () => {
  const { id } = useParams();
  const location = useLocation();
  const [lecture, setLecture] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('navigation'); // Tab state for sidebar
  const { currentUser } = useAuth();
  const { startLoading, stopLoading } = useLoading();
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
    description: 'This course doesn\'t have any lectures yet, or the lecture you\'re looking for doesn\'t exist.',
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
      {/* Main Content with YouTube-like Layout */}
      <div className="lecture-main-content">
        
        {/* Left Side - Video and Content Area */}
        <div className="video-content-area">
          
          {/* Back Button */}
          <div className="back-button-container">
            <button 
              className="back-button"
              onClick={() => {
                if (currentUser?.role === 'Instructor') {
                  navigate(`/manage-course/${displayLecture.courseId}`);
                } else {
                  navigate(`/course/${displayLecture.courseId}`);
                }
              }}
            >
              <i className="fas fa-arrow-left"></i>
            </button>
          </div>
          
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
                <i className="fas fa-video"></i>
                <p>No video available for this lecture</p>
              </div>
            )}
          </div>

          {/* Lecture Info */}
          <div className="lecture-info">
            <h1 className="lecture-title">{displayLecture.title}</h1>
            {displayLecture.description && (
              <p className="lecture-description">{displayLecture.description}</p>
            )}
          </div>
        </div>

        {/* Right Sidebar - Tab System */}
        <div className="lecture-sidebar">
          
          {/* Spacer to align with back button */}
          <div className="sidebar-spacer"></div>
          
          {/* Tab Navigation */}
          <div className="sidebar-tabs">
            <button 
              className={`tab-button ${activeTab === 'navigation' ? 'active' : ''}`}
              onClick={() => setActiveTab('navigation')}
            >
              <i className="fas fa-list"></i>
              <span>Navigation</span>
            </button>
            <button 
              className={`tab-button ${activeTab === 'content' ? 'active' : ''}`}
              onClick={() => setActiveTab('content')}
            >
              <i className="fas fa-file-text"></i>
              <span>Content</span>
            </button>
            <button 
              className={`tab-button ${activeTab === 'quiz' ? 'active' : ''}`}
              onClick={() => setActiveTab('quiz')}
            >
              <i className="fas fa-clipboard-list"></i>
              <span>Quiz</span>
            </button>
            <button 
              className={`tab-button ${activeTab === 'chatbot' ? 'active' : ''}`}
              onClick={() => setActiveTab('chatbot')}
            >
              <i className="fas fa-comments"></i>
              <span>Ask Edumate</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="tab-content">
            <div className={`tab-content-inner ${activeTab === 'chatbot' ? 'no-padding' : ''} ${activeTab === 'navigation' ? 'navigation-tab-content' : ''}`}>
              
              {/* Navigation Tab */}
              {activeTab === 'navigation' && (
                <>
                  {displayLecture.courseLectures && displayLecture.courseLectures.length > 0 ? (
                    displayLecture.courseLectures.map((l, index) => (
                      <div
                        key={l.id}
                        className={`lecture-nav-item ${parseInt(l.id) === parseInt(displayLecture.id) ? 'active' : ''}`}
                        onClick={() => navigate(`/lecture/${l.id}`, {
                          state: { 
                            courseName: displayLecture.courseName,
                            courseId: displayLecture.courseId
                          }
                        })}
                      >
                        <div className="lecture-index">{index + 1}</div>
                        <div className="lecture-nav-title">{l.title}</div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-message">
                      No lectures available in this course
                    </div>
                  )}
                </>
              )}

              {/* Content Tab */}
              {activeTab === 'content' && (
                <div className="content-tab">
                  <h3>Lecture Content</h3>
                  {displayLecture.content ? (
                    <div className="lecture-content">
                      <ReactMarkdown
                        children={displayLecture.content}
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                        remarkPlugins={[remarkGfm, remarkMath]}
                        components={{
                          h1: ({node, ...props}) => <h1 style={{color: '#1d1d1f', fontSize: '20px', marginBottom: '12px'}} {...props} />,
                          h2: ({node, ...props}) => <h2 style={{color: '#1d1d1f', fontSize: '18px', marginBottom: '10px'}} {...props} />,
                          h3: ({node, ...props}) => <h3 style={{color: '#1d1d1f', fontSize: '16px', marginBottom: '8px'}} {...props} />,
                          p: ({node, ...props}) => <p style={{color: '#86868b', lineHeight: '1.5', marginBottom: '12px'}} {...props} />,
                          code: ({node, inline, ...props}) => 
                            inline ? 
                            <code style={{background: '#f5f5f7', padding: '2px 4px', borderRadius: '4px', fontSize: '13px'}} {...props} /> :
                            <code style={{background: '#f5f5f7', padding: '12px', borderRadius: '8px', display: 'block', fontSize: '13px'}} {...props} />
                        }}
                      />
                    </div>
                  ) : (
                    <p style={{color: '#86868b'}}>No content available for this lecture.</p>
                  )}
                </div>
              )}

              {/* Chatbot Tab */}
              {activeTab === 'chatbot' && (
                <div className="chatbot-tab">
                  <EdumateChat 
                    lectureId={displayLecture.id} 
                    isEmbedded={true} 
                    className="lecture-chat"
                  />
                </div>
              )}

              {/* Quiz Tab */}
              {activeTab === 'quiz' && (
                displayLecture.quiz ? (
                  <div className="quiz-tab">
                    <div className="quiz-available">
                      <div className="quiz-info">
                        <i className="fas fa-clipboard-list"></i>
                        <h3>Quiz Available</h3>
                        <p>Test your knowledge with the quiz for this lecture.</p>
                      </div>
                      <button 
                        className="start-quiz-btn"
                        onClick={() => navigate(`/quiz/${displayLecture.id}`, {
                          state: { 
                            lectureId: displayLecture.id,
                            lectureTitle: displayLecture.title,
                            courseName: displayLecture.courseName,
                            courseId: displayLecture.courseId
                          }
                        })}
                      >
                        <i className="fas fa-play"></i>
                        Start Quiz
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="quiz-tab">
                    <div className="no-quiz">
                      <i className="fas fa-clipboard-list"></i>
                      <p>No quiz available for this lecture.</p>
                    </div>
                  </div>
                )
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LecturePreview;
