import React, { useState, useEffect } from 'react';
import { useAuth } from '../services/AuthContext';
import { fetchUserProfile, updateUserProfile, changePassword } from '../services/api';
import Header from '../components/Header';
import '../styles/Settings.css';

const Settings = () => {
  const { currentUser, logout } = useAuth();
  
  // User information state
  const [userInfo, setUserInfo] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    expertise: ''
  });
  
  // Settings state
  const [theme, setTheme] = useState('light');
  const [notifications, setNotifications] = useState(true);
  
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
    settingsSuccess: false,
    settingsError: '',
    passwordSuccess: false,
    passwordError: ''
  });
  
  // Loading states
  const [loading, setLoading] = useState({
    profile: false,
    settings: false,
    password: false,
    initial: true
  });
  
  // Active section state for navigation
  const [activeSection, setActiveSection] = useState('profile');
  
  // Fetch user profile on component mount
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        setLoading(prev => ({ ...prev, initial: true }));
        const userData = await fetchUserProfile();
        
        setUserInfo({
          name: userData.name || '',
          email: userData.email || '',
          phoneNumber: userData.role === 'Learner' ? userData.phoneNumber || '' : '',
          expertise: userData.role === 'Instructor' ? userData.expertise || '' : ''
        });
        
        // Load user preferences from localStorage or API
        const savedTheme = localStorage.getItem('theme') || 'light';
        const savedNotifications = localStorage.getItem('notifications') !== 'false';
        
        setTheme(savedTheme);
        setNotifications(savedNotifications);
      } catch (error) {
        console.error('Failed to load user profile:', error);
      } finally {
        setLoading(prev => ({ ...prev, initial: false }));
      }
    };
    
    loadUserProfile();
  }, []);
  
  // Handle input changes for user info
  const handleUserInfoChange = (e) => {
    const { name, value } = e.target;
    setUserInfo(prev => ({ ...prev, [name]: value }));
  };
  
  // Handle theme change
  const handleThemeChange = (e) => {
    const newTheme = e.target.value;
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Apply theme to the document (could be expanded with a theme context)
    if (newTheme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  };
  
  // Handle notification change
  const handleNotificationChange = (e) => {
    const isEnabled = e.target.checked;
    setNotifications(isEnabled);
    localStorage.setItem('notifications', isEnabled.toString());
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
  
  // Save appearance settings
  const handleSaveSettings = (e) => {
    e.preventDefault();
    
    try {
      setLoading(prev => ({ ...prev, settings: true }));
      setMessages(prev => ({ ...prev, settingsSuccess: false, settingsError: '' }));
      
      // In a real implementation, this might save to backend as well
      localStorage.setItem('theme', theme);
      localStorage.setItem('notifications', notifications.toString());
      
      setMessages(prev => ({ ...prev, settingsSuccess: true }));
      setTimeout(() => {
        setMessages(prev => ({ ...prev, settingsSuccess: false }));
      }, 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessages(prev => ({ 
        ...prev, 
        settingsError: 'Failed to save settings. Please try again.' 
      }));
    } finally {
      setLoading(prev => ({ ...prev, settings: false }));
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
  
  if (loading.initial) {
    return (
      <div className="settings-container">
        <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
        <div className="settings-layout">
          <div className="settings-content">
            <div className="loading">Loading settings...</div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="settings-container">
      <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
      
      <div className="settings-layout">
        {/* Left sidebar navigation */}
        <div className="settings-sidebar">
          <div className="user-info">
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
              <i className="nav-icon profile-icon"></i>
              Profile Information
            </button>
            <button 
              className={`nav-item ${activeSection === 'appearance' ? 'active' : ''}`}
              onClick={() => setActiveSection('appearance')}
            >
              <i className="nav-icon appearance-icon"></i>
              Appearance
            </button>
            <button 
              className={`nav-item ${activeSection === 'security' ? 'active' : ''}`}
              onClick={() => setActiveSection('security')}
            >
              <i className="nav-icon security-icon"></i>
              Security
            </button>
          </nav>
        </div>
        
        {/* Right content area */}
        <div className="settings-content">
          
          {/* Profile Information */}
          {activeSection === 'profile' && (
            <div className="settings-card">
              <h2>Profile Information</h2>
              <form className="settings-form" onSubmit={handleSaveProfile}>
                <div className="form-group">
                  <label htmlFor="name">Full Name</label>
                  <input 
                    type="text" 
                    id="name" 
                    name="name" 
                    value={userInfo.name} 
                    onChange={handleUserInfoChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="email">Email Address</label>
                  <input 
                    type="email" 
                    id="email" 
                    name="email" 
                    value={userInfo.email} 
                    onChange={handleUserInfoChange}
                    required
                  />
                </div>
                
                {currentUser?.role === 'Learner' && (
                  <div className="form-group">
                    <label htmlFor="phoneNumber">Phone Number</label>
                    <input 
                      type="text" 
                      id="phoneNumber" 
                      name="phoneNumber" 
                      value={userInfo.phoneNumber} 
                      onChange={handleUserInfoChange}
                    />
                  </div>
                )}
                
                {currentUser?.role === 'Instructor' && (
                  <div className="form-group">
                    <label htmlFor="expertise">Expertise</label>
                    <input 
                      type="text" 
                      id="expertise" 
                      name="expertise" 
                      value={userInfo.expertise} 
                      onChange={handleUserInfoChange}
                    />
                  </div>
                )}
                
                {messages.profileSuccess && (
                  <div className="success-message">Profile updated successfully!</div>
                )}
                
                {messages.profileError && (
                  <div className="error-message">{messages.profileError}</div>
                )}
                
                <div className="form-actions">
                  <button 
                    type="submit" 
                    className="save-btn"
                    disabled={loading.profile}
                  >
                    {loading.profile ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </div>
          )}
          
          {/* Appearance Settings */}
          {activeSection === 'appearance' && (
            <div className="settings-card">
              <h2>Appearance</h2>
              <form className="settings-form" onSubmit={handleSaveSettings}>
                <div className="form-group">
                  <label htmlFor="theme">Theme</label>
                  <select 
                    id="theme" 
                    name="theme" 
                    value={theme} 
                    onChange={handleThemeChange}
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System Default</option>
                  </select>
                </div>
                
               
                
                {messages.settingsSuccess && (
                  <div className="success-message">Settings saved successfully!</div>
                )}
                
                {messages.settingsError && (
                  <div className="error-message">{messages.settingsError}</div>
                )}
                
                <div className="form-actions">
                  <button 
                    type="submit" 
                    className="save-btn"
                    disabled={loading.settings}
                  >
                    {loading.settings ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </form>
            </div>
          )}
          
          {/* Security */}
          {activeSection === 'security' && (
            <div className="settings-card">
              <h2>Security</h2>
              <form className="settings-form" onSubmit={handleChangePassword}>
                <div className="form-group">
                  <label htmlFor="currentPassword">Current Password</label>
                  <input 
                    type="password" 
                    id="currentPassword" 
                    name="currentPassword" 
                    value={passwordInfo.currentPassword} 
                    onChange={handlePasswordChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="newPassword">New Password</label>
                  <input 
                    type="password" 
                    id="newPassword" 
                    name="newPassword" 
                    value={passwordInfo.newPassword} 
                    onChange={handlePasswordChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm New Password</label>
                  <input 
                    type="password" 
                    id="confirmPassword" 
                    name="confirmPassword" 
                    value={passwordInfo.confirmPassword} 
                    onChange={handlePasswordChange}
                    required
                  />
                </div>
                
                {messages.passwordSuccess && (
                  <div className="success-message">Password changed successfully!</div>
                )}
                
                {messages.passwordError && (
                  <div className="error-message">{messages.passwordError}</div>
                )}
                
                <div className="form-actions">
                  <button 
                    type="submit" 
                    className="save-btn"
                    disabled={loading.password}
                  >
                    {loading.password ? 'Updating...' : 'Change Password'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
