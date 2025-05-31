import React, { useState, useEffect } from 'react';
import { useAuth } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import { fetchUserProfile, updateUserProfile, changePassword } from '../services/api';
import '../styles/Settings.css';

const Settings = () => {
  const { currentUser, logout } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  
  // User information state
  const [userInfo, setUserInfo] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    expertise: ''
  });
  
  // Password change state
  const [passwordInfo, setPasswordInfo] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  // Feedback messages
  const [messages, setMessages] = useState({
    profileSuccess: false,
    profileError: '',
    passwordSuccess: false,
    passwordError: ''
  });
  
  // Loading states for individual operations
  const [loading, setLoading] = useState({
    profile: false,
    password: false
  });
  
  // Active section state for navigation
  const [activeSection, setActiveSection] = useState('profile');
  
  // Fetch user profile on component mount
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        startLoading('Loading settings...');
        const userData = await fetchUserProfile();
        
        setUserInfo({
          name: userData.name || '',
          email: userData.email || '',
          phoneNumber: userData.role === 'Learner' ? userData.phoneNumber || '' : '',
          expertise: userData.role === 'Instructor' ? userData.expertise || '' : ''
        });
        
        stopLoading();
      } catch (error) {
        console.error('Failed to load user profile:', error);
        stopLoading();
      }
    };
    
    loadUserProfile();
  }, [startLoading, stopLoading]);
  
  // Handle input changes for user info
  const handleUserInfoChange = (e) => {
    const { name, value } = e.target;
    setUserInfo(prev => ({ ...prev, [name]: value }));
  };
  
  // Handle password input changes
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordInfo(prev => ({ ...prev, [name]: value }));
  };
  
  // Save profile information
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(prev => ({ ...prev, profile: true }));
      setMessages(prev => ({ ...prev, profileSuccess: false, profileError: '' }));
      
      const profileData = {
        name: userInfo.name,
        email: userInfo.email
      };
      
      // Add role-specific data
      if (currentUser.role === 'Learner') {
        profileData.phoneNumber = userInfo.phoneNumber;
      } else if (currentUser.role === 'Instructor') {
        profileData.expertise = userInfo.expertise;
      }
      
      await updateUserProfile(profileData);
      
      setMessages(prev => ({ ...prev, profileSuccess: true }));
      setTimeout(() => {
        setMessages(prev => ({ ...prev, profileSuccess: false }));
      }, 3000);
    } catch (error) {
      console.error('Failed to update profile:', error);
      setMessages(prev => ({ 
        ...prev, 
        profileError: 'Failed to update profile. Please try again.' 
      }));
    } finally {
      setLoading(prev => ({ ...prev, profile: false }));
    }
  };
  
  // Change password
  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (passwordInfo.newPassword !== passwordInfo.confirmPassword) {
      setMessages(prev => ({ 
        ...prev, 
        passwordError: 'New passwords do not match.' 
      }));
      return;
    }

    if (passwordInfo.newPassword.length < 8) {
      setMessages(prev => ({
        ...prev,
        passwordError: 'New password must be at least 8 characters long.'
      }));
      return;
    }
    
    try {
      setLoading(prev => ({ ...prev, password: true }));
      setMessages(prev => ({ ...prev, passwordSuccess: false, passwordError: '' }));
      
      await changePassword({
        currentPassword: passwordInfo.currentPassword,
        newPassword: passwordInfo.newPassword
      });
      
      setMessages(prev => ({ ...prev, passwordSuccess: true }));
      setTimeout(() => {
        setMessages(prev => ({ ...prev, passwordSuccess: false }));
      }, 3000);
      
      // Clear password fields
      setPasswordInfo({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (error) {
      console.error('Failed to change password:', error);
      setMessages(prev => ({ 
        ...prev, 
        passwordError: error.response?.data?.detail || 'Failed to change password. Please check your current password and try again.' 
      }));
    } finally {
      setLoading(prev => ({ ...prev, password: false }));
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-layout">
        {/* Left sidebar navigation */}
        <div className="settings-sidebar">
          <div className="sidebar-header">
            <h1 className="sidebar-title">Settings</h1>
          </div>
          
          <div className="settings-user-info">
            <div className="user-avatar">
              <span>{currentUser?.username?.charAt(0).toUpperCase() || 'U'}</span>
            </div>
            <div className="user-details">
              <h3>{currentUser?.username || 'User'}</h3>
              <p>{currentUser?.role || 'User'}</p>
            </div>
          </div>
          
          <nav className="settings-nav">
            <button 
              className={`nav-item ${activeSection === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveSection('profile')}
            >
              <div className="nav-icon">
                <i className="fas fa-user"></i>
              </div>
              <div className="nav-content">
                <span className="nav-label">Profile Information</span>
                <span className="nav-description">Personal details</span>
              </div>
            </button>
            <button 
              className={`nav-item ${activeSection === 'security' ? 'active' : ''}`}
              onClick={() => setActiveSection('security')}
            >
              <div className="nav-icon">
                <i className="fas fa-lock"></i>
              </div>
              <div className="nav-content">
                <span className="nav-label">Security</span>
                <span className="nav-description">Password settings</span>
              </div>
            </button>
          </nav>
        </div>
        
        {/* Right content area */}
        <div className="settings-main">
          <div className="settings-content">
            
            {/* Profile Information */}
            {activeSection === 'profile' && (
              <div className="settings-section">
                <div className="setting-content-header">
                  <h2 className="setting-content-title">Profile Information</h2>
                  <p className="setting-content-subtitle">Update your personal details and contact information</p>
                </div>
                
                <form className="settings-form" onSubmit={handleSaveProfile}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="name">Full Name</label>
                    <input 
                      type="text" 
                      id="name" 
                      name="name" 
                      className="form-input"
                      value={userInfo.name} 
                      onChange={handleUserInfoChange}
                      placeholder="Enter your full name"
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label" htmlFor="email">Email Address</label>
                    <input 
                      type="email" 
                      id="email" 
                      name="email" 
                      className="form-input"
                      value={userInfo.email} 
                      onChange={handleUserInfoChange}
                      placeholder="Enter your email address"
                      required
                    />
                  </div>
                  
                  {currentUser?.role === 'Learner' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="phoneNumber">Phone Number</label>
                      <input 
                        type="text" 
                        id="phoneNumber" 
                        name="phoneNumber" 
                        className="form-input"
                        value={userInfo.phoneNumber} 
                        onChange={handleUserInfoChange}
                        placeholder="Enter your phone number"
                      />
                    </div>
                  )}
                  
                  {currentUser?.role === 'Instructor' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="expertise">Expertise</label>
                      <input 
                        type="text" 
                        id="expertise" 
                        name="expertise" 
                        className="form-input"
                        value={userInfo.expertise} 
                        onChange={handleUserInfoChange}
                        placeholder="Enter your area of expertise"
                      />
                    </div>
                  )}
                  
                  {messages.profileSuccess && (
                    <div className="message success-message">
                      <i className="fas fa-check-circle"></i>
                      Profile updated successfully!
                    </div>
                  )}
                  
                  {messages.profileError && (
                    <div className="message error-message">
                      <i className="fas fa-exclamation-circle"></i>
                      {messages.profileError}
                    </div>
                  )}
                  
                  <div className="form-actions">
                    <button 
                      type="submit" 
                      className="btn-primary"
                      disabled={loading.profile}
                    >
                      {loading.profile ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i>
                          Saving...
                        </>
                      ) : (
                        'Save Profile'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
            
            {/* Security */}
            {activeSection === 'security' && (
              <div className="settings-section">
                <div className="setting-content-header">
                  <h2 className="setting-content-title">Security</h2>
                  <p className="setting-content-subtitle">Manage your password and account security</p>
                </div>
                
                <form className="settings-form" onSubmit={handleChangePassword}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="currentPassword">Current Password</label>
                    <input 
                      type="password" 
                      id="currentPassword" 
                      name="currentPassword" 
                      className="form-input"
                      value={passwordInfo.currentPassword} 
                      onChange={handlePasswordChange}
                      placeholder="Enter your current password"
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label" htmlFor="newPassword">New Password</label>
                    <input 
                      type="password" 
                      id="newPassword" 
                      name="newPassword" 
                      className="form-input"
                      value={passwordInfo.newPassword} 
                      onChange={handlePasswordChange}
                      placeholder="Enter your new password"
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label" htmlFor="confirmPassword">Confirm New Password</label>
                    <input 
                      type="password" 
                      id="confirmPassword" 
                      name="confirmPassword" 
                      className="form-input"
                      value={passwordInfo.confirmPassword} 
                      onChange={handlePasswordChange}
                      placeholder="Confirm your new password"
                      required
                    />
                  </div>
                  
                  {messages.passwordSuccess && (
                    <div className="message success-message">
                      <i className="fas fa-check-circle"></i>
                      Password changed successfully!
                    </div>
                  )}
                  
                  {messages.passwordError && (
                    <div className="message error-message">
                      <i className="fas fa-exclamation-circle"></i>
                      {messages.passwordError}
                    </div>
                  )}
                  
                  <div className="form-actions">
                    <button 
                      type="submit" 
                      className="btn-primary"
                      disabled={loading.password}
                    >
                      {loading.password ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i>
                          Updating...
                        </>
                      ) : (
                        'Change Password'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
