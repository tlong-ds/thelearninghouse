import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../services/AuthContext';
import Header from '../components/Header';
import { sendChatMessage, clearChatHistory } from '../services/chatbotAPI';
import '../styles/Edumate.css';
import '../styles/markdown.css';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

const Edumate = () => {
  const { currentUser, logout } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lectureId, setLectureId] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Handle window resize and mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    const handleViewportChange = () => {
      // Detect virtual keyboard on mobile
      if (window.innerWidth <= 768) {
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const windowHeight = window.innerHeight;
        setIsKeyboardVisible(viewportHeight < windowHeight * 0.8);
      }
    };

    window.addEventListener('resize', handleResize);
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
      }
    };
  }, []);

  // Enhanced mobile scroll behavior
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      // Use different scroll behavior for mobile vs desktop
      const behavior = isMobile ? 'auto' : 'smooth';
      messagesEndRef.current.scrollIntoView({ 
        behavior, 
        block: 'end', 
        inline: 'nearest' 
      });
    }
  };

  // Auto scroll with mobile optimization
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      scrollToBottom();
    }, isMobile ? 100 : 300);

    return () => clearTimeout(timeoutId);
  }, [messages, isMobile]);

  // Handle mobile keyboard visibility
  useEffect(() => {
    if (isKeyboardVisible && inputRef.current) {
      // Small delay to ensure keyboard is fully visible
      setTimeout(() => {
        scrollToBottom();
      }, 200);
    }
  }, [isKeyboardVisible]);

  // Extract lectureId from URL query parameters and load chat history
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const lecId = queryParams.get('lectureId');
    setLectureId(lecId);
    
    const loadChatHistory = async () => {
      setLoading(true);
      try {
        // Import dynamically to avoid circular dependencies
        const { getChatHistory } = await import('../services/chatbotAPI');
        console.log(`Fetching chat history for ${lecId ? `lecture ${lecId}` : 'general chat'}`);
        
        const response = await getChatHistory(lecId);
        console.log('Chat history response:', response);
        
        if (response?.history && Array.isArray(response.history) && response.history.length > 0) {
          console.log(`Found ${response.history.length} messages in history`);
          
          // Map the response history to our local format
          const formattedHistory = response.history.map((msg, index) => ({
            id: Date.now() - (response.history.length - index),
            content: msg.content,
            isUser: Boolean(msg.is_user),
            timestamp: new Date().toLocaleTimeString()
          }));
          
          setMessages(formattedHistory);
        } else {
          console.log('No cached history found, showing welcome message');
          setMessages([{
            id: Date.now(),
            content: lecId 
              ? `# Welcome to Lecture Mode\n\nI'm ready to answer questions about this lecture. What would you like to know?`
              : `# Welcome to Edumate\n\nI'm your learning assistant. Feel free to ask me anything about your learning!`,
            isUser: false,
            timestamp: new Date().toLocaleTimeString()
          }]);
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
        setMessages([{
          id: Date.now(),
          content: lecId 
            ? `# Welcome to Lecture Mode\n\nI'm ready to answer questions about this lecture. What would you like to know?`
            : `# Welcome to Edumate\n\nI'm your learning assistant. Feel free to ask me anything about your learning!`,
          isUser: false,
          timestamp: new Date().toLocaleTimeString()
        }]);
      } finally {
        setLoading(false);
      }
    };
    
    loadChatHistory();
  }, [location.search]);

  // Enhanced message addition with mobile optimization
  const addMessage = (content, isUser = false) => {
    const newMessage = {
      id: Date.now(),
      content,
      isUser,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setMessages(prev => [...prev, newMessage]);
    
    // Immediate scroll for mobile, delayed for desktop
    if (isMobile) {
      setTimeout(scrollToBottom, 50);
    }
  };

  // Enhanced message handling with better mobile UX
  const handleSendMessage = async (message) => {
    if (!message.trim()) return;

    // Blur input on mobile to hide keyboard
    if (isMobile && inputRef.current) {
      inputRef.current.blur();
    }

    // Create user message with proper formatting
    const userMessage = {
      id: Date.now(),
      content: message.trim(),
      isUser: true,
      timestamp: new Date().toLocaleTimeString()
    };
    
    // Add user message to UI immediately
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      // Send to API and get response (will be cached server-side)
      const response = await sendChatMessage(message, lectureId);
      
      // Add only the bot response to the UI (don't reload entire history)
      const botMessage = {
        id: Date.now(),
        content: response.answer,
        isUser: false,
        timestamp: new Date().toLocaleTimeString()
      };
      
      // Append bot message to existing messages
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [...prev, {
        id: Date.now(),
        content: "I apologize, but I encountered an error processing your message. Please try again.",
        isUser: false,
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setLoading(true);

    // Blur input on mobile to hide keyboard
    if (isMobile && inputRef.current) {
      inputRef.current.blur();
    }

    // Create message object with exact formatting
    const newUserMessage = {
      id: Date.now(),
      content: userMessage,
      isUser: true,
      timestamp: new Date().toLocaleTimeString()
    };

    try {
      // Add user message immediately for better UX
      setMessages(prev => [...prev, newUserMessage]);
      
      // Mobile-specific scroll timing
      if (isMobile) {
        setTimeout(scrollToBottom, 100);
      }
      
      // Get response without reloading full history
      const response = await sendChatMessage(userMessage, lectureId);
      
      // Add just the bot response
      const botMessage = {
        id: Date.now(),
        content: response.answer,
        isUser: false,
        timestamp: new Date().toLocaleTimeString()
      };
      
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        id: Date.now(),
        content: error.message || "I'm sorry, I'm having trouble responding right now. Please try again later.",
        isUser: false,
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    // Immediately clear UI for better UX
    setMessages([{
      id: Date.now(),
      content: lectureId 
        ? `# Welcome to Lecture Mode\n\nI'm ready to answer questions about this lecture. What would you like to know?`
        : `# Welcome to Edumate\n\nI'm your learning assistant. Feel free to ask me anything about your learning!`,
      isUser: false,
      timestamp: new Date().toLocaleTimeString()
    }]);
    
    // Scroll to top on mobile after clearing
    if (isMobile) {
      setTimeout(() => {
        const messagesContainer = document.querySelector('.messages-container');
        if (messagesContainer) {
          messagesContainer.scrollTop = 0;
        }
      }, 100);
    }
    
    // Clear backend cache without waiting
    import('../services/chatbotAPI').then(({ clearChatHistory }) => {
      console.log(`Clearing chat history for ${lectureId ? `lecture ${lectureId}` : 'general chat'}`);
      clearChatHistory(lectureId)
        .then(() => console.log('Chat history cleared successfully'))
        .catch(err => console.error('Failed to clear chat history:', err));
    });
  };

  // Enhanced navigation for mobile
  const handleReturnToLecture = () => {
    if (isMobile) {
      // Use replace on mobile for better navigation
      navigate(`/lecture/${lectureId}`, { replace: true });
    } else {
      navigate(`/lecture/${lectureId}`);
    }
  };

  const handleExitLectureMode = () => {
    setLectureId(null);
    navigate('/edumate', { replace: true });
    setMessages([{
      id: Date.now(),
      content: `# Switched to General Mode\n\nI'm now in general mode and can answer questions about any topic in your courses. How can I help you?`,
      isUser: false,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className={`edumate-container ${isMobile ? 'mobile' : ''} ${isKeyboardVisible ? 'keyboard-visible' : ''}`}>
      <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
      
      <div className="edumate-content">
        <div className="edumate-header">
          <div className="header-content">
            <h1>Edumate - Your Learning Assistant</h1>
            {lectureId && (
              <div className="lecture-mode-indicator">
                <span>Lecture Mode</span>
                <div className="lecture-mode-buttons">
                  <button 
                    onClick={handleReturnToLecture} 
                    className="return-to-lecture-btn"
                  >
                    Return to Lecture
                  </button>
                  <button 
                    onClick={handleExitLectureMode} 
                    className="exit-lecture-mode-btn"
                  >
                    Exit Lecture Mode
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={handleClearChat} className="clear-chat-btn">
            Clear Chat
          </button>
        </div>

        <div className="chat-container">
          <div className="messages-container">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`message ${msg.isUser ? 'user-message' : 'assistant-message'}`}
              >
                <div className="message-content">
                  <div className={`markdown-wrapper markdown-content ${msg.isUser ? 'user-content' : ''}`}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeRaw, rehypeKatex]}
                      components={{
                        p: ({node, ...props}) => <p className="md-paragraph" {...props} />,
                        h1: ({node, ...props}) => <h1 className="md-heading" {...props} />,
                        h2: ({node, ...props}) => <h2 className="md-heading" {...props} />,
                        h3: ({node, ...props}) => <h3 className="md-heading" {...props} />,
                        ul: ({node, ...props}) => <ul className="md-list" {...props} />,
                        ol: ({node, ...props}) => <ol className="md-list" {...props} />,
                        li: ({node, ...props}) => <li className="md-list-item" {...props} />,
                        code: ({node, inline, ...props}) => 
                          inline ? <code className="md-inline-code" {...props} /> : <code className="md-block-code" {...props} />,
                        pre: ({node, ...props}) => <pre className="md-pre" {...props} />,
                        table: ({node, ...props}) => (
                          <div className="table-wrapper">
                            <table className="md-table" {...props} />
                          </div>
                        ),
                        img: ({node, ...props}) => (
                          <img className="md-image" loading="lazy" {...props} />
                        )
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
                <div className="message-timestamp">{msg.timestamp}</div>
              </div>
            ))}
            {loading && (
              <div className="message assistant-message">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="chat-input-form">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={lectureId ? "Ask me about this lecture..." : "Ask me anything about your courses..."}
              disabled={loading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            <button type="submit" disabled={loading || !inputMessage.trim()}>
              {loading ? (
                <i className="fas fa-spinner fa-spin"></i>
              ) : (
                <i className="fas fa-paper-plane"></i>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Edumate;
