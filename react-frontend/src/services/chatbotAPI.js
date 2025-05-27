import axios from 'axios';
import config from '../config';

const BASE_URL = `${config.API_URL}/api`;

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
export const sendChatMessage = async (message, lectureId = null) => {
  try {
    const endpoint = lectureId 
      ? `${BASE_URL}/chat/lecture/${lectureId}`
      : `${BASE_URL}/chat`;

    const response = await axios.post(endpoint, {
      message
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
export const getChatHistory = async (lectureId) => {
  try {
    const response = await axios.get(`${BASE_URL}/chat/history/${lectureId}`, {
      withCredentials: true,
      headers: getHeaders()
    });

    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};

// Clear chat history
export const clearChatHistory = async () => {
  try {
    const response = await axios.delete(`${BASE_URL}/chat/history`, {
      withCredentials: true,
      headers: getHeaders()
    });

    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};
