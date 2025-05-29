import React from 'react';
import { Spinner } from 'react-bootstrap';
import '../styles/Loading.css';

const Loading = ({ fullscreen, message, showProgress, progress }) => {
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
