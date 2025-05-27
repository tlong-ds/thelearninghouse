import config from '../config';
import { getAssetPath } from './assetUtils';

// Default configuration as fallback
const defaultConfig = {
  apiUrl: config.API_URL,
  enableAnalytics: config.ENABLE_ANALYTICS,
  features: {
    chat: true,
    quizzes: true,
    certificates: true
  },
  maintenance: {
    enabled: false,
    message: ""
  },
  version: "1.0.0"
};

// Function to load runtime configuration
export const loadRuntimeConfig = async () => {
  try {
    const configPath = getAssetPath('/runtime-config.json');
    const response = await fetch(configPath);
    
    if (!response.ok) {
      console.warn('Failed to load runtime configuration, using defaults');
      return defaultConfig;
    }
    
    const runtimeConfig = await response.json();
    return { ...defaultConfig, ...runtimeConfig };
  } catch (error) {
    console.error('Error loading runtime configuration:', error);
    return defaultConfig;
  }
};
