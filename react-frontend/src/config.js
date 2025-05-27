// Configuration with environment variables

// Process environment variables with fallbacks
const config = {
  // API URL for backend services
  API_URL: process.env.REACT_APP_API_URL || 
    (process.env.NODE_ENV === 'production' 
      ? 'https://tlong-ds-thelearninghouse-api.hf.space' 
      : 'http://localhost:8503'),
  
  // Path prefix for assets when deployed on GitHub Pages
  ASSETS_PATH: process.env.REACT_APP_ASSETS_PATH || 
    (process.env.NODE_ENV === 'production' ? '/thelearninghowhouse' : ''),
  
  // App name for branding
  APP_NAME: process.env.REACT_APP_APP_NAME || 'The Learning House',
  
  // Feature flags
  ENABLE_ANALYTICS: process.env.REACT_APP_ENABLE_ANALYTICS === 'true',
  
  // Build information
  BUILD_TIME: process.env.REACT_APP_BUILD_TIME || 'development',
  
  // Determine if we're in production mode
  IS_PRODUCTION: process.env.NODE_ENV === 'production'
};

export default config;
