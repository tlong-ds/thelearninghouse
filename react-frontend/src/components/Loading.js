import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Spinner } from 'react-bootstrap';
import '../styles/Loading.css';

const Loading = ({ fullscreen, message, showProgress, progress }) => {
  // Prevent scrolling when fullscreen loading is active
  useEffect(() => {
    if (fullscreen) {
      // Store current scroll position
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      
      // Add classes to prevent scrolling
      document.body.classList.add('loading-active');
      document.documentElement.classList.add('loading-active');
      
      // Also set styles directly as backup
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = `-${scrollX}px`;
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      
      return () => {
        // Remove classes and reset styles when component unmounts
        document.body.classList.remove('loading-active');
        document.documentElement.classList.remove('loading-active');
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.width = '';
        document.body.style.height = '';
        
        // Restore scroll position
        window.scrollTo(scrollX, scrollY);
      };
    }
  }, [fullscreen]);

  const loadingElement = (
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

  // Use React Portal for fullscreen loading to render outside normal DOM tree
  if (fullscreen) {
    return ReactDOM.createPortal(
      loadingElement,
      document.body.parentNode || document.documentElement
    );
  }

  // For non-fullscreen loading, render normally
  return loadingElement;
};

export default Loading;
