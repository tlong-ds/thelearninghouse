/**
 * Helper function to get the correct path for assets based on environment
 * This ensures assets work both in development and when deployed to GitHub Pages
 */
export const getAssetPath = (path) => {
  // Check if the path already starts with http or https
  if (path && (path.startsWith('http://') || path.startsWith('https://'))) {
    return path;
  }
  
  // If in production, prepend the basename
  if (process.env.NODE_ENV === 'production') {
    // This should match the basename in your Router
    const basename = '/thelearninghouse';
    
    // If path already starts with /, don't add another one
    if (path && path.startsWith('/')) {
      return `${basename}${path}`;
    } else {
      return `${basename}/${path}`;
    }
  }
  
  // In development, return the path as is
  return path;
};
