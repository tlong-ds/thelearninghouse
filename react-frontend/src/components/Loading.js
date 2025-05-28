import React from 'react';
import { Spinner } from 'react-bootstrap';
import '../styles/Loading.css';

const Loading = ({ fullscreen }) => {
  return (
    <div className={`loading-container ${fullscreen ? 'fullscreen' : ''}`}>
      <div className="loading-content">
        <Spinner animation="border" role="status" variant="primary" />
        <span className="loading-text">Loading...</span>
      </div>
    </div>
  );
};

export default Loading;
