import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { images } from '../utils/images';
import '../styles/Login.css';

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
  
  const { login, register } = useAuth();
  const navigate = useNavigate();
  
  const validateEmail = (email) => {
    return /^[\w.-]+@[\w.-]+\.\w+$/.test(email);
  };
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Please fill in both fields.');
      return;
    }
    
    const success = await login(username, password, role);
    if (success) {
      console.log(`Welcome back ${username}! Login successful.`);
      // Add timeout before navigation
      setTimeout(() => {
        navigate('/courses');
      }, 1000); // 1 second delay
    } else {
      setError('Login failed. Please check your credentials.');
    }
  };
  
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validation
    if (!fullName || !username || !email || !password || !confirmPassword ||
        (role === 'Learner' && !phone) || (role === 'Instructor' && !expertise)) {
      setError('Please fill in all required fields.');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    
    if (!validateEmail(email)) {
      setError('Please enter a valid email address (e.g., example@gmail.com).');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    
    if (role === 'Learner' && phone.length < 9) {
      setError('Invalid phone number.');
      return;
    }
    
    try {
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
            navigate('/courses');
          }, 1000); // 1 second delay
        } else {
          setError('Registration successful but login failed. Please try logging in manually.');
        }
      }
    } catch (error) {
      setError(error.message || 'Registration failed. Please try again later.');
    }
  };
  
  return (
    <div className="auth-container">
      <div className="auth-logo">
        <img src={images.lightLogo} alt="The Learning House Logo" />
      </div>
      
      <h1 className="auth-title">The Learning House</h1>
      <p className="auth-subtitle">The Best Learning Platform for Learners and Instructors!</p>
      
      <div className="auth-form-container">
        <div className="role-selector">
          <label>Select your role:</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="Learner">Learner</option>
            <option value="Instructor">Instructor</option>
          </select>
        </div>
        
        <div className="auth-tabs">
          <button 
            className={isLogin ? 'active' : ''}
            onClick={() => setIsLogin(true)}
          >
            Login
          </button>
          <button 
            className={!isLogin ? 'active' : ''}
            onClick={() => setIsLogin(false)}
          >
            Sign Up
          </button>
        </div>
        
        {isLogin ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            {error && <div className="error-message">{error}</div>}
            
            <button type="submit" className="auth-button">Login</button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister}>
            <h3>Create Account</h3>
            
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input
                type="text"
                id="fullName"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="reg-username">Username</label>
              <input
                type="text"
                id="reg-username"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="reg-password">Password</label>
              <input
                type="password"
                id="reg-password"
                placeholder="Choose a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            
            {role === 'Learner' ? (
              <div className="form-group">
                <label htmlFor="phone">Phone Number</label>
                <input
                  type="text"
                  id="phone"
                  placeholder="Enter your phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="expertise">Expertise</label>
                <input
                  type="text"
                  id="expertise"
                  placeholder="Enter your expertise area"
                  value={expertise}
                  onChange={(e) => setExpertise(e.target.value)}
                />
              </div>
            )}
            
            {error && <div className="error-message">{error}</div>}
            
            <button type="submit" className="auth-button">Sign Up</button>
          </form>
        )}
      </div>
      
      <footer className="auth-footer">
        <p>© 2025 The Learning House. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Login;
