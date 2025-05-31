import axios from 'axios';
import config from '../config';

const API_URL = config.API_URL;

// Create axios instance with credentials
const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Add loading state to requests
apiClient.interceptors.request.use(
  async (config) => {
    // Get loading functions from context
    const loadingState = window.__loadingState;
    if (loadingState?.startLoading) {
      loadingState.startLoading();
    }
    return config;
  },
  (error) => {
    const loadingState = window.__loadingState;
    if (loadingState?.stopLoading) {
      loadingState.stopLoading();
    }
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => {
    const loadingState = window.__loadingState;
    if (loadingState?.stopLoading) {
      loadingState.stopLoading();
    }
    return response;
  },
  (error) => {
    const loadingState = window.__loadingState;
    if (loadingState?.stopLoading) {
      loadingState.stopLoading();
    }
    return Promise.reject(error);
  }
);

// Add interceptor to include auth token in requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Course-related API calls
export const fetchCourses = async () => {
  try {
    const response = await apiClient.get('/api/courses');
    return response.data;
  } catch (error) {
    console.error('Error fetching courses:', error);
    throw error;
  }
};

export const fetchCourseDetails = async (courseId) => {
  try {
    const response = await apiClient.get(`/api/courses/${courseId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching course details for ID ${courseId}:`, error);
    throw error;
  }
};

export const fetchLectures = async (courseId) => {
  try {
    const response = await apiClient.get(`/api/courses/${courseId}/lectures`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching lectures for course ID ${courseId}:`, error);
    throw error;
  }
};

export const fetchLectureDetails = async (lectureId) => {
  try {
    // Validate the lectureId
    if (lectureId === null || lectureId === undefined || lectureId === '[object Object]' || isNaN(Number(lectureId))) {
      throw new Error('Invalid lecture ID');
    }
    
    // Ensure lectureId is a number
    const id = typeof lectureId === 'string' ? parseInt(lectureId) : lectureId;
    
    if (isNaN(id)) {
      throw new Error('Invalid lecture ID format');
    }
    
    // Use apiClient instead of fetch to maintain consistency
    const response = await apiClient.get(`/api/lectures/${id}`);
    return response.data;
    
  } catch (error) {
    console.error('Error fetching lecture details:', error);
    throw error;
  }
};

// Instructor-specific API calls
export const fetchInstructorCourses = async () => {
  try {
    const response = await apiClient.get('/api/instructor/courses');
    return response.data;
  } catch (error) {
    console.error('Error fetching instructor courses:', error);
    throw error;
  }
};

export const createCourse = async (courseData) => {
  try {
    const response = await apiClient.post('/api/instructor/courses', courseData);
    return response.data;
  } catch (error) {
    console.error('Error creating course:', error);
    throw error;
  }
};

// Optimized course preview data - gets course + lectures in one call
export const fetchCoursePreviewData = async (courseId) => {
  try {
    const response = await apiClient.get(`/api/courses/${courseId}/preview`);
    return response.data;
  } catch (error) {
    console.error('Error fetching course preview data:', error);
    throw error;
  }
};

export const enrollInCourse = async (courseId) => {
  try {
    const response = await apiClient.post(`/api/courses/${courseId}/enroll`);
    return response.data;
  } catch (error) {
    console.error(`Error enrolling in course ID ${courseId}:`, error);
    throw error;
  }
};

export const updateUserProfile = async (userData) => {
  try {
    const response = await apiClient.put('/api/user/profile', userData);
    return response.data;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

export const fetchUserProfile = async () => {
  try {
    const response = await apiClient.get('/api/user/profile');
    return response.data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};

export const fetchEnrolledCourses = async () => {
  try {
    const response = await apiClient.get('/api/learner/courses');
    return response.data;
  } catch (error) {
    console.error('Error fetching enrolled courses:', error);
    throw error;
  }
};

export const fetchDashboardData = async () => {
  try {
    const response = await apiClient.get('/api/learner/dashboard');
    return response.data;
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    throw error;
  }
};

// Instructor dashboard API call
export const fetchInstructorDashboard = async (courseId = null) => {
  try {
    const url = courseId 
      ? `/api/instructor/dashboard?course_id=${courseId}`
      : '/api/instructor/dashboard';
    console.log('Fetching instructor dashboard from URL:', url);
    const response = await apiClient.get(url);
    console.log('Dashboard API response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching instructor dashboard:', error);
    throw error;
  }
};

// Quiz-related API calls
export const submitQuizAnswers = async (lectureId, { answers }) => {
  try {
    // Convert string keys to integers as expected by the backend
    const formattedAnswers = {};
    Object.entries(answers).forEach(([questionId, answer]) => {
      formattedAnswers[parseInt(questionId, 10)] = answer;
    });
    
    console.log("Formatted answers for backend:", formattedAnswers);
    
    const response = await apiClient.post(
      `/api/lectures/${lectureId}/quiz/submit`,
      { answers: formattedAnswers }
    );
    return response.data;
  } catch (error) {
    console.error('Error submitting quiz:', error);
    throw error;
  }
};

export const fetchQuizResults = async (lectureId) => {
  try {
    const response = await apiClient.get(`/api/lectures/${lectureId}/quiz/results`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching quiz results for lecture ID ${lectureId}:`, error);
    throw error;
  }
};

export const changePassword = async ({ currentPassword, newPassword }) => {
  try {
    const response = await apiClient.put('/api/learner/password', {
      current_password: currentPassword,
      new_password: newPassword
    });
    return response.data;
  } catch (error) {
    console.error('Error changing password:', error);
    throw error;
  }
};
