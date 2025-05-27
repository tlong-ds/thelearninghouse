import React from 'react';
import { Link } from 'react-router-dom';
import { images } from '../utils/images';
import '../styles/Header.css';

const Header = ({ username, role, onLogout }) => {
  return (
    <header className="app-header">
      <div className="header-logo">
        <Link to="/courses">
          <img src={images.lightLogo} alt="The Learning House" />
          <span>The Learning House</span>
        </Link>
      </div>
      
      <nav className="header-nav">
        <ul>
          <li>
            <Link to="/courses">Courses</Link>
          </li>
          
          {role === 'Learner' && (
            <>
              <li>
                <Link to="/dashboard">Dashboard</Link>
              </li>
              <li>
                <Link to="/edumate">Edumate</Link>
              </li>
            </>
          )}
          {role === 'Instructor' && (
            <li>
              <Link to="/instructor/dashboard">Instructor Dashboard</Link>
            </li>
          )}
          <li>
            <Link to="/settings">Settings</Link>
          </li>
          <li>
            <Link to="/about">About</Link>
          </li>
        </ul>
      </nav>
      
      <div className="header-user">
        <div className="user-info">
          <span className="username">{username || 'User'}</span>
          <span className="role">{role || 'Guest'}</span>
        </div>
        <button className="logout-btn" onClick={onLogout} aria-label="Logout" />
      </div>
    </header>
  );
};

export default Header;
