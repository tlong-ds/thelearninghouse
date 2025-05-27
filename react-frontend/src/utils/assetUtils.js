import config from '../config';

/**
 * Helper function to get the correct path for assets based on environment
 * This ensures assets work both in development and when deployed to GitHub Pages
 */
export const getAssetPath = (path) => {
  // Check if the path already starts with http or https
  if (path && (path.startsWith('http://') || path.startsWith('https://'))) {
    console.log('getAssetPath: returning absolute URL:', path);
    return path;
  }

  // Remove any double slashes, except for http(s)://
  const cleanPath = path?.replace(/([^:])\/\//g, '$1/');

  // In development, use the path relative to the public folder
  if (!config.IS_PRODUCTION) {
    console.log('getAssetPath: development mode, returning:', cleanPath);
    return cleanPath;
  }
  
  // In production, use the ASSETS_PATH from the config
  const basename = config.ASSETS_PATH || '';
  
  // Construct the final path
  const finalPath = basename && cleanPath ? `${basename}${cleanPath}` : cleanPath;
  console.log('getAssetPath: production mode, returning:', finalPath);
  return finalPath;
};
