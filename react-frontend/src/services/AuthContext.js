import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import config from '../config';

const API_URL = config.API_URL;
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if user is already logged in via token or HTTP-only cookie
  useEffect(() => {
    const checkLoggedIn = async () => {
      try {
        // First check if we have a token in localStorage
        const token = localStorage.getItem('auth_token');
        const storedUsername = localStorage.getItem('username');
        const storedRole = localStorage.getItem('user_role');
        
        if (token && storedUsername && storedRole) {
          setCurrentUser({
            username: storedUsername,
            role: storedRole
          });
          setIsAuthenticated(true);
          setLoading(false);
          return;
        }
        
        // If no token in localStorage, try to get from cookies
        const response = await axios.get(`${API_URL}/whoami`, {
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
      const response = await axios.post(`${API_URL}/login`, {
        username,
        password,
        role
      }, {
        withCredentials: true
      });
      
      if (response.data.token) {
        // Store token in localStorage
        localStorage.setItem('auth_token', response.data.token);
        localStorage.setItem('user_role', response.data.role);
        localStorage.setItem('username', response.data.username);
        
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
      await axios.get(`${API_URL}/logout`, {
        withCredentials: true
      });
      
      // Clear localStorage
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('username');
      
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
      const response = await axios.post(`${API_URL}/auth/register_user`, userData);
      
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
