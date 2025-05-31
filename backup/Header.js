import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { images } from '../react-frontend/src/utils/images';
import { updateHeaderForScrollbar } from '../react-frontend/src/utils/scrollbar';
import '../styles/Header.css';

const Header = ({ username, role, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Debug logging to ensure header is rendering
  console.log('Header rendering:', { username, role, pathname: location.pathname });
  
  // Ensure we have required props
  if (!username || !role) {
    console.warn('Header: Missing required props', { username, role });
    // Still render header with fallback values to prevent disappearing
  }

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };
  
  // Update header positioning based on scrollbar presence
  useEffect(() => {
    // Ensure header is visible
    const ensureHeaderVisibility = () => {
      const headerElement = document.querySelector('.app-header');
      if (headerElement) {
        headerElement.style.display = 'flex';
        headerElement.style.visibility = 'visible';
        headerElement.style.opacity = '1';
        headerElement.style.zIndex = '999999';
        headerElement.style.position = 'fixed';
      }
    };
    
    // Initial update
    updateHeaderForScrollbar();
    ensureHeaderVisibility();
    
    // Update on window resize
    const handleResize = () => {
      updateHeaderForScrollbar();
      ensureHeaderVisibility();
    };
    
    // Update when content changes (might affect scrollbar)
    const handleContentChange = () => {
      // Use setTimeout to ensure DOM updates are complete
      setTimeout(() => {
        updateHeaderForScrollbar();
        ensureHeaderVisibility();
      }, 100);
    };
    
    // Continuous visibility check
    const visibilityInterval = setInterval(ensureHeaderVisibility, 2000);
    
    window.addEventListener('resize', handleResize);
    
    // Listen for route changes that might affect content height
    handleContentChange();
    
    // Also listen for when images load (might change content height)
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (!img.complete) {
        img.addEventListener('load', handleContentChange);
      }
    });
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(visibilityInterval);
      images.forEach(img => {
        img.removeEventListener('load', handleContentChange);
      });
    };
  }, [location.pathname]); // Re-run when route changes
  
  // Helper function to determine if a link is active
  const isActive = (path) => {
    if (path === '/courses' && location.pathname === '/courses') return true;
    if (path === '/instructor/dashboard' && location.pathname.startsWith('/instructor')) return true;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };
  return ReactDOM.createPortal(
    <header className="app-header">
      <div className="header-logo">
        <Link to="/">
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
        </ul>
      </nav>
      
      <div className="header-user">
        <div className="header-user-info">
          <span className="header-username">{username || 'User'}</span>
          <span className="header-role">{role || 'Guest'}</span>
        </div>
        <button className="logout-btn" onClick={handleLogout} aria-label="Logout" />
      </div>
    </header>,
    document.body.parentNode
  );
};

export default Header;
