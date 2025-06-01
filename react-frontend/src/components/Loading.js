import React, { useEffect } from 'react';
import { Spinner } from 'react-bootstrap';
import '../styles/Loading.css';

const Loading = ({ fullscreen, message, showProgress, progress }) => {
  // Prevent scrolling when fullscreen loading is active
  useEffect(() => {
    if (fullscreen) {
      // Add classes to prevent scrolling
      document.body.classList.add('loading-active');
      document.documentElement.classList.add('loading-active');
      
      // Also set styles directly as backup
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      
      return () => {
        // Remove classes and reset styles when component unmounts
        document.body.classList.remove('loading-active');
        document.documentElement.classList.remove('loading-active');
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      };
    }
  }, [fullscreen]);

  return (
    <div className={`loading-container ${fullscreen ? 'fullscreen' : ''}`}>
      <div className="loading-content">
        <div className="loading-spinner">
          <Spinner animation="border" role="status" variant="primary" />
        </div>
        <span className="loading-text">
          {message || 'Loading...'}
        </span>
        {showProgress && (
          <div className="loading-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress || 0}%` }}
              ></div>
            </div>
            <span className="progress-text">{progress || 0}%</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Loading;
