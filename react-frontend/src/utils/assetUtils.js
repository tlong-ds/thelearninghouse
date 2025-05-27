import config from '../config';

/**
 * Helper function to get the correct path for assets based on environment
 * This ensures assets work both in development and when deployed to GitHub Pages
 */
export const getAssetPath = (path) => {
  // Check if the path already starts with http or https
  if (path && (path.startsWith('http://') || path.startsWith('https://'))) {
    return path;
  }
  
  // Use the ASSETS_PATH from the config
  const basename = config.ASSETS_PATH;
  
  // If no basename or path doesn't start with /, return as is
  if (!basename || !path || !path.startsWith('/')) {
    return path;
  }
  
  // Otherwise prepend the basename
  return `${basename}${path}`;
};
