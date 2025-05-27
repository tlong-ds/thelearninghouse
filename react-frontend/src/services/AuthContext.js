import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if user is already logged in via HTTP-only cookie
  useEffect(() => {
    const checkLoggedIn = async () => {
      try {
        const response = await axios.get('http://localhost:8503/whoami', {
          withCredentials: true  // Important: needed to send cookies
        });
        
        if (response.data.username) {
          setCurrentUser({
            username: response.data.username,
            role: response.data.role
          });
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        // Clear any stale data
        setCurrentUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    
    checkLoggedIn();
  }, []);

  // Login function
  const login = async (username, password, role) => {
    try {
      const response = await axios.post('http://localhost:8503/login', {
        username,
        password,
        role
      }, {
        withCredentials: true // Important: needed to receive cookies
      });
      
      if (response.data.username) {
        setCurrentUser({
          username: response.data.username,
          role: response.data.role
        });
        setIsAuthenticated(true);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await axios.get('http://localhost:8503/logout', {
        withCredentials: true
      });
      
      setCurrentUser(null);
      setIsAuthenticated(false);
      return true;
    } catch (error) {
      console.error('Logout failed:', error);
      return false;
    }
  };

  // Register function
  const register = async (userData) => {
    try {
      const response = await axios.post('http://localhost:8503/auth/register_user', userData);
      
      if (response.status === 201) {
        return true;
      }
      
      return false;
    } catch (error) {
      if (error.response?.status === 409) {
        throw new Error('Username or email already exists');
      }
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      return false;
    }
  };

  const value = {
    currentUser,
    isAuthenticated,
    loading,
    login,
    logout,
    register
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
