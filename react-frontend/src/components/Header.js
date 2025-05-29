import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { images } from '../utils/images';
import '../styles/Header.css';

const Header = ({ username, role, onLogout }) => {
  const location = useLocation();
  
  // Helper function to determine if a link is active
  const isActive = (path) => {
    if (path === '/courses' && location.pathname === '/') return true;
    if (path === '/instructor/dashboard' && location.pathname.startsWith('/instructor')) return true;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };
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
            <Link to="/courses" className={isActive('/courses') ? 'active' : ''}>Courses</Link>
          </li>
          
          {role === 'Learner' && (
            <>
              <li>
                <Link to="/dashboard" className={isActive('/dashboard') ? 'active' : ''}>Dashboard</Link>
              </li>
              <li>
                <Link to="/edumate" className={isActive('/edumate') ? 'active' : ''}>Edumate</Link>
              </li>
            </>
          )}
          {role === 'Instructor' && (
            <li>
              <Link to="/instructor/dashboard" className={isActive('/instructor/dashboard') ? 'active' : ''}>Instructor Dashboard</Link>
            </li>
          )}
          <li>
            <Link to="/settings" className={isActive('/settings') ? 'active' : ''}>Settings</Link>
          </li>
          <li>
            <Link to="/about" className={isActive('/about') ? 'active' : ''}>About</Link>
          </li>
        </ul>
      </nav>
      
      <div className="header-user">
        <div className="header-user-info">
          <span className="header-username">{username || 'User'}</span>
          <span className="header-role">{role || 'Guest'}</span>
        </div>
        <button className="logout-btn" onClick={onLogout} aria-label="Logout" />
      </div>
    </header>
  );
};

export default Header;
