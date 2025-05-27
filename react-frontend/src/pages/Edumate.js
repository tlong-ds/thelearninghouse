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
  const messagesEndRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Extract lectureId from URL query parameters
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const lecId = queryParams.get('lectureId');
    if (lecId) {
      setLectureId(lecId);
      // Add initial message with markdown formatting for lecture-specific context
      setMessages([{
        id: Date.now(),
        content: `# Welcome to Lecture Mode\n\nI'm ready to answer questions about this lecture. What would you like to know?\n\n**Example questions you can ask:**\n\n- Can you summarize the key points?\n- Explain the concept of _X_ mentioned in this lecture\n- How does this relate to other topics?`,
        isUser: false,
        timestamp: new Date().toLocaleTimeString()
      }]);
    } else {
      // Add initial welcome message for general mode
      setMessages([{
        id: Date.now(),
        content: `# Welcome to Edumate\n\nI'm your learning assistant. Feel free to ask me anything about your courses!\n\n**Example questions:**\n\n- What courses are available?\n- Help me understand the concept of X\n- Can you explain the relationship between A and B?`,
        isUser: false,
        timestamp: new Date().toLocaleTimeString()
      }]);
    }
  }, [location.search]);

  // Auto scroll to bottom when new messages come in
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addMessage = (content, isUser = false) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      content,
      isUser,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    addMessage(userMessage, true);
    setLoading(true);

    try {
      const response = await sendChatMessage(userMessage, lectureId);
      addMessage(response.answer);
    } catch (error) {
      console.error('Chat error:', error);
      addMessage(error.message || "I'm sorry, I'm having trouble responding right now. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = async () => {
    try {
      await clearChatHistory();
      setMessages([]);
      addMessage(
        lectureId
          ? `# Chat History Cleared\n\nI'm ready to continue helping with this lecture. What would you like to know?`
          : `# Chat History Cleared\n\nHow can I help you today?`,
        false
      );
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      addMessage("**Error**: Failed to clear chat history. Please try again later.");
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="edumate-container">
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
                    onClick={() => navigate(`/lecture/${lectureId}`)} 
                    className="return-to-lecture-btn"
                  >
                    Return to Lecture
                  </button>
                  <button 
                    onClick={() => {
                      setLectureId(null);
                      navigate('/edumate', { replace: true });
                      setMessages([{
                        id: Date.now(),
                        content: `# Switched to General Mode\n\nI'm now in general mode and can answer questions about any topic in your courses. How can I help you?`,
                        isUser: false,
                        timestamp: new Date().toLocaleTimeString()
                      }]);
                    }} 
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
                  {msg.isUser ? (
                    <p>{msg.content}</p>
                  ) : (
                    <div className="markdown-wrapper markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                        components={{
                          // Apply styling through component mapping rather than className
                          p: ({node, ...props}) => <p className="md-paragraph" {...props} />,
                          h1: ({node, ...props}) => <h1 className="md-heading" {...props} />,
                          h2: ({node, ...props}) => <h2 className="md-heading" {...props} />,
                          h3: ({node, ...props}) => <h3 className="md-heading" {...props} />,
                          ul: ({node, ...props}) => <ul className="md-list" {...props} />,
                          ol: ({node, ...props}) => <ol className="md-list" {...props} />,
                          li: ({node, ...props}) => <li className="md-list-item" {...props} />,
                          code: ({node, inline, ...props}) => 
                            inline ? <code className="md-inline-code" {...props} /> : <code className="md-block-code" {...props} />,
                          pre: ({node, ...props}) => <pre className="md-pre" {...props} />
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
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
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={lectureId ? "Ask me about this lecture..." : "Ask me anything about your courses..."}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !inputMessage.trim()}>
              {loading ? 'Thinking...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Edumate;
