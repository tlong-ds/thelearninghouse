import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { sendChatMessage, clearChatHistory } from '../services/chatbotAPI';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import '../styles/EdumateChat.css';

const EdumateChat = forwardRef(({ lectureId = null, className = '', isEmbedded = false }, ref) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Load chat history on component mount (only for general usage, not lecture mode)
  useEffect(() => {
    const loadChatHistory = async () => {
      setLoading(true);
      try {
        // For lecture mode, always start fresh without loading cache
        if (lectureId) {
          console.log(`Lecture mode detected for lecture ${lectureId} - starting fresh without cache`);
          setMessages([{
            id: Date.now(),
            content: `# Welcome to Lecture Mode\n\nI'm ready to answer questions about this lecture. What would you like to know?`,
            isUser: false,
            timestamp: new Date().toLocaleTimeString()
          }]);
          return;
        }
        
        // Only load cache for general usage (when lectureId is null)
        const { getChatHistory } = await import('../services/chatbotAPI');
        console.log('Fetching chat history for general chat');
        
        const response = await getChatHistory(null); // Always pass null for general usage
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
            content: `# Welcome to Edumate\n\nI'm your learning assistant. Feel free to ask me anything about your learning!`,
            isUser: false,
            timestamp: new Date().toLocaleTimeString()
          }]);
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
        setMessages([{
          id: Date.now(),
          content: lectureId 
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
  }, [lectureId]);

  // Auto scroll to bottom when new messages come in
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setLoading(true);

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
      
      // For lecture mode, don't use cache; for general usage, use cache
      if (lectureId) {
        console.log(`🚫 Lecture mode: Sending message WITHOUT cache for lecture ${lectureId}`);
      } else {
        console.log(`💾 General mode: Sending message WITH cache`);
      }
      
      const response = lectureId 
        ? await sendChatMessage(userMessage, lectureId, false) // Don't cache for lecture mode
        : await sendChatMessage(userMessage, null, true); // Use cache for general usage
      
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
    
    // Only clear backend cache for general usage, not lecture mode
    if (!lectureId) {
      import('../services/chatbotAPI').then(({ clearChatHistory }) => {
        console.log('Clearing chat history for general chat');
        clearChatHistory(null) // Always pass null for general usage
          .then(() => console.log('Chat history cleared successfully'))
          .catch(err => console.error('Failed to clear chat history:', err));
      });
    } else {
      console.log('Lecture mode - not clearing cache (UI only clear)');
    }
  };

  // Expose clear function to parent components
  useImperativeHandle(ref, () => ({
    clearChat: handleClearChat
  }));

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className={`edumate-chat-container ${className} ${isEmbedded ? 'embedded' : ''}`}>
      {!isEmbedded && (
        <div className="chat-header">
          <div className="chat-title">
            <h3>Edumate Chat</h3>
            {lectureId && <span className="lecture-mode-badge">Lecture Mode</span>}
          </div>
          <button onClick={handleClearChat} className="clear-chat-btn" title="Clear Chat">
            <i className="fas fa-trash"></i>
          </button>
        </div>
      )}

      <div className="chat-messages-container scrollbar-thin">
        <div className="messages-list">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`chat-message ${msg.isUser ? 'user-message' : 'assistant-message'}`}
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
                      pre: ({node, ...props}) => <pre className="md-pre" {...props} />
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
              {!isEmbedded && <div className="message-timestamp">{msg.timestamp}</div>}
            </div>
          ))}
          {loading && (
            <div className="chat-message assistant-message">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={"Ask me something..."}
          disabled={loading}
          className="chat-input"
        />
        <button type="submit" disabled={loading || !inputMessage.trim()} className="chat-send-btn">
          {loading ? (
            <i className="fas fa-spinner fa-spin"></i>
          ) : (
            <i className="fas fa-paper-plane"></i>
          )}
        </button>
      </form>
    </div>
  );
});

export default EdumateChat;
