// Utility functions for formatting duration/time displays

/**
 * Formats duration into a user-friendly string
 * @param {string|number} duration - Duration in various formats (hours, "X hours", "X mins", etc.)
 * @returns {string} - Formatted duration string
 */
export const formatDuration = (duration) => {
  if (!duration) {
    return 'Self-paced';
  }

  // If duration is already a string, check if it's already formatted
  if (typeof duration === 'string') {
    const str = duration.toLowerCase().trim();
    
    // If it already contains time units, return as is
    if (str.includes('hour') || str.includes('min') || str.includes('week') || str.includes('day')) {
      return duration;
    }
    
    // If it's a number as string, convert to number
    const numValue = parseFloat(str);
    if (!isNaN(numValue)) {
      return formatHours(numValue);
    }
    
    // Return as is if it's already a descriptive string
    return duration;
  }

  // If duration is a number, assume it's in hours
  if (typeof duration === 'number') {
    return formatHours(duration);
  }

  return 'Self-paced';
};

/**
 * Formats hours into a readable string
 * @param {number} hours - Number of hours
 * @returns {string} - Formatted string (e.g., "2 hrs", "1.5 hrs", "30 mins")
 */
const formatHours = (hours) => {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} min${minutes !== 1 ? 's' : ''}`;
  } else if (hours === 1) {
    return '1 hr';
  } else if (hours < 10) {
    // Show decimal for hours less than 10
    return `${hours % 1 === 0 ? hours : hours.toFixed(1)} hrs`;
  } else {
    // Round to nearest hour for longer courses
    return `${Math.round(hours)} hrs`;
  }
};

/**
 * Formats estimated time with icon
 * @param {string|number} duration - Duration value
 * @returns {string} - Formatted duration with time icon
 */
export const formatDurationWithIcon = (duration) => {
  const formatted = formatDuration(duration);
  return `⏱️ ${formatted}`;
};
