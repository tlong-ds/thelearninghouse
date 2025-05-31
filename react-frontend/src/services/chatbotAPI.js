import axios from 'axios';
import config from '../config';

const API_URL = config.API_URL;

// Helper function to handle API errors
const handleApiError = (error) => {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    throw new Error(error.response.data.detail || 'Server error');
  } else if (error.request) {
    // The request was made but no response was received
    throw new Error('No response from server. Please check your internet connection.');
  } else {
    // Something happened in setting up the request that triggered an Error
    throw new Error('Failed to make request. Please try again.');
  }
};

// Function to get common headers with auth token
const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
});

// Send a chat message and get response 
export const sendChatMessage = async (message, lectureId = null, useCache = true) => {
  try {
    const endpoint = lectureId 
      ? `${API_URL}/api/chat/lecture/${lectureId}`
      : `${API_URL}/api/chat`;

    const response = await axios.post(endpoint, {
      message,
      use_cache: useCache
    }, {
      withCredentials: true,
      headers: getHeaders()
    });

    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};

// Get chat history for a lecture
export const getChatHistory = async (lectureId = null) => {
  try {
    const endpoint = lectureId 
      ? `${API_URL}/api/chat/history/${lectureId}`
      : `${API_URL}/api/chat/history`;
    
    console.log(`Fetching chat history from: ${endpoint}`);
    
    const response = await axios.get(endpoint, {
      withCredentials: true,
      headers: getHeaders()
    });

    console.log('Chat history response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching chat history:', error);
    throw handleApiError(error);
  }
};

// Clear chat history
export const clearChatHistory = async (lectureId = null) => {
  try {
    const endpoint = `${API_URL}/api/chat/history`;
    const params = lectureId ? { lectureId } : {};
    
    console.log(`Clearing chat history via: ${endpoint}`, params);
    
    const response = await axios.delete(endpoint, {
      withCredentials: true,
      headers: getHeaders(),
      params
    });

    console.log('Clear chat response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error clearing chat history:', error);
    throw handleApiError(error);
  }
};
