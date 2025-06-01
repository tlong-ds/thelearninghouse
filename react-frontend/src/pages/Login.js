import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { images } from '../utils/images';
import '../styles/Login.css';
import gradientVideo from '../assets/videos/gradient-bg.mp4';
import darkLogo from '../assets/dark_logo.webp';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [expertise, setExpertise] = useState('');
  const [role, setRole] = useState('Learner');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, register } = useAuth();
  const navigate = useNavigate();
  
  // Handle body scroll lock when loading
  useEffect(() => {
    if (isLoading) {
      // Add loading classes to prevent scrolling
      document.body.classList.add('loading-active');
      document.documentElement.classList.add('loading-active');
    } else {
      // Remove loading classes to restore scrolling
      document.body.classList.remove('loading-active');
      document.documentElement.classList.remove('loading-active');
    }
    
    // Cleanup function to remove classes when component unmounts
    return () => {
      document.body.classList.remove('loading-active');
      document.documentElement.classList.remove('loading-active');
    };
  }, [isLoading]);
  
  // Add no-scroll class to body when component mounts
  useEffect(() => {
    document.body.classList.add('no-scroll');
    
    // Remove the class when component unmounts
    return () => {
      document.body.classList.remove('no-scroll');
    };
  }, []);
  
  const validateEmail = (email) => {
    return /^[\w.-]+@[\w.-]+\.\w+$/.test(email);
  };
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    if (!username || !password) {
      setError('Please fill in both fields.');
      setIsLoading(false);
      return;
    }
    
    try {
      // Show loading for 1 second before actual login
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const success = await login(username, password, role);
      
      if (success) {
        console.log(`Welcome back ${username}! Login successful.`);
        setTimeout(() => {
          navigate('/');
        }, 1000);
      } else {
        setError('Login failed. Please check your credentials.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
      setIsLoading(false);
    }
  };
  
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    // Validation
    if (!fullName || !username || !email || !password || !confirmPassword ||
        (role === 'Learner' && !phone) || (role === 'Instructor' && !expertise)) {
      setError('Please fill in all required fields.');
      setIsLoading(false);
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      setIsLoading(false);
      return;
    }
    
    if (!validateEmail(email)) {
      setError('Please enter a valid email address (e.g., example@gmail.com).');
      setIsLoading(false);
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setIsLoading(false);
      return;
    }
    
    if (role === 'Learner' && phone.length < 9) {
      setError('Invalid phone number.');
      setIsLoading(false);
      return;
    }
    
    try {
      // Show loading for 1-2 seconds before actual registration
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Prepare user data
      const userData = {
        username,
        password,
        role,
        name: fullName,
        email
      };
      
      if (role === 'Learner') {
        userData.phone = phone;
      } else {
        userData.expertise = expertise;
      }
      
      const success = await register(userData);
      if (success) {
        const message = `Welcome to The Learning House, ${fullName}! Your account has been created successfully.`;
        alert(message);
        // Auto-login after registration
        const loginSuccess = await login(username, password, role);
        if (loginSuccess) {
          alert("You have been automatically logged in!");
          // Add timeout before navigation
          setTimeout(() => {
            navigate('/');
          }, 1000); // 1 second delay
        } else {
          setError('Registration successful but login failed. Please try logging in manually.');
          setIsLoading(false);
        }
      }
    } catch (error) {
      setError(error.message || 'Registration failed. Please try again later.');
      setIsLoading(false);
    }
  };
  
  return (
    <div className="login-container">
      {/* Video Background - Same as Home page */}
      <div className="login-video-background">
        <video
          className="login-background-video"
          autoPlay
          loop
          muted
          playsInline
          src={gradientVideo}
        >
          {/* Fallback for browsers that don't support video */}
        </video>
        <div className="login-video-overlay"></div>
      </div>

      {/* Login Card */}
      <div className="login-card">
        {/* Cancel Button - Moved outside the columns for better mobile positioning */}
        <button 
          type="button" 
          className="login-cancel-btn"
          onClick={() => navigate('/')}
          aria-label="Go to Home"
        >
          <i className="fas fa-times"></i>
        </button>
        
        {/* Left Column - Dummy Image */}
        <div className="login-card-left">
          <div className="login-image-container">
            <div className="login-decorative-graphic">
              <div className="graphic-element element-1"></div>
              <div className="graphic-element element-2"></div>
              <div className="graphic-element element-3"></div>
              <div className="graphic-text">
                <img src={darkLogo} alt="The Learning House Logo" className="left-column-logo" />
                <h2>Welcome to</h2>
                <h1>The Learning House</h1>
                <p>Discover knowledge, connect with experts, and transform your learning journey.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Login Form */}
        <div className="login-card-right">
          
          <div className="login-form-wrapper">
            {/* Header */}
            <div className="login-header">
              <h2 className="login-title">
                {isLogin ? 'Sign In' : 'Join The Learning House'}
              </h2>
              <p className="login-subtitle">
                {isLogin 
                  ? 'Sign in to continue your learning journey' 
                  : 'Create your account to get started'
                }
              </p>
            </div>

            {/* Role Selector */}
            <div className="login-role-selector">
              <label>I am a:</label>
              <div className="role-options">
                <button 
                  type="button"
                  className={`role-option ${role === 'Learner' ? 'active' : ''}`}
                  onClick={() => setRole('Learner')}
                >
                  <i className="fas fa-graduation-cap"></i>
                  <span>Learner</span>
                </button>
                <button 
                  type="button"
                  className={`role-option ${role === 'Instructor' ? 'active' : ''}`}
                  onClick={() => setRole('Instructor')}
                >
                  <i className="fas fa-chalkboard-teacher"></i>
                  <span>Instructor</span>
                </button>
              </div>
            </div>

            {/* Auth Tabs */}
            <div className="login-auth-tabs">
              <button 
                type="button"
                className={`auth-tab ${isLogin ? 'active' : ''}`}
                onClick={() => setIsLogin(true)}
              >
                Sign In
              </button>
              <button 
                type="button"
                className={`auth-tab ${!isLogin ? 'active' : ''}`}
                onClick={() => setIsLogin(false)}
              >
                Sign Up
              </button>
            </div>

            {/* Forms */}
            {isLogin ? (
              <form className="login-form" onSubmit={handleLogin}>
                <div className="form-group">
                  <input
                    type="text"
                    id="username"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </div>
                
                <div className="form-group">
                  <input
                    type="password"
                    id="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                
                {error && <div className="error-message">{error}</div>}
                
                <button type="submit" className="login-submit-btn" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      <span>Signing In...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <i className="fas fa-arrow-right"></i>
                    </>
                  )}
                </button>
                
                <div className="login-copyright">
                  &copy; {new Date().getFullYear()} The Learning House. All rights reserved.
                </div>
              </form>
            ) : (
              <form className="login-form register-form" onSubmit={handleRegister}>
                <div className="form-row">
                  <div className="form-group">
                    <input
                      type="text"
                      id="fullName"
                      placeholder="Enter your full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                  
                  <div className="form-group">
                    <input
                      type="text"
                      id="reg-username"
                      placeholder="Choose a username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <input
                    type="email"
                    id="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <input
                      type="password"
                      id="reg-password"
                      placeholder="Create a password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  
                  <div className="form-group">
                    <input
                      type="password"
                      id="confirmPassword"
                      placeholder="Confirm your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                
                {role === 'Learner' ? (
                  <div className="form-group">
                    <input
                      type="tel"
                      id="phone"
                      placeholder="Enter your phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                    />
                  </div>
                ) : (
                  <div className="form-group">
                    <input
                      type="text"
                      id="expertise"
                      placeholder="e.g., Computer Science, Mathematics, Physics"
                      value={expertise}
                      onChange={(e) => setExpertise(e.target.value)}
                    />
                  </div>
                )}
                
                {error && <div className="error-message">{error}</div>}
                
                <button type="submit" className="login-submit-btn" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <i className="fas fa-arrow-right"></i>
                    </>
                  )}
                </button>
                
                <div className="login-copyright">
                  &copy; {new Date().getFullYear()} The Learning House. All rights reserved.
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner">
              <i className="fas fa-spinner fa-spin"></i>
            </div>
            <div className="loading-text">
              {isLogin ? 'Signing you in...' : 'Creating your account...'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
